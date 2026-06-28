<script>
  import { browser } from "$app/environment";
  import { navigating } from "$app/state";
  import { untrack, tick } from "svelte";
  import { TopicPipeline } from "$lib/topic-modelling/topic-pipeline.svelte.js";
  import { states, toSvgCoords } from "$lib/data/india-states.js";
  import { renderHighlight } from "$lib/highlight.js";
  import { topicHighlight } from "$lib/components/search/topic-highlight.svelte.js";

  import { select as d3select } from "d3-selection";
  import { zoom as d3zoom, zoomIdentity } from "d3-zoom";

  // SVG coordinate space of the India map (matches india-states.js / IndiaMap).
  const MAP_W = 360, MAP_H = 390;
  const MIN_GROUP_DOCS = 4;

  // National bodies have no state — anchored near Delhi (the seat of the central
  // institutions), with small offsets so the four don't land on one point. The
  // greedy card placement spreads their boxes around that anchor.
  const DELHI = toSvgCoords(28.7, 77.1);
  const NATIONAL_ANCHORS = {
    "Lok Sabha":            { x: DELHI.x - 6, y: DELHI.y - 4 },
    "Rajya Sabha":          { x: DELHI.x + 6, y: DELHI.y - 4 },
    "Constituent Assembly": { x: DELHI.x - 6, y: DELHI.y + 4 },
    "Court Judgements":     { x: DELHI.x + 6, y: DELHI.y + 4 },
  };
  const NATIONAL_FALLBACK = { x: DELHI.x, y: DELHI.y + 10 };

  const humanTerm = (term) => {
    const s = term.replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const hitTitle = (hit, i) => hit.title_en || hit.subject || `Document ${i + 1}`;
  const hitExcerpt = (hit) =>
    hit._matchedChunks?.[0]?.textHL ||
    hit._matchedChunks?.[0]?.text ||
    hit._formatted?.__discussions ||
    hit.__discussions ||
    "";
  const docKey = (hit) => `${hit._index || hit.state_code}:${hit.file_name}`;

  // Which geo group a hit belongs to, and where it sits on the map. State
  // legislatures and high courts are placed at their state; the national houses
  // sit at fixed anchors.
  function groupOf(hit) {
    const col = hit._collection || "Other";
    const st = hit.state && states[hit.state] ? hit.state : null;

    if (col === "State Legislatures") {
      if (st) {
        const { x, y } = toSvgCoords(states[st].lat, states[st].lng);
        return { key: `assembly:${st}`, label: `${st} · Assembly`, type: "state", state: st, code: states[st].code, x, y };
      }
      return { key: "assembly:other", label: "Other Assemblies", type: "national", ...NATIONAL_FALLBACK };
    }
    if (col === "Court Judgements") {
      if (st) {
        const { x, y } = toSvgCoords(states[st].lat, states[st].lng);
        return { key: `court:${st}`, label: `${st} · High Court`, type: "state", state: st, code: states[st].code, x, y };
      }
      return { key: "court:national", label: "Court Judgements", type: "national", ...(NATIONAL_ANCHORS["Court Judgements"]) };
    }
    const anchor = NATIONAL_ANCHORS[col] || NATIONAL_FALLBACK;
    return { key: `nat:${col}`, label: col, type: "national", x: anchor.x, y: anchor.y };
  }

  // ── GeoGroups ── partition hits, hold a pipeline per group, model lazily ──
  // Each group's LDA runs in a sequential background queue (largest first) so
  // the page never freezes; boxes fill in as their model completes. t-SNE is
  // NOT run here — only when a cluster box is opened.
  class GeoGroups {
    groups = $state([]);
    #pipelines = new Map();
    #queue = [];
    #running = false;
    #query = "";

    build(hits, query) {
      this.#query = query;
      const map = new Map();
      for (const hit of hits) {
        const g = groupOf(hit);
        let e = map.get(g.key);
        if (!e) { e = { ...g, items: [] }; map.set(g.key, e); }
        e.items.push(hit);
      }
      const groups = [...map.values()].map((e) => {
        let p = this.#pipelines.get(e.key);
        if (!p) { p = new TopicPipeline(); this.#pipelines.set(e.key, p); }
        return { ...e, count: e.items.length, pipeline: p };
      });
      groups.sort((a, b) => b.count - a.count);
      this.groups = groups;
      for (const k of [...this.#pipelines.keys()]) if (!map.has(k)) this.#pipelines.delete(k);
      this.#enqueue();
    }

    #enqueue() {
      this.#queue = this.groups.filter((g) => g.count >= MIN_GROUP_DOCS);
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

  // ── ClusterScatter ── zoomable t-SNE canvas for ONE opened cluster ────────
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
        if (d < bestD) { bestD = d; best = it; }
      }
      return best;
    }
    onMove(e) {
      const p = this.pick(e.clientX, e.clientY);
      if (!p && this.hoveredCircle) { this.hoveredCircle = null; return; }
      if (p && this.hoveredCircle?.j !== p.j) this.hoveredCircle = p;
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
        ctx.fillStyle = hover ? "rgba(0,0,0,1)" : "rgba(0,0,0,0.65)";
        ctx.fill();
        ctx.lineWidth = hover ? 2 : 0.8;
        ctx.strokeStyle = hover ? "#000" : "rgba(0,0,0,0.25)";
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
      const N = 80, LW = 200, LH = 80, GAP = 6;
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
    onselect,
    paginationDone = true,
  } = $props();

  const geo = new GeoGroups();
  const scatter = new ClusterScatter();

  // The opened cluster: which group + which cluster index within it. null = the
  // geo overview (no scatter). λ is shared across the opened group.
  let openGroupKey = $state(null);
  let openClusterIdx = $state(null);
  let containerW = $state(0);
  let containerH = $state(0);

  let openGroup = $derived(geo.groups.find((g) => g.key === openGroupKey) || null);
  let openPipeline = $derived(openGroup?.pipeline || null);
  let openCluster = $derived(
    openPipeline && openClusterIdx != null ? openPipeline.clusters[openClusterIdx] : null,
  );
  let selectedClusterTerms = $derived((openCluster?.terms || []).map((t) => t.term));

  let loading = $derived(!!navigating.to || !paginationDone);

  // (Re)build groups whenever the final result set is ready.
  $effect(() => {
    hits; query; paginationDone;
    if (!paginationDone) return;
    untrack(() => geo.build(hits, query));
  });

  // Map every modeled document (across all groups) to its dominant cluster's
  // λ-ranked terms, for highlighting in the result list / detail panel.
  $effect(() => {
    const next = {};
    for (const g of geo.groups) {
      for (const c of g.pipeline.clusters) {
        const terms = c.terms.map((t) => t.term);
        for (const it of c.items) next[docKey(it.hit)] = terms;
      }
    }
    topicHighlight.termsByDoc = next;
  });

  // Restrict the result list to the opened cluster's documents.
  $effect(() => {
    topicHighlight.docKeys = openCluster
      ? new Set(openCluster.items.map((it) => docKey(it.hit)))
      : null;
  });

  const COLLAPSED_CLUSTERS = 2;   // cards show this many topics, then accordion

  // Everything lives on one large pannable/zoomable plane. The India map sits at
  // a fixed rectangle in the centre of the plane; cluster cards are placed right
  // next to their map anchor (states at their location, central bodies near
  // Delhi). The plane is bigger than the viewport so cards have room — the user
  // pans/zooms to explore.
  const PLANE_W = 1680, PLANE_H = 1480;
  const MAP_PLANE_W = 540;
  const MAP_PLANE_H = MAP_PLANE_W * (MAP_H / MAP_W);
  const MAP_X0 = (PLANE_W - MAP_PLANE_W) / 2;
  const MAP_Y0 = (PLANE_H - MAP_PLANE_H) / 2;
  const BOX_W = 168;

  const anchorPx = (g) => ({
    ax: MAP_X0 + (g.x / MAP_W) * MAP_PLANE_W,
    ay: MAP_Y0 + (g.y / MAP_H) * MAP_PLANE_H,
  });

  // Cards are accordions: only the first COLLAPSED_CLUSTERS topics show until
  // the group is expanded. Keyed by group key.
  let expandedGroups = $state(new Set());
  const isExpanded = (key) => expandedGroups.has(key);
  function toggleExpanded(key) {
    const next = new Set(expandedGroups);
    next.has(key) ? next.delete(key) : next.add(key);
    expandedGroups = next;
  }
  const visibleClusterCount = (g) => {
    const n = g.pipeline.topicCount;
    return isExpanded(g.key) ? n : Math.min(COLLAPSED_CLUSTERS, n);
  };

  // Height estimate (head + visible grid rows + accordion toggle) used to size
  // the ring slot before the DOM measures the card.
  function boxHeight(g) {
    const n = g.pipeline.topicCount;
    if (g.count < MIN_GROUP_DOCS || n === 0) return 40;
    const rows = Math.ceil(visibleClusterCount(g) / 2);
    return 24 + rows * 30 + (n > COLLAPSED_CLUSTERS ? 18 : 0) + 6;
  }

  // Cards fill the empty space NEAR the dots. A grid covers the map (plus a
  // margin); cells close to any anchor — i.e. over the landmass/labels — are
  // reserved, and every other cell (open sea like the Bay of Bengal, inter-state
  // gaps, the exterior) is a free slot. Each group claims the nearest free slot
  // to its anchor, so a southern state can sit in the open water right beside it.
  const CELL_W = BOX_W + 14;   // ~one card wide
  const CELL_H = 112;          // ~one collapsed card tall
  const RESERVE_R = 100;       // keep slots this far from any dot (landmass halo)
  const AREA_MARGIN = BOX_W;   // how far outside the map the grid extends

  let placedGroups = $derived.by(() => {
    geo.groups; expandedGroups; // reactive deps
    const groups = geo.groups;
    if (!groups.length) return [];
    const anchors = groups.map((g) => anchorPx(g));

    const gx0 = MAP_X0 - AREA_MARGIN, gy0 = MAP_Y0 - AREA_MARGIN;
    const cols = Math.ceil((MAP_PLANE_W + 2 * AREA_MARGIN) / CELL_W);
    const rows = Math.ceil((MAP_PLANE_H + 2 * AREA_MARGIN) / CELL_H);
    const R2 = RESERVE_R * RESERVE_R;

    // Free slots = cells whose centre is clear of every dot.
    const slots = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const sx = gx0 + (c + 0.5) * CELL_W, sy = gy0 + (r + 0.5) * CELL_H;
        if (anchors.some((a) => (a.ax - sx) ** 2 + (a.ay - sy) ** 2 < R2)) continue;
        slots.push({ cx: sx, cy: sy, used: false });
      }

    const result = [];
    for (const g of [...groups].sort((a, b) => b.count - a.count)) {
      const { ax, ay } = anchorPx(g);
      let best = null, bd = Infinity;
      for (const s of slots) {
        if (s.used) continue;
        const d = (s.cx - ax) ** 2 + (s.cy - ay) ** 2;
        if (d < bd) { bd = d; best = s; }
      }
      if (!best) break;
      best.used = true;
      const bh = boxHeight(g);
      const bx = best.cx - BOX_W / 2, by = best.cy - bh / 2;
      // Leader port = point on the card rect nearest the anchor (shortest line).
      const lx2 = Math.max(bx, Math.min(ax, bx + BOX_W));
      const ly2 = Math.max(by, Math.min(ay, by + bh));
      result.push({ group: g, ax, ay, bx, by, bw: BOX_W, bh, lx2, ly2 });
    }
    return result;
  });

  // ── Pan / zoom of the whole plane (d3-zoom on the viewport) ───────────────
  let planeEl = $state(null);
  let plane = $state({ x: 0, y: 0, k: 1 });
  let planeZoom = null;
  let planeReady = false;

  function planeFitTransform() {
    const w = containerW || 800, h = containerH || 600;
    const k0 = Math.max(0.4, Math.min(1.1, (h * 0.82) / MAP_PLANE_H));
    const cx = MAP_X0 + MAP_PLANE_W / 2, cy = MAP_Y0 + MAP_PLANE_H / 2;
    return zoomIdentity.translate(w / 2 - cx * k0, h / 2 - cy * k0).scale(k0);
  }
  $effect(() => {
    if (!planeEl || planeReady || !containerW) return;
    planeReady = true;
    untrack(() => {
      planeZoom = d3zoom()
        .scaleExtent([0.3, 2.5])
        .filter((ev) => ev.type !== "wheel" || ev.ctrlKey)
        .on("zoom", (ev) => { plane = { x: ev.transform.x, y: ev.transform.y, k: ev.transform.k }; });
      const sel = d3select(planeEl).call(planeZoom);
      sel.call(planeZoom.transform, planeFitTransform());
    });
  });
  const planeZoomBy = (f) => { if (planeZoom && planeEl) d3select(planeEl).call(planeZoom.scaleBy, f); };
  const planeRecenter = () => { if (planeZoom && planeEl) d3select(planeEl).call(planeZoom.transform, planeFitTransform()); };

  function openClusterView(groupKey, idx) {
    const g = geo.groups.find((gg) => gg.key === groupKey);
    if (!g) return;
    openGroupKey = groupKey;
    openClusterIdx = idx;
    scatter.resetView();
    g.pipeline.project(); // lazy t-SNE — fills coords for the scatter
  }
  function closeClusterView() {
    openGroupKey = null;
    openClusterIdx = null;
    scatter.hoveredCircle = null;
  }

  // Feed the opened cluster's items into the scatter once projected.
  $effect(() => {
    const c = openCluster;
    const projected = openPipeline?.projected;
    scatter.items = c && projected ? c.items : [];
  });

  // Wire d3-zoom when the scatter canvas mounts; redraw on any change.
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
</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape" && openGroupKey) closeClusterView(); }} />

<section class="geo-map">
  <div class="gm-header">
    <span class="gm-title">Topic map by source</span>
    {#if openCluster}
      <button class="gm-back" onclick={() => closeClusterView()}>← Back to map</button>
      <h3 class="gm-open-terms">
        {#each (openCluster.terms || []) as t (t.term)}
          <span class="gm-open-term">{humanTerm(t.term)}</span>
        {/each}
      </h3>
      <span class="gm-open-meta">{openGroup?.label} · {openCluster.count} docs</span>
      <label class="gm-lambda" title="LDAvis relevance: λ=1 common, λ=0 distinctive.">
        Mix
        <input type="range" min="0" max="1" step="0.05" bind:value={openPipeline.lambda} class="gm-slider" />
        <span class="gm-lambda-val">λ {openPipeline.lambda.toFixed(2)}</span>
      </label>
      <div class="gm-zoom-btns">
        <button class="gm-zoom-btn" onclick={() => scatter.zoomBy(1.4)}>+</button>
        <button class="gm-zoom-btn" onclick={() => scatter.zoomBy(1 / 1.4)}>−</button>
        <button class="gm-zoom-btn" onclick={() => scatter.resetView()}>⟲</button>
      </div>
    {:else}
      <span class="gm-hint">
        Topics modelled per source, near their place on the map · drag to pan ·
        Ctrl + scroll to zoom · click a cluster for its t-SNE.
      </span>
      <div class="gm-zoom-btns">
        <button class="gm-zoom-btn" onclick={() => planeZoomBy(1.3)}>+</button>
        <button class="gm-zoom-btn" onclick={() => planeZoomBy(1 / 1.3)}>−</button>
        <button class="gm-zoom-btn" onclick={() => planeRecenter()}>⟲</button>
      </div>
    {/if}
  </div>

  <div
    class="gm-body"
    bind:this={planeEl}
    bind:clientWidth={containerW}
    bind:clientHeight={containerH}
  >
    {#snippet clusterBox(g)}
      {@const pl = g.pipeline}
      {@const n = pl.topicCount}
      <div class="gm-box-head">
        <span class="gm-box-label">{g.label}</span>
        <span class="gm-box-count">{g.count}</span>
      </div>
      {#if g.count < MIN_GROUP_DOCS}
        <div class="gm-box-note">too few docs to cluster</div>
      {:else if pl.processing && n === 0}
        <div class="gm-box-note"><span class="gm-spin"></span>{pl.progress || "modelling…"}</div>
      {:else if n === 0}
        <div class="gm-box-note">waiting…</div>
      {:else}
        {@const cl = pl.clusters}
        <div class="gm-grid">
          {#each cl.slice(0, visibleClusterCount(g)) as c, ci (c.topic)}
            <button
              class="gm-cell"
              class:gm-cell-open={g.key === openGroupKey && ci === openClusterIdx}
              title={`${c.count} docs`}
              onclick={() => openClusterView(g.key, ci)}
            >
              <span class="gm-cell-terms">{c.terms.slice(0, 3).map((t) => humanTerm(t.term)).join(" · ")}</span>
              <span class="gm-cell-count">{c.count}</span>
            </button>
          {/each}
        </div>
        {#if n > COLLAPSED_CLUSTERS}
          <button class="gm-accordion" onclick={(e) => { e.stopPropagation(); toggleExpanded(g.key); }}>
            {isExpanded(g.key) ? "− less" : `+ ${n - COLLAPSED_CLUSTERS} more`}
          </button>
        {/if}
      {/if}
    {/snippet}

    <!-- Pannable / zoomable plane holding the map, leaders and all cards -->
    <div
      class="gm-plane"
      style="width: {PLANE_W}px; height: {PLANE_H}px; transform: translate({plane.x}px, {plane.y}px) scale({plane.k})"
    >
      <!-- India base map: anchors + state names with doc counts -->
      <svg
        class="gm-india"
        viewBox="0 0 {MAP_W} {MAP_H}"
        style="left: {MAP_X0}px; top: {MAP_Y0}px; width: {MAP_PLANE_W}px; height: {MAP_PLANE_H}px"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {#each placedGroups as p (p.group.key)}
          <g class="gm-anchor-g" class:gm-anchor-open={p.group.key === openGroupKey}>
            <circle cx={p.group.x} cy={p.group.y} r="3.5" class="gm-anchor" />
            {#if p.group.type === "state"}
              <text x={p.group.x} y={p.group.y - 6} text-anchor="middle" class="gm-anchor-label">
                {p.group.state} · {p.group.count}
              </text>
            {/if}
          </g>
        {/each}
      </svg>

      <!-- Leader lines anchor → card -->
      <svg class="gm-leaders" viewBox="0 0 {PLANE_W} {PLANE_H}" aria-hidden="true">
        {#each placedGroups as p (p.group.key)}
          <line x1={p.ax} y1={p.ay} x2={p.lx2} y2={p.ly2} class="gm-leader" />
        {/each}
      </svg>

      <!-- Cluster cards next to their anchors -->
      {#each placedGroups as p (p.group.key)}
        <div class="gm-box" style="left: {p.bx}px; top: {p.by}px; width: {BOX_W}px">
          {@render clusterBox(p.group)}
        </div>
      {/each}
    </div>

    <!-- t-SNE scatter overlay for the opened cluster ("the map moves to the box") -->
    {#if openGroupKey}
      <div class="gm-scatter">
        {#if openPipeline?.projecting || (!openPipeline?.projected)}
          <div class="gm-scatter-loading">
            <span class="gm-spin gm-spin-lg"></span>
            <span>Projecting cluster…</span>
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
          <div class="gm-hover-tip">
            <div class="gm-tip-title">{hitTitle(hov.hit, hov.idx)}</div>
            {#if hitExcerpt(hov.hit)}
              <p class="gm-tip-excerpt">{@html renderHighlight(hitExcerpt(hov.hit), selectedClusterTerms)}</p>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#if loading}
      <div class="gm-loading"><span class="gm-spin gm-spin-lg"></span><span>Loading results…</span></div>
    {/if}
  </div>
</section>

<style lang="postcss">
  .geo-map { @apply relative mb-3 bg-white/60 backdrop-blur-sm rounded-lg border border-primary/30; }

  .gm-header { @apply flex items-center gap-3 px-3 py-2 border-b border-primary/20 flex-wrap; }
  .gm-title { @apply text-[11px] font-bold text-black/70 uppercase tracking-wider; }
  .gm-hint { @apply text-[10px] text-black/45 italic; }
  .gm-back {
    @apply text-[11px] px-2 py-0.5 rounded border border-primary/30 bg-white/60 text-black/70 cursor-pointer hover:bg-primary/20;
  }
  .gm-back::after { content: ""; }
  .gm-open-terms { @apply flex flex-wrap gap-1 text-sm; }
  .gm-open-term { @apply font-semibold px-1.5 py-0.5 rounded bg-black/10 text-black/70; }
  .gm-open-meta { @apply text-[10px] text-black/50 font-mono; }
  .gm-lambda { @apply flex items-center gap-1 text-[10px] font-semibold text-black/60 uppercase tracking-wider ml-auto; }
  .gm-slider { @apply w-20 align-middle; }
  .gm-lambda-val { @apply text-[10px] font-mono text-black/60; }
  .gm-zoom-btns { @apply flex items-center rounded border border-primary/30 overflow-hidden; }
  .gm-zoom-btn {
    @apply text-[13px] px-2 py-0.5 bg-white/60 text-black/70 cursor-pointer leading-none hover:bg-primary/20;
    border: none;
  }
  .gm-zoom-btn::after { content: ""; }
  .gm-zoom-btn + .gm-zoom-btn { border-left: 1px solid rgba(0,0,0,0.1); }

  .gm-body {
    @apply relative rounded-lg border border-primary/20 bg-white/40 overflow-hidden mx-3 mb-3;
    height: 660px;
    cursor: grab;
    touch-action: none;
  }
  .gm-body:active { cursor: grabbing; }

  /* The transformed plane that pans/zooms as one unit. */
  .gm-plane { @apply absolute top-0 left-0; transform-origin: 0 0; }

  .gm-india { @apply absolute; opacity: 0.95; }
  .gm-anchor { fill: #c3b091; stroke: #8b7355; stroke-width: 0.8; }
  .gm-anchor-label { font-size: 8px; fill: #6b5335; font-weight: 700; font-family: inherit; }
  .gm-anchor-open .gm-anchor { fill: #b8860b; stroke: #6b5335; stroke-width: 1.4; }
  .gm-anchor-open .gm-anchor-label { fill: #000; }

  .gm-leaders { @apply absolute top-0 left-0 w-full h-full pointer-events-none; z-index: 2; }
  .gm-leader { stroke: rgba(0,0,0,0.22); stroke-width: 1.2; stroke-dasharray: 4 3; }

  .gm-box {
    @apply absolute z-10 bg-white/95 rounded-md shadow-sm overflow-hidden text-left;
    border: 1px solid rgba(0,0,0,0.14);
  }
  .gm-box:hover { @apply z-20 shadow-md; }
  .gm-box-head {
    @apply flex items-center justify-between gap-1 px-2 py-1 bg-primary/15;
    border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  .gm-box-label { @apply text-[10px] font-bold text-black/75 truncate; }
  .gm-box-count { @apply text-[9px] font-mono text-black/45 bg-black/5 rounded-full px-1 shrink-0; }
  .gm-box-note { @apply flex items-center gap-1.5 px-2 py-1 text-[9px] text-black/45 italic; }
  .gm-grid { @apply grid grid-cols-2 gap-0.5 p-1; }
  .gm-cell {
    @apply flex flex-col items-start text-left px-1.5 py-1 rounded bg-primaryLight/70 cursor-pointer transition-colors;
    @apply hover:bg-primary/40;
    border: 1px solid transparent;
  }
  .gm-cell::after { content: ""; }
  .gm-cell-open { @apply bg-primary/50 border-primary; }
  .gm-cell-terms { @apply text-[9px] font-semibold text-black/75 leading-tight; }
  .gm-cell-count { @apply text-[8px] font-mono text-black/45; }
  .gm-accordion {
    @apply w-full text-center text-[8px] font-semibold uppercase tracking-wide text-black/45 cursor-pointer;
    @apply px-1 py-0.5 bg-black/[0.03] hover:bg-primary/20 hover:text-black/70 transition-colors;
    border: none; border-top: 1px solid rgba(0,0,0,0.05);
  }
  .gm-accordion::after { content: ""; }

  .gm-spin {
    @apply inline-block rounded-full shrink-0;
    width: 0.7rem; height: 0.7rem;
    border: 2px solid rgba(0,0,0,0.15);
    border-top-color: #c3b091;
    animation: gm-spin 0.7s linear infinite;
  }
  .gm-spin-lg { width: 1.6rem; height: 1.6rem; border-width: 3px; }
  @keyframes gm-spin { to { transform: rotate(360deg); } }

  /* Scatter overlay — the lazily-projected t-SNE for one cluster */
  .gm-scatter { @apply absolute inset-0 z-20 bg-white/95; }
  .gm-scatter-canvas { @apply absolute inset-0 w-full h-full; cursor: grab; touch-action: none; }
  .gm-scatter-canvas:active { cursor: grabbing; }
  .gm-scatter-loading {
    @apply absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 text-[12px] text-black/55 italic;
    background: rgba(255,255,255,0.7);
  }

  .gm-scatter-leaders { @apply absolute inset-0 w-full h-full pointer-events-none; z-index: 5; }
  .gm-scatter-leader { stroke: rgba(0,0,0,0.2); stroke-width: 1; stroke-dasharray: 3 3; fill: none; }

  .gm-label-card {
    @apply absolute z-10 bg-white/95 rounded-md shadow-sm cursor-pointer overflow-hidden text-left;
    border: 1px solid rgba(0,0,0,0.12);
    width: 200px;
  }
  .gm-label-card:hover { @apply bg-white shadow-md; border-color: rgba(0,0,0,0.22); }
  .gm-label-card::after { content: ""; }
  .gm-label-title {
    @apply px-2 pt-1.5 pb-1 text-[11px] font-semibold text-black/80 leading-tight truncate;
    border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  .gm-label-excerpt {
    @apply px-2 py-1.5 text-[9px] text-black/50 leading-snug;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  }
  .gm-label-excerpt :global(strong),
  .gm-tip-excerpt :global(strong) {
    background: rgba(251, 191, 36, 0.45); border-radius: 2px; padding: 0 1px; font-weight: inherit;
  }

  .gm-hover-tip {
    @apply absolute top-2 left-2 rounded bg-white/95 border border-primary/30 shadow-sm pointer-events-none z-20;
    max-width: 280px;
  }
  .gm-tip-title { @apply px-2.5 pt-2 pb-1 text-[11px] font-semibold text-black/80 leading-tight; }
  .gm-tip-excerpt {
    @apply px-2.5 pb-2 text-[10px] text-black/55 leading-snug;
    border-top: 1px solid rgba(0,0,0,0.06); padding-top: 5px; margin-top: 0;
    display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
  }

  .gm-loading {
    @apply absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 text-[12px] text-black/60 italic;
    background: rgba(240, 233, 218, 0.82);
  }
</style>
