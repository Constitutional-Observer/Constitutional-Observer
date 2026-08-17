<script>
  // Level 2 — the opened topic's documents placed against the other topics.
  // Every other topic is a named anchor on the ring; the opened topic has no
  // anchor, so it pulls to the origin. Distance from centre is therefore the
  // share of a document that is about something else, and direction says which.
  import DocCard from "$lib/components/search/views/DocCard.svelte";
  import DocList from "$lib/components/search/views/DocList.svelte";

  let {
    plot,
    pipeline,
    cluster,
    terms = [],
    labelFor = (t) => `Topic ${t + 1}`,
    subtitleFor = () => "",
    onselect,
    onclose,
  } = $props();

  let source = $derived(pipeline && cluster ? pipeline.radviz(cluster.topic) : null);
  let layout = $derived(plot.layoutFor(source));
  let cards = $derived(plot.cardsFor(layout));
  let floating = $derived(plot.floatingIn(layout, cards));
</script>

<div class="gm-radviz-wrap">
  <!-- Drag to pan, ctrl/⌘+wheel to zoom; a bare wheel still scrolls the page. -->
  <div
    class="gm-radviz"
    class:gm-radviz-dragging={plot.dragging}
    role="presentation"
    bind:clientWidth={plot.paneW} bind:clientHeight={plot.paneH}
    onwheel={(e) => plot.wheel(e)}
    onpointerdown={(e) => plot.pointerDown(e)}
    onpointermove={(e) => plot.pointerMove(e)}
    onpointerup={() => plot.pointerUp()}
    onpointercancel={() => plot.pointerUp()}
  >
    {#if layout}
      <svg class="gm-rv-svg" aria-hidden="true">
        <!-- Grid bleeds to the pane edges; one line per θ-share step. -->
        {#each layout.grid.cols as g (g.off)}
          <line class="gm-rv-grid" class:gm-rv-grid-marked={g.marked}
                x1={layout.cx0 - g.off} y1={layout.grid.y0} x2={layout.cx0 - g.off} y2={layout.grid.y1} />
          <line class="gm-rv-grid" class:gm-rv-grid-marked={g.marked}
                x1={layout.cx0 + g.off} y1={layout.grid.y0} x2={layout.cx0 + g.off} y2={layout.grid.y1} />
        {/each}
        {#each layout.grid.rows as g (g.off)}
          <line class="gm-rv-grid" class:gm-rv-grid-marked={g.marked}
                x1={layout.grid.x0} y1={layout.cy0 - g.off} x2={layout.grid.x1} y2={layout.cy0 - g.off} />
          <line class="gm-rv-grid" class:gm-rv-grid-marked={g.marked}
                x1={layout.grid.x0} y1={layout.cy0 + g.off} x2={layout.grid.x1} y2={layout.cy0 + g.off} />
        {/each}

        <line class="gm-rv-axis" x1={layout.grid.x0} y1={layout.cy0} x2={layout.grid.x1} y2={layout.cy0} />
        <line class="gm-rv-axis" x1={layout.cx0} y1={layout.grid.y0} x2={layout.cx0} y2={layout.grid.y1} />

        {#each layout.grid.cols as g (g.off)}
          {#if g.marked}
            <line class="gm-rv-tick" x1={layout.cx0 + g.off} y1={layout.cy0 - layout.grid.tick}
                                     x2={layout.cx0 + g.off} y2={layout.cy0 + layout.grid.tick} />
            <text class="gm-rv-tick-label" x={layout.cx0 + g.off} y={layout.cy0 + layout.grid.tick + 10}>
              {g.pct}%
            </text>
            <line class="gm-rv-tick" x1={layout.cx0 - g.off} y1={layout.cy0 - layout.grid.tick}
                                     x2={layout.cx0 - g.off} y2={layout.cy0 + layout.grid.tick} />
            <text class="gm-rv-tick-label" x={layout.cx0 - g.off} y={layout.cy0 + layout.grid.tick + 10}>
              {g.pct}%
            </text>
          {/if}
        {/each}

        {#each layout.anchors as a (a.topic)}
          <line class="gm-rv-spoke" x1={layout.cx0} y1={layout.cy0} x2={a.sx} y2={a.sy} />
        {/each}

        {#each cards as c (c.j)}
          <line class="gm-rv-leader" x1={c.px} y1={c.py} x2={c.ex} y2={c.ey} />
        {/each}

        {#each layout.dots as d (d.j)}
          <circle
            class="gm-rv-dot"
            class:gm-rv-dot-on={plot.hovered === d.j}
            cx={d.px} cy={d.py} r={plot.markerRadius(d)}
          />
        {/each}

        {#each layout.dots as d (d.j)}
          <circle
            class="gm-rv-hit"
            cx={d.px} cy={d.py} r={d.rad + plot.cfg.marker.hitPad}
            role="button" tabindex="-1"
            aria-label={subtitleFor(d)}
            onmouseenter={() => plot.enter(d.j)}
            onmouseleave={() => plot.leave(d.j)}
            onclick={() => { if (plot.clickAllowed()) onselect?.(d.hit); }}
            onkeydown={(e) => { if (e.key === "Enter") onselect?.(d.hit); }}
          />
        {/each}
      </svg>

      {#each layout.anchors as a (a.topic)}
        <span
          class="gm-rv-anchor"
          style="left: {a.ax}px; top: {a.ay}px; transform: translate({a.tx}, {a.ty});"
        >
          {labelFor(a.topic)}
        </span>
      {/each}

      {#each cards as c (c.j)}
        <DocCard
          hit={c.hit} idx={c.idx} terms={terms} subtitle={subtitleFor(c)}
          x={c.lx} y={c.ly} w={c.w} h={c.h}
          on={plot.hovered === c.j}
          onenter={() => plot.enter(c.j)}
          onleave={() => plot.leave(c.j)}
          onopen={() => { if (plot.clickAllowed()) onselect?.(c.hit); }}
        />
      {/each}

      {#if floating}
        <DocCard
          variant="float"
          hit={floating.hit} idx={floating.idx} terms={terms} subtitle={subtitleFor(floating)}
          x={floating.px} y={floating.py} w={plot.cfg.cards.width}
        />
      {/if}

    {:else if plot.paneW > 0}
      <!-- K = 1 (no anchors) or pane too small for minRadius. -->
      <div class="gm-rv-fallback">
        <DocList items={cluster?.items || []} {onselect} />
      </div>
    {/if}
  </div>

  <div class="gm-plot-tools">
    <div class="gm-zoom-btns">
      <button class="gm-zoom-btn" disabled={!plot.canZoomIn} title="Zoom in" onclick={() => plot.zoomIn()}>+</button>
      <button class="gm-zoom-btn" disabled={!plot.canZoomOut} title="Zoom out" onclick={() => plot.zoomOut()}>−</button>
      <button class="gm-zoom-btn" disabled={!plot.moved} title="Reset view" onclick={() => plot.resetView()}>⟲</button>
    </div>
    <button class="gm-clear" onclick={() => onclose?.()}>Clear ✕</button>
  </div>

  <p class="gm-radviz-caption">
    Each label around the edge is another topic in this source. A document's
    <strong>distance from the centre</strong> is how much of it is about something
    other than the topic you opened — the grid marks read that share off — and the
    <strong>direction</strong> says which topic that is. A document at the centre is
    about nothing else. <strong>Marker size</strong> is how much of the document is
    this topic. Drag to pan, ⌘/ctrl + scroll to zoom.
  </p>
</div>

<style lang="postcss">
  @reference "../../../../app.css";

  /* Stretched to its grid track; height:100% here would resolve against that
     track and let the caption push the pane back out. */
  .gm-radviz-wrap { @apply relative flex flex-col min-h-0 gap-1; }

  .gm-plot-tools { @apply absolute top-2 right-2 z-50 flex items-center gap-2; }
  .gm-zoom-btns { @apply flex items-center rounded border border-primary/30 overflow-hidden shadow-sm; }
  .gm-zoom-btn { @apply text-[13px] px-2 py-0.5 bg-white/85 text-black/70 cursor-pointer leading-none hover:bg-primary/30; border: none; }
  .gm-zoom-btn + .gm-zoom-btn { border-left: 1px solid rgba(0, 0, 0, 0.1); }
  .gm-zoom-btn:disabled { @apply text-black/25 cursor-default; background: rgba(255, 255, 255, 0.55); }
  .gm-clear {
    @apply text-[11px] px-2 py-0.5 rounded border border-primary/30 bg-white/85 text-black/70 cursor-pointer hover:bg-primary/30 shrink-0 shadow-sm;
  }
  .gm-radviz {
    @apply relative flex-1 min-h-0 rounded-md border border-primary/20 bg-white/70 overflow-hidden;
    cursor: grab; touch-action: none;
  }
  .gm-radviz-dragging { cursor: grabbing; }
  .gm-radviz-caption { @apply shrink-0 px-2 pb-0.5 text-[11px] leading-snug text-black/45; }
  .gm-radviz-caption strong { @apply font-semibold text-black/65; }
  .gm-rv-fallback { @apply flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto p-2; }

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

  /* One marker style. A document about nothing else is already at the centre, so a
     second variant would only restate its position. */
  .gm-rv-dot { fill: #6b5335; stroke: rgba(255, 255, 255, 0.85); stroke-width: 1; }
  .gm-rv-dot-on { fill: #b8860b; stroke: #6b5335; stroke-width: 2; }
  .gm-rv-hit { fill: transparent; cursor: pointer; pointer-events: all; }

  .gm-rv-anchor {
    @apply absolute z-30 max-w-[130px] text-center text-[10px] font-bold uppercase tracking-wide leading-tight;
    @apply px-1 pointer-events-none;
    color: #6b5335;
    text-shadow: 0 0 3px rgba(255, 255, 255, 0.95), 0 0 6px rgba(255, 255, 255, 0.9);
  }
</style>
