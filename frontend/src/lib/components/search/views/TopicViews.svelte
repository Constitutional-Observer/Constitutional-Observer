<script>
  import { navigating } from "$app/state";
  import { untrack } from "svelte";
  import TimelineBand from "$lib/components/search/views/TimelineBand.svelte";
  import SourceGrid from "$lib/components/search/views/SourceGrid.svelte";
  import TopicPlot from "$lib/components/search/views/TopicPlot.svelte";
  import { GeoGroups } from "$lib/components/search/views/geo-groups.svelte.js";
  import { RadvizPlot } from "$lib/components/search/views/radviz.svelte.js";
  import { docFormat, topicHighlight, viewNav } from "$lib/components/search/search-state.svelte.js";

  let {
    hits = [],
    query = "",
    indices = [],
    onselect,
    paginationDone = true,
  } = $props();

  const geo = new GeoGroups();

  let selectedGroup = $derived.by(() => {
    const t = viewNav.topic;
    return t ? geo.groups.find((g) => g.key === t.groupKey) || null : null;
  });
  let selectedPipeline = $derived(selectedGroup?.pipeline || null);
  let selectedCluster = $derived.by(() => {
    const t = viewNav.topic;
    return t && selectedGroup ? selectedGroup.pipeline.clusters[t.idx] || null : null;
  });
  let selectedClusterTerms = $derived((selectedCluster?.terms || []).map((t) => t.term));

  let loading = $derived(!!navigating.to);

  $effect(() => {
    hits; query; indices; paginationDone;
    untrack(() => {
      geo.build(hits, query, indices, paginationDone);
      if (geo.queryChanged) viewNav.clear();
    });
  });

  // termsByDoc unions terms across a doc's member topics, so highlighting
  // isn't limited to just one.
  $effect(() => {
    const terms = {};
    const topics = {};
    for (const g of geo.groups) {
      for (const { hit, topics: ts } of g.pipeline.docTopics) {
        const key = docFormat.docKey(hit);
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
      ? new Set(selectedCluster.items.map((it) => docFormat.docKey(it.hit)))
      : null;
  });

  // ── Views ────────────────────────────────────────────────────────────────

  const rv = new RadvizPlot();

  // One source of wording for both topic views: λ re-ranks terms, so a topic's
  // name must be resolved from `clusters` and never cached in a layout.
  let topicTerms = $derived(
    new Map(
      (selectedPipeline?.clusters || []).map((c) => [
        c.topic,
        c.terms.slice(0, 3).map((t) => docFormat.humanTerm(t.term)).join(" · "),
      ]),
    ),
  );
  /** @param {number} topic */
  const labelFor = (topic) => topicTerms.get(topic) || `Topic ${topic + 1}`;

  // "68% this topic · also concerns Irrigation".
  /** @param {{ prob: number, second: number | null }} d */
  function subtitleFor(d) {
    const pct = `${Math.round(d.prob * 100)}% this topic`;
    return d.second === null || d.second === undefined
      ? `${pct} · nothing else`
      : `${pct} · also concerns ${labelFor(d.second)}`;
  }

  // Every level is always in the trail. A level you have not reached is greyed
  // rather than absent, so the depth available is visible from the first screen.
  let trail = $derived.by(() => {
    const open = !!(selectedCluster && selectedGroup);
    const level = viewNav.level;
    return [
      {
        key: "sources",
        label: query ? `All results for “${query}”` : "All results",
        sub: `${hits.length} documents · ${geo.cellGroups.length} sources`,
        current: level === "sources",
      },
      {
        // Where the topic was found. There is no view of a source on its own, so
        // this is a step in the path rather than somewhere to go back to.
        key: "source",
        label: open ? selectedGroup.label : "A source",
        sub: open ? `${selectedGroup.count} documents` : "",
        plain: open,
        disabled: !open,
      },
      {
        key: "topic",
        label: open ? labelFor(selectedCluster.topic) : "A topic of discussion",
        sub: open ? `${selectedCluster.count} docs` : "",
        current: level === "topic",
        disabled: !open,
      },
    ];
  });

  // The crumbs are drawn in the sidebar, so the trail has to leave this component.
  // It is still built here because this is the only place that can name a topic —
  // the wording comes from the pipeline's λ-ranked terms.
  $effect(() => {
    viewNav.trail = trail;
  });

  function resetViews() {
    rv.hovered = null; rv.resetView();
  }

  // Zoom and hover belong to a view of one topic, so they reset on any level or
  // topic change — including one the sidebar made. A crumb there calls viewNav
  // directly and has no business knowing that view models exist.
  $effect(() => {
    viewNav.level; viewNav.topic;
    untrack(resetViews);
  });
  /** @param {string} groupKey @param {number} idx */
  function openTopic(groupKey, idx) {
    resetViews();
    viewNav.openTopic(groupKey, idx);
  }
  /** @param {string} level */
  function goTo(level) {
    resetViews();
    viewNav.to(level);
  }
</script>

<svelte:window
  onkeydown={(e) => { if (e.key === "Escape") { resetViews(); viewNav.pop(); } }}
/>

<section class="geo-map">
  <div class="gm-body">
    {#if !selectedCluster}
      <!-- Every result on one axis, coloured by state, above the sources that
           hold them. The strip and the grid are the same set read two ways. -->
      <div class="gm-sources">
        <SourceGrid {geo} {paginationDone} {onselect} onopentopic={openTopic} />
        <!-- Every result on one axis, under the sources that hold them. The band
             and the grid are the same set read two ways. -->
        <TimelineBand {hits} rise={280} fade={64} {onselect} />
      </div>
    {:else}
      <TopicPlot
        plot={rv}
        pipeline={selectedPipeline}
        cluster={selectedCluster}
        terms={selectedClusterTerms}
        {labelFor}
        {subtitleFor}
        {onselect}
        onclose={() => goTo("sources")}
      />
    {/if}

    {#if loading}
      <div class="gm-loading"><span class="gm-spin gm-spin-lg"></span><span>Loading results…</span></div>
    {/if}
  </div>
</section>

<style lang="postcss">
  @reference "../../../../app.css";

  /* Every view inside is height-driven — panes measure themselves and lay out to
     fit — so this height must be definite at every breakpoint and in every view.
     `min-h-0` on the chain below it lets each level shrink to its track instead of
     to its content, which is what stops the innermost pane from pushing outwards. */
  .geo-map {
    @apply relative mb-3 grid bg-primary backdrop-blur-sm border border-primary/30;
    height: 80dvh;
  }
  /* A grid item's default min-height is auto, so without min-h-0 this would refuse
     to shrink below its content and grow straight through .geo-map's height. */
  .gm-body {
    @apply relative grid border border-primary/20 p-1 min-h-0;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }

  /* Split horizontally: the sources above, every result on one time axis below.
     The band takes 30% — it is one axis and reads at a glance, so the rest belongs
     to the grid, which scrolls inside its share. No gap between them — the band's
     fade is what separates the two, and it needs the grid's clipped edge to land
     where it is already solid.

     The children carry min-h-0 and are stretched by the grid; they must NOT set
     height:100%, which resolves against the track and reintroduces the same
     content-driven growth min-h-0 exists to prevent. */
  .gm-sources {
    @apply grid min-h-0;
    grid-template-rows: minmax(0, 7fr) minmax(0, 3fr);
  }

  .gm-loading { @apply absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 text-[12px] text-black/60 italic; background: rgba(240, 233, 218, 0.82); }

  @media (max-width: 768px) {
    /* Height stays definite. This used to fall back to `height: auto` at the
       sources level, which was safe when the grid was the only child and sized
       itself — but the sources view is now a split of shares, and percentage tracks
       inside an auto-height parent collapse to content, leaving the timeline band
       nothing to measure. */
    .geo-map { height: 72dvh; }
  }
</style>
