<script>
  // A band of documents on one time axis: white bars over the page's own brown,
  // the years called out, no classification. Used twice — under the source grid
  // for every result the search returned, and under the topic plot for the opened
  // topic's own — so the two read as the same object at two scopes. Where the
  // projection above it says what a document is about, the band says when.
  //
  // It reads at three levels, each raised by the hover below it. Hovering a bar
  // opens this same component again over that one bar's period, so a year splits
  // into weeks in a box anchored above the bar; hovering a bar of that raises the
  // document card. The band itself never moves, so there is nothing to undo when
  // you leave.
  import { untrack } from "svelte";
  import DocCard from "$lib/components/search/views/DocCard.svelte";
  import Self from "$lib/components/search/views/TimelineBand.svelte";
  import { TimelinePlot } from "$lib/components/search/views/timeline.svelte.js";

  // `rise` is how far the box above may overhang the top of the band. The band is
  // shorter than it is, so it has to escape its box; the caller knows what sits
  // above it and therefore how much room there is to escape into.
  //
  // `domain` and `depth` are set only by the drill-down rendering itself.
  /**
   * @type {{
   *   hits?: any[], terms?: string[], domain?: [number, number] | null, depth?: number,
   *   rise?: number, fade?: number, onselect?: (hit: any) => void,
   *   onhoverdoc?: (hit: any) => void,
   * }}
   */
  let {
    hits = [],
    terms = [],
    domain = null,
    depth = 0,
    rise = 220,
    fade = 0,
    onselect,
    onhoverdoc,
  } = $props();

  // The drill-down is the same picture over a narrower domain in a tooltip-sized
  // box, so it needs the same settings at a smaller scale — nothing more.
  const BAND = {
    axis: { padTop: 10, tickBand: 26, tickMinSpacing: 64 },
    panels: { gutter: 6, minVolumeHeight: 24 },
    marker: { baseRadius: 3 },
  };
  const DRILL = {
    axis: {
      padLeft: 8, padRight: 8, padTop: 6, padBottom: 3,
      tickBand: 13, tickMinSpacing: 40, tickMaxSpacing: 72, minInnerWidth: 90,
    },
    panels: { gutter: 4, minVolumeHeight: 16 },
    bins: { targetPx: 9 },
    marker: { baseRadius: 2.5 },
  };

  // An instance is created at one depth and stays there — the drill-down is a
  // second instance, not this one changing — so the config is chosen once.
  const plot = new TimelinePlot(untrack(() => depth) ? DRILL : BAND);
  let layout = $derived(plot.layoutFor(hits, domain));

  // d3-zoom owns the pane's listeners; the effect owns their lifetime. The
  // drill-down shows a window the caller fixed, so only the band itself pans.
  let pane = $state(null);
  $effect(() => (depth === 0 ? plot.attach(pane) : undefined));
  // translateExtent is in pane pixels, so the pan clamp has to follow a resize.
  $effect(() => {
    plot.paneW; plot.paneH;
    plot.syncExtent();
  });

  // ── Hover ─────────────────────────────────────────────────────────────────
  // Resolved from the layout rather than held: a bar the pan has scrolled away
  // from must not keep its box.
  let hoveredBin = $state(null);
  let bin = $derived(
    hoveredBin === null || !layout
      ? null
      : layout.bins.find((b) => b.start === hoveredBin) || null,
  );

  // One box above the bar, holding either this band again over that bar's period
  // or the document itself. A bar with one document has nothing to magnify, so it
  // goes straight to the card — as does every bar once we are already inside a
  // drill-down, which is what stops the recursion.
  let drill = $derived(depth === 0 && bin && bin.count > 1 ? bin : null);
  let card = $derived(drill ? null : bin?.top ?? null);

  // The one document the band is currently pointing at, announced upward. The view
  // above can then answer in its own terms — the topic plot puts its card over that
  // document's marker, so a period in the band and a position in the projection are
  // visibly the same document. A drill-down names a document before the band does,
  // so its answer wins; it is read through `drill` so a closed one cannot go stale.
  let deeper = $state(null);
  $effect(() => onhoverdoc?.((drill ? deeper : null) ?? bin?.top?.hit ?? null));

  // ── Placement ─────────────────────────────────────────────────────────────
  // Anchored to a bar, never to the pointer. Following the cursor made the box
  // unreachable — it sat above the pointer, so moving up towards it moved it up
  // too, and it stayed exactly as far away as it started.
  const DRILL_W = 248;
  const DRILL_H = 130;
  const CARD_W = 232;
  const CARD_H = 94;   // title, then the excerpt in what is left
  const BAR_GAP = 8;   // between the top of a bar and the box above it
  const REACH = 6;     // how far the box reaches into the bar's hit target

  // Just above the bar itself, so the box rises and falls with the count it
  // describes instead of sitting at a fixed height. The floor is what keeps it
  // reachable: the hit target spans the whole volume band, so as long as the box's
  // bottom edge lands inside that band the pointer crosses straight from one to
  // the other. Above it there is a strip belonging to neither, and the hover dies.
  let box = $derived.by(() => {
    if (!bin || !layout) return null;
    const w = drill ? DRILL_W : CARD_W;
    const h = drill ? DRILL_H : CARD_H;
    const y = Math.max(layout.top + REACH, layout.volumeBase - bin.countH - BAR_GAP) - h;
    if (y < -rise) return null;
    const centre = bin.px + bin.pw / 2;
    return { x: Math.max(4, Math.min(plot.paneW - w - 4, centre - w / 2)), y, w, h };
  });

  // ── Marks ─────────────────────────────────────────────────────────────────
  // One path for every marker rather than one element each. A search returns up to
  // 1500 documents and none of them is hovered or clicked here, so there is nothing
  // an element per document would buy.
  let dotPath = $derived.by(() => {
    if (!layout) return "";
    const r = plot.cfg.marker.baseRadius;
    let d = "";
    for (const p of layout.dots) {
      if (p.px < -r || p.px > plot.paneW + r) continue;
      d += `M${(p.px - r).toFixed(1)},${p.py}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
    }
    return d;
  });

  // A year whose label would be cut by the pane edge is dropped rather than shown
  // half-drawn — the rule line stays, so the position is still marked. Only the
  // band sets its years like a heading; the drill-down's ticks are small enough to
  // sit anywhere.
  const YEAR_HALF_CH = 5.2; // half an advance at 15px bold + 0.08em tracking
  let ticks = $derived.by(() => {
    const all = layout?.ticks || [];
    if (depth) return all;
    return all.filter((t) => {
      const half = t.label.length * YEAR_HALF_CH;
      return t.x - half >= 2 && t.x + half <= plot.paneW - 2;
    });
  });

  /** @param {{ top?: { hit: any } | null } | null} d */
  const open = (d) => { if (d?.top && plot.clickAllowed()) onselect?.(d.top.hit); };
</script>

<!-- The pane clips the marks to the band; the root clips nothing, so the box can
     overhang into the view above. On the root, not the pane: the box is a sibling
     of the pane, so moving from a bar into it leaves the pane, and only leaving
     the band should clear the hover. -->
<div class="gm-ov-root" role="presentation" onmouseleave={() => (hoveredBin = null)}>
  <div
    class="gm-ov-pane"
    class:gm-ov-dragging={plot.dragging}
    class:gm-ov-deep={depth > 0}
    role="presentation"
    bind:this={pane}
    bind:clientWidth={plot.paneW} bind:clientHeight={plot.paneH}
  >
    {#if layout}
      <svg class="gm-ov-svg" aria-hidden="true">
        {#each layout.ticks as t (t.t)}
          <line class="gm-ov-rule" x1={t.x} y1={layout.top} x2={t.x} y2={layout.volumeBase} />
        {/each}

        <!-- Documents per period. Every document is also a marker on the line
             below, so the bars are the same count read at a coarser resolution. -->
        {#each layout.bins as b (b.start)}
          <rect
            class="gm-ov-bar"
            class:gm-ov-bar-on={bin?.start === b.start}
            x={b.px} y={layout.volumeBase - b.countH}
            width={b.pw} height={b.countH}
          />
        {/each}

        <line class="gm-ov-axis" x1={layout.x0} y1={layout.axisY} x2={layout.x1} y2={layout.axisY} />

        {#if dotPath}
          <path class="gm-ov-dots" d={dotPath} />
        {/if}

        {#each ticks as t (t.t)}
          <text class="gm-ov-tick" x={t.x} y={layout.bottom - 4}>{t.label}</text>
        {/each}

        <!-- Full-height hit targets: a one-document bar is a few pixels tall and
             would otherwise be almost impossible to hover. -->
        {#each layout.bins as b (b.start)}
          <rect
            class="gm-ov-bar-hit"
            x={b.px} y={layout.top} width={b.pw} height={layout.volumeBase - layout.top}
            role="button" tabindex="-1"
            aria-label="{b.label}, {b.count} documents"
            onmouseenter={() => (hoveredBin = b.start)}
            onclick={() => open(b)}
            onkeydown={(e) => { if (e.key === "Enter") open(b); }}
          />
        {/each}
      </svg>
    {/if}
  </div>

  {#if fade}
    <div class="gm-ov-fade" style="height: {fade}px;" aria-hidden="true"></div>
  {/if}

  {#if box && drill}
    <!-- The band again, over one bar's period. Its bottom edge reaches into the
         band's hit target so the pointer can cross into it without passing over a
         strip that belongs to neither. -->
    <div
      class="gm-ov-box"
      style="left: {box.x}px; top: {box.y}px; width: {box.w}px; height: {box.h}px;"
    >
      <div class="gm-ov-box-head">
        <span class="gm-ov-box-period">{drill.label}</span>
        <span class="gm-ov-box-count">{drill.count} doc{drill.count === 1 ? "" : "s"}</span>
      </div>
      <div class="gm-ov-box-body">
        <Self
          {hits} {terms} {onselect}
          domain={[drill.start, drill.end]}
          depth={depth + 1}
          onhoverdoc={(hit) => (deeper = hit)}
        />
      </div>
    </div>
  {:else if box && card}
    <!-- The same card the projection shows, with no surface of its own, so it
         reads as the top of one object rather than as a tooltip. Clickable, like
         the cards in the projection are, which means it has to be reachable: its
         bottom edge overlaps the bar that raised it. -->
    <button
      class="gm-ov-box gm-ov-card"
      style="left: {box.x}px; top: {box.y}px; width: {box.w}px; height: {box.h}px;"
      onclick={() => open(bin)}
    >
      <DocCard variant="inline" hit={card.hit} idx={card.i} {terms} />
    </button>
  {/if}
</div>

<style lang="postcss">
  @reference "../../../../app.css";

  /* The root does not clip, so the box can overhang into the view above; a grid
     with one row so the pane is stretched to the track rather than needing a
     percentage height. z-index puts the overhang above the plot it covers. */
  .gm-ov-root {
    @apply relative grid min-h-0;
    grid-template-rows: minmax(0, 1fr);
    z-index: 30;
  }
  /* min-h-0 lets the pane be shorter than the content inside it, and
     overflow-hidden means anything the layout could not fit is clipped here
     rather than escaping. The page's own brown, not a second one. */
  .gm-ov-pane {
    @apply relative min-h-0 rounded-md overflow-hidden bg-primary;
    cursor: grab; touch-action: none;
  }
  .gm-ov-dragging { cursor: grabbing; }
  /* Inside the box the surface is already there and there is nothing to pan. */
  .gm-ov-deep { @apply rounded-none; cursor: default; }
  .gm-ov-svg { @apply absolute inset-0 w-full h-full pointer-events-none; }

  .gm-ov-rule { stroke: rgba(107, 83, 53, 0.18); stroke-width: 1; }
  /* White on #c3b091 is only about 2:1, so the bars carry a brown edge — the fill
     stays white and the shape still reads at one bar wide. */
  .gm-ov-bar {
    fill: rgba(255, 255, 255, 0.92);
    stroke: rgba(107, 83, 53, 0.55); stroke-width: 0.75;
  }
  .gm-ov-bar-on { fill: #fff; stroke: #6b5335; stroke-width: 1.25; }
  .gm-ov-bar-hit { fill: transparent; pointer-events: all; cursor: pointer; }

  .gm-ov-axis { stroke: rgba(107, 83, 53, 0.6); stroke-width: 1; }
  .gm-ov-dots { fill: rgba(255, 255, 255, 0.95); }

  /* The years are the frame, so they are set like a heading, not like a tick. */
  .gm-ov-tick {
    @apply font-bold; font-size: 15px; letter-spacing: 0.08em;
    fill: rgba(61, 47, 30, 0.85); text-anchor: middle;
  }
  .gm-ov-deep .gm-ov-tick {
    @apply font-mono font-normal; font-size: 8px; letter-spacing: normal;
    fill: rgba(61, 47, 30, 0.75);
  }
  .gm-ov-deep .gm-ov-dots { fill: #6b5335; }
  .gm-ov-deep .gm-ov-bar { stroke-width: 0.6; }

  .gm-ov-fade {
    @apply absolute inset-x-0 pointer-events-none;
    bottom: 100%;
    background: linear-gradient(
      to top,
      #c3b091 0,
      rgba(195, 176, 145, 0.92) 20%,
      rgba(195, 176, 145, 0.5) 58%,
      rgba(195, 176, 145, 0) 100%
    );
  }

  .gm-ov-box {
    @apply absolute flex flex-col rounded-md bg-primary shadow-lg;
    border: 1px solid #6b5335;
    z-index: 40;
  }
  .gm-ov-card {
    @apply block text-left p-0 cursor-pointer overflow-hidden;
    z-index: 50;
  }
  .gm-ov-card:hover { border-color: #b8860b; background: rgba(255, 255, 255, 0.22); }
  .gm-ov-card::after { content: ""; }

  .gm-ov-box-head {
    @apply flex items-baseline gap-2 px-2 py-1 shrink-0;
    border-bottom: 1px solid rgba(107, 83, 53, 0.3);
  }
  .gm-ov-box-period { @apply text-[13px] font-bold text-black/85; }
  .gm-ov-box-count { @apply text-[10px] font-mono text-black/55 ml-auto shrink-0; }

  /* A grid track, so the band inside stretches to what is left under the head
     rather than measuring itself against its own content. */
  .gm-ov-box-body {
    @apply grid flex-1 min-h-0;
    grid-template-rows: minmax(0, 1fr);
  }
</style>
