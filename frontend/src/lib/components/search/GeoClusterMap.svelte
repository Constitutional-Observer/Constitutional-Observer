<script>
  import { navigating } from "$app/state";
  import { untrack } from "svelte";
  import { TopicPipeline } from "$lib/topic-modelling/topic-pipeline.svelte.js";
  import { renderHighlight, chunkSnippet } from "$lib/highlight.js";
  import { topicHighlight } from "$lib/components/search/topic-highlight.svelte.js";
  import { RadvizPlot } from "$lib/components/search/radviz.svelte.js";

  const MIN_GROUP_DOCS = 4;

  const humanTerm = (term) => {
    const s = term.replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const hitTitle = (hit, i) => "On " + new Date (hit.year, hit.month, hit.day).toLocaleDateString("en-UK", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + " · " + String(hit._title).toLowerCase() || `Document ${i + 1}`;
  const hitExcerpt = (hit) => chunkSnippet(hit._matchedChunks?.[0]);
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

  let {
    hits = [],
    query = "",
    indices = [],
    onselect,
    paginationDone = true,
    radvizConfig = {},
  } = $props();

  const geo = new GeoGroups();

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

  // ── RadViz ───────────────────────────────────────────────────────────────
  // `rv` holds pane size, hover, and the draw config. Its output is in pane
  // pixels, shared by the SVG geometry and the HTML overlays.
  // Constructed bare so radvizConfig is tracked by the effect, not captured once.
  const rv = new RadvizPlot();
  $effect(() => rv.configure(radvizConfig));

  let radviz = $derived(
    selectedCluster && selectedPipeline
      ? selectedPipeline.radviz(selectedCluster.topic)
      : null,
  );
  let plot = $derived(rv.layoutFor(radviz));
  let labelCards = $derived(rv.cardsFor(plot));
  let floatingDoc = $derived(rv.floatingIn(plot, labelCards));


  // Resolved here, not in RadvizPlot: λ re-ranks anchor wording but must not
  // re-run the layout.
  let topicTerms = $derived(
    new Map(
      (selectedPipeline?.clusters || []).map((c) => [
        c.topic,
        c.terms.slice(0, 3).map((t) => humanTerm(t.term)).join(" · "),
      ]),
    ),
  );
  const anchorLabel = (topic) => topicTerms.get(topic) || `Topic ${topic + 1}`;

  // "68% this topic · also concerns Irrigation".
  function dotSubtitle(d) {
    const pct = `${Math.round(d.prob * 100)}% this topic`;
    return d.second === null || d.second === undefined
      ? `${pct} · nothing else`
      : `${pct} · also concerns ${anchorLabel(d.second)}`;
  }

  function selectTopic(groupKey, idx) {
    rv.hovered = null;
    rv.resetView();
    selectedTopic =
      selectedTopic?.groupKey === groupKey && selectedTopic?.idx === idx
        ? null
        : { groupKey, idx };
  }
  const isSelected = (groupKey, idx) =>
    selectedTopic?.groupKey === groupKey && selectedTopic?.idx === idx;
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape") { selectedTopic = null; openKey = null; rv.hovered = null; }
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
    <!-- count === 0 means no document clears TOPIC_MIN for this topic. It still
         anchors the plot, but there is nothing to open. -->
    <div class="gm-cell-topics">
      {#each pl.clusters as c, ci (c.topic)}
        {#if c.count > 0}
          <button
            class="gm-cell-topic"
            class:gm-cell-topic-selected={isSelected(g.key, ci)}
            title={`${c.count} docs`}
            onclick={() => selectTopic(g.key, ci)}
          >
            {c.terms.slice(0, 3).map((t) => humanTerm(t.term)).join(" · ")}
          </button>
        {/if}
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet docCard(d)}
  <div class="gm-card-title" title={dotSubtitle(d)}>{hitTitle(d.hit, d.idx)}</div>
  {#if hitExcerpt(d.hit)}
    <p class="gm-card-excerpt">{@html renderHighlight(hitExcerpt(d.hit), selectedClusterTerms)}</p>
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
        <button class="gm-zoom-btn" disabled={!rv.canZoomIn} title="Zoom in" onclick={() => rv.zoomIn()}>+</button>
        <button class="gm-zoom-btn" disabled={!rv.canZoomOut} title="Zoom out" onclick={() => rv.zoomOut()}>−</button>
        <button class="gm-zoom-btn" disabled={!rv.moved} title="Reset view" onclick={() => rv.resetView()}>⟲</button>
      </div>
      <button class="gm-clear" onclick={() => (selectedTopic = null)}>Clear ✕</button>
    {:else}
      <span class="gm-hint">
        Click a topic inside a cell to place its documents against the other topics.
      </span>
    {/if}
  </div>

<section class="geo-map" class:geo-map-radviz={!!selectedCluster}>
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
      <!-- Topic opened. Other topics become named anchors; the opened topic is the
           origin, so distance from centre is the share about something else. -->
      <div class="gm-radviz-wrap">
        <!-- Drag to pan, ctrl/⌘+wheel to zoom; a bare wheel still scrolls the page. -->
        <div
          class="gm-radviz"
          class:gm-radviz-dragging={rv.dragging}
          role="presentation"
          bind:clientWidth={rv.paneW} bind:clientHeight={rv.paneH}
          onwheel={(e) => rv.wheel(e)}
          onpointerdown={(e) => rv.pointerDown(e)}
          onpointermove={(e) => rv.pointerMove(e)}
          onpointerup={() => rv.pointerUp()}
          onpointercancel={() => rv.pointerUp()}
        >
          {#if plot}
            <svg class="gm-rv-svg" aria-hidden="true">
              <!-- Grid bleeds to the pane edges; one line per θ-share step. -->
              {#each plot.grid.cols as g (g.off)}
                <line class="gm-rv-grid" class:gm-rv-grid-marked={g.marked}
                      x1={plot.cx0 - g.off} y1={plot.grid.y0} x2={plot.cx0 - g.off} y2={plot.grid.y1} />
                <line class="gm-rv-grid" class:gm-rv-grid-marked={g.marked}
                      x1={plot.cx0 + g.off} y1={plot.grid.y0} x2={plot.cx0 + g.off} y2={plot.grid.y1} />
              {/each}
              {#each plot.grid.rows as g (g.off)}
                <line class="gm-rv-grid" class:gm-rv-grid-marked={g.marked}
                      x1={plot.grid.x0} y1={plot.cy0 - g.off} x2={plot.grid.x1} y2={plot.cy0 - g.off} />
                <line class="gm-rv-grid" class:gm-rv-grid-marked={g.marked}
                      x1={plot.grid.x0} y1={plot.cy0 + g.off} x2={plot.grid.x1} y2={plot.cy0 + g.off} />
              {/each}

              <line class="gm-rv-axis" x1={plot.grid.x0} y1={plot.cy0} x2={plot.grid.x1} y2={plot.cy0} />
              <line class="gm-rv-axis" x1={plot.cx0} y1={plot.grid.y0} x2={plot.cx0} y2={plot.grid.y1} />

              {#each plot.grid.cols as g (g.off)}
                {#if g.marked}
                  <line class="gm-rv-tick" x1={plot.cx0 + g.off} y1={plot.cy0 - plot.grid.tick}
                                           x2={plot.cx0 + g.off} y2={plot.cy0 + plot.grid.tick} />
                  <text class="gm-rv-tick-label" x={plot.cx0 + g.off} y={plot.cy0 + plot.grid.tick + 10}>
                    {g.pct}%
                  </text>
                  <line class="gm-rv-tick" x1={plot.cx0 - g.off} y1={plot.cy0 - plot.grid.tick}
                                           x2={plot.cx0 - g.off} y2={plot.cy0 + plot.grid.tick} />
                  <text class="gm-rv-tick-label" x={plot.cx0 - g.off} y={plot.cy0 + plot.grid.tick + 10}>
                    {g.pct}%
                  </text>
                {/if}
              {/each}

              {#each plot.anchors as a (a.topic)}
                <line class="gm-rv-spoke" x1={plot.cx0} y1={plot.cy0} x2={a.sx} y2={a.sy} />
              {/each}

              {#each labelCards as c (c.j)}
                <line class="gm-rv-leader" x1={c.px} y1={c.py} x2={c.ex} y2={c.ey} />
              {/each}

              {#each plot.dots as d (d.j)}
                <circle
                  class="gm-rv-dot"
                  class:gm-rv-dot-on={rv.hovered === d.j}
                  class:gm-rv-dot-solo={d.solo}
                  cx={d.px} cy={d.py} r={rv.markerRadius(d)}
                />
              {/each}

              {#each plot.dots as d (d.j)}
                <circle
                  class="gm-rv-hit"
                  cx={d.px} cy={d.py} r={d.rad + rv.cfg.marker.hitPad}
                  role="button" tabindex="-1"
                  aria-label={hitTitle(d.hit, d.idx)}
                  onmouseenter={() => rv.enter(d.j)}
                  onmouseleave={() => rv.leave(d.j)}
                  onclick={() => { if (rv.clickAllowed()) onselect?.(d.hit); }}
                  onkeydown={(e) => { if (e.key === "Enter") onselect?.(d.hit); }}
                />
              {/each}
            </svg>

            {#each plot.anchors as a (a.topic)}
              <span
                class="gm-rv-anchor"
                style="left: {a.ax}px; top: {a.ay}px; transform: translate({a.tx}, {a.ty});"
              >
                {anchorLabel(a.topic)}
              </span>
            {/each}

            {#each labelCards as c (c.j)}
              <div
                class="gm-card gm-card-placed"
                class:gm-card-on={rv.hovered === c.j}
                style="left: {c.lx}px; top: {c.ly}px; width: {c.w}px; height: {c.h}px;"
                role="button" tabindex="0"
                onmouseenter={() => rv.enter(c.j)}
                onmouseleave={() => rv.leave(c.j)}
                onclick={() => { if (rv.clickAllowed()) onselect?.(c.hit); }}
                onkeydown={(e) => { if (e.key === "Enter") onselect?.(c.hit); }}
              >
                {@render docCard(c)}
              </div>
            {/each}

            {#if floatingDoc}
              <div
                class="gm-card gm-card-float"
                style="left: {floatingDoc.px}px; top: {floatingDoc.py}px; --card-w: {rv.cfg.cards.width}px;"
              >
                {@render docCard(floatingDoc)}
              </div>
            {/if}

          {:else if rv.paneW > 0}
            <!-- K = 1 (no anchors) or pane too small for minRadius. -->
            <div class="gm-rv-fallback">
              {#each selectedCluster.items as it (it.j)}
                <button class="gm-cell-doc" onclick={() => onselect?.(it.hit)}>
                  {hitTitle(it.hit, it.idx)}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <p class="gm-radviz-caption">
          Each label around the edge is another topic in this source. A document's
          <strong>distance from the centre</strong> is how much of it is about something
          other than the topic you opened — the grid marks read that share off — and the
          <strong>direction</strong> says which topic that is. A <strong>hollow marker</strong>
          at the centre is a document about nothing else. <strong>Marker size</strong> is
          how much of the document is this topic. Drag to pan, ⌘/ctrl + scroll to zoom.
        </p>
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
  .gm-zoom-btn + .gm-zoom-btn { border-left: 1px solid rgba(0, 0, 0, 0.1); }
  .gm-zoom-btn:disabled { @apply text-black/25 cursor-default; background: rgba(255, 255, 255, 0.3); }
  .gm-clear { @apply text-[11px] px-2 py-0.5 rounded border border-primary/30 bg-white/60 text-black/70 cursor-pointer hover:bg-primary/20 shrink-0; }

  .gm-body {
    @apply relative grid border border-primary/20 p-1 h-full;
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

  .gm-radviz-wrap { @apply flex flex-col h-full min-h-0 gap-1; }
  .gm-radviz {
    @apply relative flex-1 min-h-0 rounded-md border border-primary/20 bg-white/70 overflow-hidden;
    cursor: grab; touch-action: none;
  }
  .gm-radviz-dragging { cursor: grabbing; }
  .gm-radviz-caption { @apply shrink-0 px-2 pb-0.5 text-[11px] leading-snug text-black/45; }
  .gm-radviz-caption strong { @apply font-semibold text-black/65; }
  .gm-rv-fallback { @apply flex flex-col gap-0.5 h-full overflow-y-auto p-2; }

  /* Above the cards so markers stay visible; only .gm-rv-hit takes the pointer. */
  .gm-rv-svg { @apply absolute inset-0 w-full h-full z-20 pointer-events-none; }
  .gm-rv-grid { stroke: rgba(139, 115, 85, 0.13); stroke-width: 1; }
  .gm-rv-grid-marked { stroke: rgba(139, 115, 85, 0.26); }
  .gm-rv-axis { stroke: rgba(139, 115, 85, 0.45); stroke-width: 1; }
  .gm-rv-tick { stroke: rgba(139, 115, 85, 0.6); stroke-width: 1.5; }
  .gm-rv-tick-label {
    @apply font-mono; font-size: 9px; fill: rgba(0, 0, 0, 0.35); text-anchor: middle;
    paint-order: stroke; stroke: rgba(255, 255, 255, 0.9); stroke-width: 3px;
  }
  .gm-rv-spoke { stroke: rgba(139, 115, 85, 0.16); stroke-width: 1; stroke-dasharray: 3 4; }
  .gm-rv-leader { stroke: rgba(0, 0, 0, 0.18); stroke-width: 1; stroke-dasharray: 3 3; }

  .gm-rv-dot { fill: #6b5335; stroke: rgba(255, 255, 255, 0.85); stroke-width: 1; }
  .gm-rv-dot-solo { fill: rgba(255, 255, 255, 0.9); stroke: #6b5335; stroke-width: 1.5; }
  .gm-rv-dot-on { fill: #b8860b; stroke: #6b5335; stroke-width: 2; }
  .gm-rv-hit { fill: transparent; cursor: pointer; pointer-events: all; }

  .gm-rv-anchor {
    @apply absolute z-30 max-w-[130px] text-center text-[10px] font-bold uppercase tracking-wide leading-tight;
    @apply px-1 pointer-events-none;
    color: #6b5335;
    text-shadow: 0 0 3px rgba(255, 255, 255, 0.95), 0 0 6px rgba(255, 255, 255, 0.9);
  }

  /* One card, two placements: fixed beside its marker, or floated at the cursor
     for a document with no placed card. */
  .gm-card {
    @apply absolute flex flex-col bg-white/95 rounded-md shadow-sm overflow-hidden text-left;
    border: 1px solid rgba(0, 0, 0, 0.12);
  }
  .gm-card-placed { @apply z-10 cursor-pointer ; }
  .gm-card-placed:hover, .gm-card-on { @apply bg-white shadow-lg z-30; border-color: #b8860b; }
  .gm-card-float {
    @apply z-40 pointer-events-none shadow-lg;
    width: var(--card-w, 196px); transform: translate(-50%, calc(-100% - 14px)); border-color: #b8860b;
  }

  .gm-card-title {
    @apply px-2 pt-1.5 pb-1 text-[1em] font-semibold capitalize text-black/80 leading-tight line-clamp-2 h-full;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }
  .gm-card-excerpt { @apply px-2 py-1 text-[0.82em] text-black/50 leading-snug line-clamp-5 h-full; }
  .gm-card-excerpt :global(strong) {
    background: rgba(251, 191, 36, 0.45); border-radius: 2px; padding: 0 1px; font-weight: inherit;
  }

  .gm-spin { @apply inline-block rounded-full shrink-0; width: 0.7rem; height: 0.7rem; border: 2px solid rgba(0,0,0,0.15); border-top-color: #c3b091; animation: gm-spin 0.7s linear infinite; }
  .gm-spin-lg { width: 1.6rem; height: 1.6rem; border-width: 3px; }
  @keyframes gm-spin { to { transform: rotate(360deg); } }

  .gm-loading { @apply absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 text-[12px] text-black/60 italic; background: rgba(240, 233, 218, 0.82); }

  @media (max-width: 768px) {
    .geo-map:not(.geo-map-radviz) { height: auto; max-height: 70dvh; overflow-y: auto; }
    .geo-map-radviz { @apply h-[80dvh]; }

    .gm-header { @apply px-2 py-2 gap-2; }
    .gm-zoom-btns { @apply ml-0; }
    .gm-card-float { width: min(var(--card-w, 196px), 84vw); }
    .gm-accordion-col {
      grid-column: 1 / -1;
      grid-row: auto;
      max-height: 240px;
    }
  }
</style>
