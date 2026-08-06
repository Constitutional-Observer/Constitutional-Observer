<script>
  import { navigating } from "$app/state";
  import { untrack, tick } from "svelte";
  import { TopicPipeline } from "$lib/topic-modelling/topic-pipeline.svelte.js";
  import { renderHighlight } from "$lib/highlight.js";
  import { topicHighlight } from "$lib/components/search/topic-highlight.svelte.js";

  import { select as d3select } from "d3-selection";
  import { zoom as d3zoom, zoomIdentity } from "d3-zoom";

  const MIN_GROUP_DOCS = 4;

  const humanTerm = (term) => {
    const s = term.replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  
  const hitTitle = (hit, i) => "On " + new Date (hit.year, hit.month, hit.day).toLocaleDateString("en-UK", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + " · " + String(hit._title).toLowerCase() || `Document ${i + 1}`;
  const hitExcerpt = (hit) => hit._matchedChunks?.[0]?.textHL || "";
  // Must agree with SearchApp's docKeyOf.
  const docKey = (hit) => hit._docId || String(hit?.id ?? "").replace(/_\d+$/, "");

  // Partitions hits into one group per source index, holds a TopicPipeline per
  // group, and models each in a sequential background queue (largest first).
  // Empty groups (0 docs) never get a grid cell — they always fall into the
  // accordion overflow. Past MAIN_CAP non-empty groups, the lowest-scored of
  // those overflow into the same accordion instead of growing the grid.
  class GeoGroups {
    static #MAIN_COLS = 5; // grid's 6 columns minus 1 reserved for the accordion
    static #MAIN_CAP = 12;

    groups = $state([]);
    cellGroups = $state([]);
    accordionGroups = $state([]);
    #pipelines = new Map();
    #queue = [];
    #running = false;
    #query = "";

    get overflowing() { return this.accordionGroups.length > 0; }
    get mainRows() { return Math.max(1, Math.ceil(this.cellGroups.length / GeoGroups.#MAIN_COLS)); }

    // Rebuilds the partition on every call so doc counts update live during
    // pagination; topic modelling only starts once readyToModel is true, so
    // LDA isn't restarted mid-pagination.
    build(hits, query, indices = [], readyToModel = true) {
      if (query !== this.#query) {
        for (const p of this.#pipelines.values()) p.reset();
      }
      this.#query = query;
      const meta = new Map(indices.map((i) => [i.uid, i]));
      const map = new Map();
      for (const hit of hits) {
        let e = map.get(hit._index);
        if (!e) {
          const m = meta.get(hit._index);
          e = { key: hit._index, label: m?.label || hit._index, annotation: m?.annotation || "", items: [] };
          map.set(hit._index, e);
        }
        e.items.push(hit);
      }
      for (const i of indices) {
        if (!map.has(i.uid))
          map.set(i.uid, { key: i.uid, label: i.label, annotation: i.annotation || "", items: [] });
      }
      const groups = [...map.values()].map((e) => {
        let p = this.#pipelines.get(e.key);
        if (!p) { p = new TopicPipeline(); this.#pipelines.set(e.key, p); }
        return { ...e, count: e.items.length, pipeline: p };
      });
      groups.sort((a, b) => a.label.localeCompare(b.label));
      this.groups = groups;

      const nonEmpty = groups.filter((g) => g.count > 0);
      const empty = groups.filter((g) => g.count === 0);

      let overflow;
      if (nonEmpty.length > GeoGroups.#MAIN_CAP) {
        const keep = new Set(
          [...nonEmpty].sort((a, b) => b.count - a.count).slice(0, GeoGroups.#MAIN_CAP).map((g) => g.key),
        );
        this.cellGroups = nonEmpty.filter((g) => keep.has(g.key));
        overflow = nonEmpty.filter((g) => !keep.has(g.key));
      } else {
        this.cellGroups = nonEmpty;
        overflow = [];
      }
      this.accordionGroups = [...overflow, ...empty].sort((a, b) => a.count - b.count);

      for (const k of [...this.#pipelines.keys()]) if (!map.has(k)) this.#pipelines.delete(k);
      if (readyToModel) this.#enqueue();
    }

    #enqueue() {
      // Display order is alphabetical; modelling still runs largest-first.
      this.#queue = this.groups
        .filter((g) => g.count >= MIN_GROUP_DOCS)
        .sort((a, b) => b.count - a.count);
      if (!this.#running) this.#drain();
    }
    async #drain() {
      this.#running = true;
      while (this.#queue.length) {
        const g = this.#queue.shift();
        await g.pipeline.model(g.items, this.#query, g.key);
      }
      this.#running = false;
    }
  }

  // Zoomable t-SNE canvas for one selected topic.
  class ClusterScatter {
    static #PAD = 32;
    static #SCALE_MIN = 0.2;
    static #SCALE_MAX = 4;

    hoveredCircle = $state(null);
    canvas        = $state(null);
    rect          = $state(null);
    transform     = $state({ x: 0, y: 0, k: 1 });
    items         = $state([]);
    #zoom = null;
    #dragMoved = false;

    attachZoom() {
      if (!this.canvas) return;
      this.#zoom = d3zoom()
        .scaleExtent([ClusterScatter.#SCALE_MIN, ClusterScatter.#SCALE_MAX])
        .filter((ev) => ev.type !== "wheel" || ev.ctrlKey)
        .on("start", () => { this.#dragMoved = false; })
        .on("zoom", (ev) => {
          if (ev.sourceEvent?.type !== "wheel") this.#dragMoved = true;
          this.transform = { x: ev.transform.x, y: ev.transform.y, k: ev.transform.k };
        });
      d3select(this.canvas).call(this.#zoom);
    }
    zoomBy(factor) {
      if (this.#zoom && this.canvas) d3select(this.canvas).call(this.#zoom.scaleBy, factor);
    }
    resetView() {
      if (this.#zoom && this.canvas) d3select(this.canvas).call(this.#zoom.transform, zoomIdentity);
      this.transform = { x: 0, y: 0, k: 1 };
    }

    #toPx(it, w, h) {
      const pad = ClusterScatter.#PAD;
      return {
        cx: (pad + it.nx * (w - pad * 2)) * this.transform.k + this.transform.x,
        cy: (pad + (1 - it.ny) * (h - pad * 2)) * this.transform.k + this.transform.y,
      };
    }
    pick(clientX, clientY) {
      if (!this.canvas) return null;
      const rect = this.canvas.getBoundingClientRect();
      const mx = clientX - rect.left, my = clientY - rect.top;
      let best = null, bestD = 400;
      for (const it of this.items) {
        const { cx, cy } = this.#toPx(it, rect.width, rect.height);
        const d = (cx - mx) ** 2 + (cy - my) ** 2;
        if (d < bestD) { bestD = d; best = { ...it, cx, cy }; }
      }
      return best;
    }
    onMove(e) {
      const p = this.pick(e.clientX, e.clientY);
      if (!p && this.hoveredCircle) { this.hoveredCircle = null; return; }
      if (p && (this.hoveredCircle?.j !== p.j || this.hoveredCircle?.cx !== p.cx || this.hoveredCircle?.cy !== p.cy))
        this.hoveredCircle = p;
    }
    onLeave() { this.hoveredCircle = null; }
    onClick(e, onselect) {
      if (this.#dragMoved) { this.#dragMoved = false; return; }
      const p = this.pick(e.clientX, e.clientY);
      if (p) onselect?.(p.hit);
    }

    draw() {
      if (!this.canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      const W = Math.max(1, Math.floor(w * dpr)), H = Math.max(1, Math.floor(h * dpr));
      if (this.canvas.width !== W) this.canvas.width = W;
      if (this.canvas.height !== H) this.canvas.height = H;

      const ctx = this.canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      for (const it of this.items) {
        const { cx, cy } = this.#toPx(it, w, h);
        const radius = 3 + Math.min(6, it.prob * 8);
        const hover = this.hoveredCircle?.j === it.j;
        ctx.beginPath();
        ctx.arc(cx, cy, hover ? radius + 2 : radius, 0, Math.PI * 2);
        ctx.fillStyle = hover ? "rgba(184,134,11,1)" : "rgba(0,0,0,0.62)";
        ctx.fill();
        ctx.lineWidth = hover ? 2 : 0.8;
        ctx.strokeStyle = hover ? "#6b5335" : "rgba(0,0,0,0.25)";
        ctx.stroke();
      }
      if (!this.rect || this.rect.width !== w || this.rect.height !== h) {
        this.rect = { width: w, height: h };
      }
    }

    // Greedy label placement for the highest-probability documents.
    computeLabels() {
      if (!this.rect || !this.items.length) return [];
      const { width: w, height: h } = this.rect;
      const tr = this.transform, pad = ClusterScatter.#PAD;
      const N = 80, LW = 200, LH = 78, GAP = 6;
      const placed = [], result = [];
      for (let rank = 0; rank < Math.min(N, this.items.length); rank++) {
        const it = this.items[rank];
        const cx = (pad + it.nx * (w - pad * 2)) * tr.k + tr.x;
        const cy = (pad + (1 - it.ny) * (h - pad * 2)) * tr.k + tr.y;
        if (cx < -LW || cx > w + LW || cy < -LH || cy > h + LH) continue;
        const dotR = 3 + Math.min(6, it.prob * 8) + GAP;
        const candidates = [
          { ox: dotR, oy: -LH / 2 }, { ox: -LW - dotR, oy: -LH / 2 },
          { ox: -LW / 2, oy: -LH - dotR }, { ox: -LW / 2, oy: dotR },
          { ox: dotR, oy: dotR }, { ox: -LW - dotR, oy: dotR },
        ];
        let pos = null;
        for (const { ox, oy } of candidates) {
          const lx = cx + ox, ly = cy + oy;
          if (lx < 2 || lx + LW > w - 2 || ly < 2 || ly + LH > h - 2) continue;
          if (placed.every((p) => lx + LW < p.x || lx > p.x + p.w || ly + LH < p.y || ly > p.y + p.h)) {
            pos = { lx, ly }; break;
          }
        }
        if (!pos) continue;
        placed.push({ x: pos.lx, y: pos.ly, w: LW, h: LH });
        result.push({ j: it.j, idx: it.idx, hit: it.hit, rank, cx, cy, lx: pos.lx, ly: pos.ly });
      }
      return result;
    }
  }

  let {
    hits = [],
    query = "",
    indices = [],
    onselect,
    paginationDone = true,
  } = $props();

  const geo = new GeoGroups();
  const scatter = new ClusterScatter();

  // Hovering a square opens (and grows) it; it closes on mouseleave of the grid.
  let openKey = $state(null);
  let selectedTopic = $state(null); // { groupKey, idx } | null

  let selectedGroup = $derived(
    selectedTopic ? geo.groups.find((g) => g.key === selectedTopic.groupKey) || null : null,
  );
  let selectedPipeline = $derived(selectedGroup?.pipeline || null);
  let selectedCluster = $derived(
    selectedGroup ? selectedGroup.pipeline.clusters[selectedTopic.idx] || null : null,
  );
  let selectedClusterTerms = $derived((selectedCluster?.terms || []).map((t) => t.term));

  let loading = $derived(!!navigating.to);

  $effect(() => {
    hits; query; indices; paginationDone;
    untrack(() => geo.build(hits, query, indices, paginationDone));
  });

  // termsByDoc unions terms across a doc's member topics, so highlighting
  // isn't limited to just one.
  $effect(() => {
    const terms = {};
    const topics = {};
    for (const g of geo.groups) {
      for (const { hit, topics: ts } of g.pipeline.docTopics) {
        const key = docKey(hit);
        topics[key] = ts;
        const seen = new Set();
        const union = [];
        for (const t of ts)
          for (const term of t.terms)
            if (!seen.has(term)) { seen.add(term); union.push(term); }
        terms[key] = union;
      }
    }
    topicHighlight.termsByDoc = terms;
    topicHighlight.topicsByDoc = topics;
  });

  $effect(() => {
    topicHighlight.docKeys = selectedCluster
      ? new Set(selectedCluster.items.map((it) => docKey(it.hit)))
      : null;
  });

  $effect(() => {
    const p = selectedPipeline;
    if (p) untrack(() => p.project());
  });

  $effect(() => {
    const c = selectedCluster;
    const projected = selectedPipeline?.projected;
    scatter.items = c && projected ? c.items : [];
  });

  $effect(() => { if (scatter.canvas) untrack(() => scatter.attachZoom()); });
  $effect(() => {
    scatter.items; scatter.transform; scatter.hoveredCircle;
    if (!scatter.canvas) return;
    tick().then(() => scatter.draw());
  });

  let scatterLabels = $derived.by(() => {
    scatter.items; scatter.transform; scatter.rect;
    return scatter.computeLabels();
  });

  function selectTopic(groupKey, idx) {
    selectedTopic =
      selectedTopic?.groupKey === groupKey && selectedTopic?.idx === idx
        ? null
        : { groupKey, idx };
    scatter.resetView();
  }
  const isSelected = (groupKey, idx) =>
    selectedTopic?.groupKey === groupKey && selectedTopic?.idx === idx;
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape") { selectedTopic = null; openKey = null; }
  }}
/>


{#snippet groupStatus(g)}
  {@const pl = g.pipeline}
  {#if g.count === 0}
    <span class="gm-cell-note">no results</span>
  {:else if g.count < MIN_GROUP_DOCS}
    <span class="gm-cell-note">too few to model</span>
    <div class="gm-cell-docs">
      {#each g.items as hit, i (hit.id || i)}
        <button class="gm-cell-doc" onclick={() => onselect?.(hit)}>
          {hitTitle(hit, i)}
        </button>
      {/each}
    </div>
  {:else if !paginationDone}
    <span class="gm-cell-note"><span class="gm-spin"></span>counting…</span>
  {:else if pl.topicCount === 0}
    <span class="gm-cell-note"><span class="gm-spin"></span>modelling…</span>
  {:else}
    <div class="gm-cell-topics">
      {#each pl.clusters as c, ci (c.topic)}
        <button
          class="gm-cell-topic"
          class:gm-cell-topic-selected={isSelected(g.key, ci)}
          title={`${c.count} docs`}
          onclick={() => selectTopic(g.key, ci)}
        >
          {c.terms.slice(0, 3).map((t) => humanTerm(t.term)).join(" · ")}
        </button>
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet cellBody(g)}
  <div class="gm-cell-head">
    <span class="gm-cell-name">{g.label}</span>
    <span class="gm-cell-count">{g.count}</span>
  </div>
  {@render groupStatus(g)}
{/snippet}

<div class="gm-header">
    <h2 class="">Search Results {#if selectedGroup} within { selectedGroup.label} {/if}</h2>
    {#if selectedCluster}
      <h3 class="gm-open-terms">
        {#each (selectedCluster.terms || []).slice(0, 8) as t (t.term)}
          <span class="gm-open-term">{humanTerm(t.term)}</span>
        {/each}
      </h3>
      <span class="gm-open-meta">{selectedGroup?.label} · {selectedCluster.count} docs</span>
      <div class="gm-zoom-btns">
        <button class="gm-zoom-btn" onclick={() => scatter.zoomBy(1.4)}>+</button>
        <button class="gm-zoom-btn" onclick={() => scatter.zoomBy(1 / 1.4)}>−</button>
        <button class="gm-zoom-btn" onclick={() => scatter.resetView()}>⟲</button>
      </div>
      <button class="gm-clear" onclick={() => (selectedTopic = null)}>Clear ✕</button>
    {:else}
      <span class="gm-hint">
        Click a topic inside a cell to project its documents.
      </span>
    {/if}
  </div>

<section class="geo-map" class:geo-map-scatter={!!selectedCluster}>
  <div class="gm-body">
    {#if !selectedCluster}
      <div
        class="gm-grid-pane"
        class:gm-grid-pane-overflow={geo.overflowing}
        onmouseleave={() => (openKey = null)}
      >
        {#each geo.cellGroups as g (g.key)}
          <div
            class="gm-cell"
            class:gm-cell-open={g.key === openKey}
            class:gm-cell-selected={selectedGroup?.key === g.key}
            title={`${g.label} · ${g.count} docs${g.annotation ? `\n\n${g.annotation}` : ""}`}
            onmouseenter={() => (openKey = g.key)}
          >
            {@render cellBody(g)}
          </div>
        {/each}

        {#if geo.overflowing}
          <div class="gm-accordion-col">
            <span class="gm-accordion-head">{geo.accordionGroups.length} more sources</span>
            <div class="gm-accordion-list">
              {#each geo.accordionGroups as g (g.key)}
                <details class="gm-accordion-item">
                  <summary class="gm-accordion-summary">
                    <span class="gm-accordion-label">{g.label}</span>
                    <span class="gm-accordion-count">{g.count === 0 ? "no results" : g.count}</span>
                  </summary>
                  <div class="gm-accordion-body">
                    {@render groupStatus(g)}
                  </div>
                </details>
              {/each}
            </div>
          </div>
        {/if}
      </div>

    {:else}
      <!-- Accordion expanded: the t-SNE projection takes the full width. -->
      <div class="gm-right gm-right-full">
        <div class="gm-scatter">
          {#if selectedPipeline?.projecting || !selectedPipeline?.projected}
            <div class="gm-scatter-loading">
              <span class="gm-spin gm-spin-lg"></span><span>Projecting cluster…</span>
            </div>
          {/if}
          <canvas
            bind:this={scatter.canvas}
            class="gm-scatter-canvas"
            onmousemove={(e) => scatter.onMove(e)}
            onmouseleave={() => scatter.onLeave()}
            onclick={(e) => scatter.onClick(e, onselect)}
          ></canvas>

          <svg class="gm-scatter-leaders" aria-hidden="true">
            {#each scatterLabels as r (r.j)}
              <line x1={r.cx} y1={r.cy} x2={r.lx < r.cx ? r.lx + 200 : r.lx} y2={r.ly + 10} class="gm-scatter-leader" />
            {/each}
          </svg>

          {#each scatterLabels as r (r.j)}
            <div
              class="gm-label-card"
              style="left: {r.lx}px; top: {r.ly}px"
              role="button" tabindex="0"
              onclick={(e) => { e.stopPropagation(); onselect?.(r.hit); }}
              onkeydown={(e) => { if (e.key === "Enter") onselect?.(r.hit); }}
            >
              <div class="gm-label-title">{hitTitle(r.hit, r.idx)}</div>
              {#if hitExcerpt(r.hit)}
                <p class="gm-label-excerpt">{@html renderHighlight(hitExcerpt(r.hit), selectedClusterTerms)}</p>
              {/if}
            </div>
          {/each}

          {#if scatter.hoveredCircle}
            {@const hov = scatter.hoveredCircle}
            <div class="gm-hover-tip" style="left: {hov.cx}px; top: {hov.cy}px">
              <div class="gm-tip-title">{hitTitle(hov.hit, hov.idx)}</div>
              {#if hitExcerpt(hov.hit)}
                <p class="gm-tip-excerpt">{@html renderHighlight(hitExcerpt(hov.hit), selectedClusterTerms)}</p>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if loading}
      <div class="gm-loading"><span class="gm-spin gm-spin-lg"></span><span>Loading results…</span></div>
    {/if}
  </div>
</section>

<style lang="postcss">
  @reference "../../../app.css";

  .geo-map {
    @apply relative mb-3 grid bg-primary backdrop-blur-sm border border-primary/30 h-[80dvh];
  }
  .gm-header { @apply flex items-center gap-3 px-3 py-4 border-b border-primary/20 flex-wrap; }
  .gm-hint { @apply text-[10px] text-black/45 italic; }
  .gm-open-terms { @apply flex flex-wrap gap-1 text-sm; }
  .gm-open-term { @apply font-semibold px-1.5 py-0.5 rounded bg-black/10 text-black/70 text-[11px]; }
  .gm-open-meta { @apply text-[10px] text-black/50 font-mono; }
  .gm-zoom-btns { @apply flex items-center rounded border border-primary/30 overflow-hidden ml-auto; }
  .gm-zoom-btn { @apply text-[13px] px-2 py-0.5 bg-white/60 text-black/70 cursor-pointer leading-none hover:bg-primary/20; border: none; }
  .gm-zoom-btn + .gm-zoom-btn { border-left: 1px solid rgba(0,0,0,0.1); }
  .gm-clear { @apply text-[11px] px-2 py-0.5 rounded border border-primary/30 bg-white/60 text-black/70 cursor-pointer hover:bg-primary/20 shrink-0; }

  .gm-body {
    @apply relative grid border border-primary/20 m-1 h-full;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }

  .gm-grid-pane { @apply grid content-start gap-2 overflow-y-auto grid-cols-2 md:grid-cols-6 h-full min-h-0; }



  .gm-cell { @apply relative flex flex-col text-left p-1.5 transition-all overflow-hidden h-[160px] md:h-[200px] bg-white/50; border: 5px solid rgba(139, 115, 85, 0.8); }
  .gm-cell:hover { @apply shadow-sm; border-color: rgba(139, 115, 85, 0.55); }
  .gm-cell-open { border-color: rgba(139, 115, 85, 0.8); transform: scale(1.02); z-index: 5; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22); }
  .gm-cell-selected { border-color: #b8860b !important; box-shadow: 0 0 0 2px rgba(184, 134, 11, 0.4); }

  .gm-accordion-col {
    @apply flex flex-col gap-1.5 overflow-y-auto min-h-0 min-w-0 rounded-md border border-primary/20 bg-white/40 p-1.5;
    /* -1 as a start line can't span backwards and falls into a new implicit
       column; "span 1 / -1" correctly lands in the real last column. */
    grid-column: span 1 / -1;
  }
  .gm-accordion-head { @apply text-[0.8em] font-bold uppercase tracking-wider text-black/40 px-0.5; }
  .gm-accordion-list { @apply flex flex-col gap-1 overflow-y-auto; }
  .gm-accordion-item { @apply rounded border border-primary/15 bg-white/60; }
  .gm-accordion-summary { @apply flex items-center justify-between gap-1 px-1.5 py-1 text-[10px] font-semibold text-black/70 cursor-pointer list-none; }
  .gm-accordion-summary::-webkit-details-marker { display: none; }
  .gm-accordion-count { @apply font-mono text-black/40 shrink-0; }
  .gm-accordion-body { @apply px-1.5 pb-1.5; }

  .gm-cell-head { @apply flex items-start justify-between gap-1 shrink-0; }
  .gm-cell-name { @apply text-[0.9em] font-bold text-black/80 leading-tight pb-2 line-clamp-2; }
  .gm-cell-count { @apply text-[12px] font-mono font-bold text-black/60 leading-none shrink-0; }
  .gm-cell-note { @apply flex items-center gap-1 text-[12px] text-black/40 italic; }

  .gm-cell-topics { @apply flex flex-col flex-1 min-h-0 gap-0.5 overflow-y-auto -mr-1 pr-1; }
  .gm-cell-topic {
    @apply text-left text-[0.9em] leading-tight px-1 py-0.5 rounded cursor-pointer transition-colors shrink-0;
    @apply bg-primary/50 text-black/65 hover:bg-white/90 hover:text-black/85;
    border: 1px solid transparent;
  }
  .gm-cell-topic-selected { @apply bg-white text-black/85 font-semibold; border-color: #b8860b; }

  .gm-cell-docs { @apply flex flex-col flex-1 min-h-0 gap-0.5 overflow-y-auto -mr-1 pr-1; }
  .gm-cell-doc {
    @apply text-left text-[0.85em] leading-tight px-1 py-0.5 rounded cursor-pointer transition-colors shrink-0 truncate;
    @apply bg-white/40 text-black/60 hover:bg-white/90 hover:text-black/85;
    border: 1px solid transparent;
  }

  .gm-right { @apply relative flex-1 rounded-md border border-primary/20 bg-white/70 h-full; }
  .gm-right-full { @apply w-full h-full; }

  .gm-scatter { @apply absolute inset-0 overflow-hidden; }
  .gm-scatter-canvas { @apply absolute inset-0 w-full h-full; cursor: grab; touch-action: none; }
  .gm-scatter-canvas:active { cursor: grabbing; }
  .gm-scatter-loading { @apply absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 text-[12px] text-black/55 italic; background: rgba(255,255,255,0.7); }
  .gm-scatter-leaders { @apply absolute inset-0 w-full h-full pointer-events-none; z-index: 5; }
  .gm-scatter-leader { stroke: rgba(0,0,0,0.2); stroke-width: 1; stroke-dasharray: 3 3; fill: none; }

  .gm-label-card { @apply absolute z-10 bg-white/95 rounded-md shadow-sm cursor-pointer overflow-hidden text-[1em] text-left; border: 1px solid rgba(0,0,0,0.12); width: 200px; }
  .gm-label-card:hover { @apply bg-white shadow-lg z-30; border-color: rgba(0,0,0,0.22); }
  .gm-label-title { @apply px-2 pt-1.5 pb-1 text-[1em] whitespace-pre-wrap font-semibold capitalize text-black/80 leading-tight truncate; border-bottom: 1px solid rgba(0,0,0,0.06); }
  .gm-label-excerpt { @apply px-2 py-1.5 text-[0.78em] text-black/50 leading-snug line-clamp-[10]; }
  .gm-label-excerpt :global(strong), .gm-tip-excerpt :global(strong) {
    background: rgba(251, 191, 36, 0.45); border-radius: 2px; padding: 0 1px; font-weight: inherit;
  }

  .gm-hover-tip {
    @apply absolute rounded bg-white/95 border border-primary/30 shadow-sm pointer-events-none z-20;
    max-width: 280px; transform: translate(-50%, calc(-100% - 10px));
  }
  .gm-tip-title { @apply px-2.5 pt-2 pb-1 text-[1em] font-semibold text-black/80 leading-tight; }
  .gm-tip-excerpt {
    @apply px-2.5 pb-2 text-[0.78em] text-black/55 leading-snug line-clamp-4;
    border-top: 1px solid rgba(0,0,0,0.06); padding-top: 5px; margin-top: 0;
  }

  .gm-spin { @apply inline-block rounded-full shrink-0; width: 0.7rem; height: 0.7rem; border: 2px solid rgba(0,0,0,0.15); border-top-color: #c3b091; animation: gm-spin 0.7s linear infinite; }
  .gm-spin-lg { width: 1.6rem; height: 1.6rem; border-width: 3px; }
  @keyframes gm-spin { to { transform: rotate(360deg); } }

  .gm-loading { @apply absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 text-[12px] text-black/60 italic; background: rgba(240, 233, 218, 0.82); }

  @media (max-width: 768px) {
    .geo-map:not(.geo-map-scatter) { height: auto; max-height: 70dvh; overflow-y: auto; }
    .geo-map-scatter { @apply h-[60dvh]; }

    .gm-header { @apply px-2 py-2 gap-2; }
    .gm-zoom-btns { @apply ml-0; }
    .gm-label-card { width: min(200px, 78vw); }
    .gm-hover-tip { max-width: min(280px, 82vw); }
    .gm-accordion-col {
      grid-column: 1 / -1;
      grid-row: auto;
      max-height: 240px;
    }
  }
</style>
