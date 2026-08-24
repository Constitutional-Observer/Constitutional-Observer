<script>
  import TimelineSlider from "$lib/components/search/TimelineSlider.svelte";
  import Breadcrumbs from "$lib/components/search/views/Breadcrumbs.svelte";
  import { searchBox, searchParams, ui, viewNav } from "$lib/components/search/search-state.svelte.js";

  let {
    // Search bar
    searching = false,
    subtitle = "",
    // Loading progress
    loadingMore = false,
    loadProgress = "",
    loadPct = 0,
    // Data
    indices = [],
    collectionDebates = [],
    isStateCollection = true,
    allStates = [],
    // Filters (bindable — parent reacts to changes)
    selectedStates = $bindable(new Set()),
    yearMin = $bindable(""),
    yearMax = $bindable(""),
    // Bookmarks
    bookmarkCount = 0,
    // Callback
    onsearch,
  } = $props();

  // Computed inside the component — only depend on indices
  let indicesByCollection = $derived.by(() => {
    const grouped = {};
    for (const idx of indices) {
      const col = idx.collection || "Other";
      (grouped[col] ||= []).push(idx);
    }
    return grouped;
  });
  let semanticCount = $derived(indices.filter(i => i.semanticSearch).length);
  let totalDocs = $derived(indices.reduce((sum, i) => sum + (i.numberOfDocuments || 0), 0));

  function toggleState(s) {
    const next = new Set(selectedStates);
    next.has(s) ? next.delete(s) : next.add(s);
    selectedStates = next;
  }

  function toggleIndex(uid) {
    const next = new Set(searchParams.indexIds);
    next.has(uid) ? next.delete(uid) : next.add(uid);
    searchParams.indexIds = next;
  }

  // Filters section: closed by default on mobile, open by default on desktop
  let filtersOpen = $state(false);
  $effect(() => {
    filtersOpen = window.matchMedia("(min-width: 1000px)").matches;
  });

  // sharing is copying the current address.
  let shared = $state(false);
  function share() {
    navigator.clipboard.writeText(window.location.href);
    shared = true;
    setTimeout(() => (shared = false), 1500);
  }
</script>

<aside class="sidebar">
<section
  class="relative p-2 backdrop-opacity-50 bg-primaryLight/90 drop-shadow-xl border-4 border-primary"
>
  <!-- Where you are in the results. Published by the map, drawn here, so the trail
       reads as part of the query rather than as a caption on one panel. -->
  {#if viewNav.trail.length}
    <nav class="sidebar-trail">
      <Breadcrumbs trail={viewNav.trail} onnavigate={(k) => viewNav.to(k)} />
    </nav>
  {/if}

  <form class="mt-2" onsubmit={(e) => { e.preventDefault(); onsearch?.(); }}>
      <div class="flex items-center">
        <div class="search-input-wrap">
          <textarea
            class="p-1 !text-2xl w-full text-xs border border-primary caret-red"
            placeholder="Ask a question"
            bind:value={searchBox.query}
            disabled={searching}
          />
          {#if searching}
            <span class="search-ellipsis"></span>
          {/if}
        </div>
        <button type="submit" class="btn bg-primary text-white px-2 py-0.5 text-xs rounded-md ml-2" disabled={searching}>
          {searching ? "..." : "Go"}
        </button>
      </div>
  </form>

    {#if subtitle}
    <p class="md:text-sm text-pretty text-justify text-black/60">
      {subtitle}
    </p>
  {/if}


  {#if loadingMore}
    <div class="loading-bar">
      <div class="loading-bar-fill" style="width: {loadPct}%"></div>
    </div>
    <p class="loading-text">{loadProgress}</p>
  {/if}

  <div class="controls-row">
    <div class="action-row">
      <button class="bm-trigger" onclick={() => (ui.showBookmarks = true)} title="Bookmarks">
        <span class="btn-icon">★</span>
        <span class="btn-label">Bookmarks</span>
        <span class="bm-trigger-count">{bookmarkCount}</span>
      </button>
      <button class="bm-trigger" onclick={share} title="Share">
        <span class="btn-icon">⇧</span>
        <span class="btn-label">{shared ? "Copied!" : "Share"}</span>
      </button>
    </div>

    <details class="filters-accordion" bind:open={filtersOpen}>
      <summary class="filters-accordion-summary">
        <span>Filters</span>
        <span class="accordion-arrow"></span>
      </summary>
  <div class="filter-box">
    <!-- Timeline — accordion, open by default -->
    <details class="filter-accordion" open>
      <summary class="filter-accordion-summary">
        <span class="summary-label">Timeline</span>
        {#if yearMin || yearMax}
          <span class="filter-badge">{yearMin || "…"}–{yearMax || "…"}</span>
        {/if}
        <span class="accordion-arrow"></span>
      </summary>
      <div class="accordion-body">
        <TimelineSlider hits={collectionDebates} bind:yearMin bind:yearMax />
      </div>
    </details>

    <!-- States — accordion, closed by default -->
    {#if isStateCollection && allStates.length > 0}
      <details class="filter-accordion">
        <summary class="filter-accordion-summary">
          <span class="summary-label">States</span>
          {#if selectedStates.size > 0}
            <span class="filter-badge">{selectedStates.size} selected</span>
          {:else}
            <span class="summary-count">{allStates.length}</span>
          {/if}
          <span class="accordion-arrow"></span>
        </summary>
        <div class="accordion-body">
          <div class="state-filters">
            {#each allStates as s}
              <button
                class="state-filter-btn"
                class:selected={selectedStates.has(s)}
                onclick={() => toggleState(s)}
              >{s}</button>
            {/each}
          </div>
          {#if selectedStates.size > 0}
            <button class="clear-btn" onclick={() => selectedStates = new Set()}>Clear</button>
          {/if}
        </div>
      </details>
    {/if}

    <!-- Search params — accordion, closed by default -->
    <details class="filter-accordion">
      <summary class="filter-accordion-summary">
        <span class="summary-label">Search params</span>
        {#if searchParams.hybrid}
          <span class="filter-badge">hybrid {searchParams.semanticRatio}</span>
        {/if}
        <span class="accordion-arrow"></span>
      </summary>
      <div class="accordion-body">
        <div class="param-grid">
          <label class="param-label">Hybrid (semantic)</label>
          <input type="checkbox" bind:checked={searchParams.hybrid} />
          {#if searchParams.hybrid}
            <label class="param-label">Semantic ratio <span class="param-value">{searchParams.semanticRatio}</span></label>
            <input type="range" step="0.01" min="0" max="1" bind:value={searchParams.semanticRatio} class="param-slider" />
          {/if}
          <label class="param-label">Score threshold</label>
          <input type="number" step="0.01" min="0" max="1" bind:value={searchParams.scoreThreshold} class="param-input" />
        </div>
        <p class="param-hint">Changes apply on next search</p>
      </div>
    </details>

    <!-- Indices — accordion, closed by default -->
    <details class="filter-accordion">
      <summary class="filter-accordion-summary">
        <span class="summary-label">Indices ({indices.length}){searchParams.indexIds.size > 0 ? ` · ${searchParams.indexIds.size} selected` : ''}</span>
        <span class="indices-pills">
          <span class="semantic-pill">{semanticCount} semantic</span>
          <span class="docs-pill">{totalDocs.toLocaleString()}</span>
        </span>
        <span class="accordion-arrow"></span>
      </summary>
      <div class="accordion-body">
        <div class="idx-controls">
          <button class="idx-control-btn" onclick={() => searchParams.indexIds = new Set(indices.map(i => i.uid))}>All</button>
          <button class="idx-control-btn" onclick={() => searchParams.indexIds = new Set()}>None</button>
          {#if searchParams.indexIds.size === 0}
            <span class="idx-hint">None = search all</span>
          {/if}
        </div>

        {#each Object.entries(indicesByCollection) as [col, idxList] (col)}
          <div class="idx-group">
            <span class="idx-group-label">{col}</span>
            {#each idxList as idx (idx.uid)}
              <button
                class="idx-row"
                class:idx-row-selected={searchParams.indexIds.has(idx.uid)}
                title={idx.annotation || idx.uid}
                onclick={() => toggleIndex(idx.uid)}
              >
                <span
                  class="idx-dot"
                  class:idx-dot-semantic={idx.semanticSearch}
                  title={idx.semanticSearch ? `Embedders: ${idx.embedders.join(', ')}` : 'Keyword only'}
                ></span>
                <span class="idx-name" title={idx.uid}>{idx.label || idx.uid}</span>
                <span class="idx-docs">{(idx.numberOfDocuments || 0).toLocaleString()}</span>
                {#if idx.isIndexing}
                  <span class="idx-indexing" title="Currently indexing">...</span>
                {/if}
              </button>
              {#if idx.semanticSearch}
                <div class="idx-embedders">
                  {#each idx.embedders as emb}
                    <span class="idx-embedder-tag">{emb}</span>
                  {/each}
                </div>
              {/if}
            {/each}
          </div>
        {/each}

        <div class="idx-legend">
          <span class="idx-dot idx-dot-semantic"></span>
          <span class="legend-text">Semantic</span>
          <span class="idx-dot"></span>
          <span class="legend-text">Keyword only</span>
        </div>
      </div>
    </details>
  </div>
  </details>
  </div>
</section>
</aside>

<style lang="postcss">
  @reference "../../../app.css";

  .sidebar {
    @apply shrink-0 sticky top-[6%] self-start max-h-full overflow-y-auto z-20;
    container-type: inline-size;
  }

  @media (max-width: 1000px) {
    .sidebar { width: 100%; overflow-y: visible; }
  }

  /* Loading bar */
  .loading-bar {
    @apply mt-2 h-1 rounded-full bg-primary/20 overflow-hidden;
  }
  .loading-bar-fill {
    @apply h-full bg-emerald-500 rounded-full transition-all duration-300;
  }
  .loading-text {
    @apply text-[9px] text-black/40 mt-0.5 italic;
  }

  .filter-box {
    @apply bg-white/60 backdrop-blur-sm rounded-lg p-1 border border-primary/30 space-y-3;
  }

  /* Controls row — bookmarks/share above the Filters accordion trigger, always
     stacked; when the sidebar itself is narrow the trigger buttons collapse
     to icons to save space instead of reflowing into a row. */
  .controls-row {
    @apply flex flex-col;
  }

  /* Filters — top-level accordion, closed on mobile / open on desktop by default */
  .filters-accordion {
    @apply mt-3 overflow-hidden;
  }
  .filters-accordion-summary {
    @apply flex flex-wrap items-center justify-between gap-1 px-3 py-1 cursor-pointer select-none list-none;
    @apply bg-white/60 backdrop-blur-sm border border-primary/30 rounded-lg text-black/70 font-semibold text-xs;
    @apply transition hover:bg-primary/20;
  }
  .filters-accordion-summary::-webkit-details-marker { display: none; }
  .filters-accordion-summary::marker { display: none; }
  .filters-accordion[open] > .filters-accordion-summary {
    @apply rounded-b-none border-b-0;
  }
  .filters-accordion[open] .accordion-arrow {
    transform: rotate(180deg);
  }
  .filters-accordion .filter-box {
    @apply rounded-t-none border-t-0 mt-0;
  }

  /* Bookmarks/Share row — sits below the title bar, above the filters */
  .action-row {
    @apply mt-3 flex items-stretch gap-2;
  }
  .bm-trigger {
    @apply flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 cursor-pointer;
    @apply bg-white/60 backdrop-blur-sm border border-primary/30 text-black/70 font-semibold text-xs;
    @apply transition hover:bg-primary/20;
  }
  .bm-trigger-count {
    @apply text-[10px] font-mono font-bold px-1.5 rounded bg-black/10 text-black/50;
  }
  .btn-icon { @apply hidden; }

  /* Below this, the sidebar itself is too narrow for full-label buttons —
     keyed on the sidebar's own rendered width (a container query), not the
     viewport: on desktop the sidebar is a ~15vw grid rail that can be this
     narrow even when the viewport is wide. */
  @container (max-width: 260px) {
    .action-row { @apply gap-1.5; }
    .bm-trigger { @apply relative flex-none px-2 py-2 gap-0; }
    .btn-icon { @apply block text-sm leading-none; }
    .btn-label { @apply hidden; }
    .bm-trigger-count { @apply absolute -top-1 -right-1 text-[8px] px-1 leading-tight; }
  }

  /* Accordion */
  .filter-accordion {
    @apply border border-primary/20 rounded-md overflow-hidden;
  }

  .filter-accordion-summary {
    @apply flex flex-wrap items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none list-none;
    @apply bg-white/40 hover:bg-primary/10 transition-colors;
  }

  .filter-accordion-summary::-webkit-details-marker { display: none; }
  .filter-accordion-summary::marker { display: none; }

  .summary-label {
    @apply text-[10px] font-bold text-black/60 uppercase tracking-wider flex-1;
  }

  .summary-count {
    @apply text-[9px] font-mono text-black/30;
  }

  .filter-badge {
    @apply text-[8px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-semibold;
  }

  .accordion-arrow {
    @apply block w-3 h-3 shrink-0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' stroke='%23999' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    transition: transform 0.15s;
  }

  .filter-accordion[open] .accordion-arrow {
    transform: rotate(180deg);
  }

  .accordion-body {
    @apply px-2 py-2 space-y-2 bg-white/20;
  }

  /* States */
  .state-filters { @apply flex flex-wrap gap-1; }
  .state-filter-btn {
    @apply text-[0.8em] px-1.5 py-0.5 rounded border border-primary/20 bg-white/60 text-black/60 transition-all;
    @apply hover:bg-primary/20;
  }
  .state-filter-btn::after { content: ""; }
  .state-filter-btn.selected { @apply bg-primary/40 border-primary text-black/90 font-semibold; }
  .clear-btn { @apply text-[9px] text-blue-700 underline; }
  .clear-btn::after { content: ""; }

  /* Search params */
  .param-grid { @apply grid grid-cols-2 gap-x-2 gap-y-1 items-center; }
  .param-label { @apply text-[9px] text-black/50; }
  .param-input { @apply w-full text-[11px] px-1.5 py-0.5 rounded border border-primary/30 bg-white/80 font-mono; }
  .param-slider {
    @apply w-full h-1.5 rounded-full appearance-none cursor-pointer;
    @apply bg-primary/30 accent-emerald-600;
  }
  .param-value { @apply font-mono text-[10px] text-black/70 ml-1; }
  .param-hint { @apply text-[8px] text-black/30 italic; }

  /* Indices */
  .indices-pills { @apply flex flex-wrap gap-1; }
  .semantic-pill { @apply text-[8px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-medium; }
  .docs-pill { @apply text-[8px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-mono; }
  .idx-controls { @apply flex flex-wrap items-center gap-2; }
  .idx-control-btn {
    @apply text-[9px] px-1.5 py-0.5 rounded border border-primary/20 bg-white/60 text-black/60 transition-all;
    @apply hover:bg-primary/20;
  }
  .idx-control-btn::after { content: ""; }
  .idx-hint { @apply text-[8px] text-black/30 italic ml-1; }
  .idx-group { @apply mt-1; }
  .idx-group-label { @apply text-[9px] font-semibold text-black/40 uppercase tracking-wider; }
  .idx-row {
    @apply w-full flex items-center gap-1.5 py-0.5 text-[10px] text-left bg-transparent border border-transparent rounded px-1 cursor-pointer transition-all;
    @apply hover:bg-primary/10;
  }
  .idx-row::after { content: ""; }
  .idx-row-selected { @apply bg-primary/20 border-primary/40 font-semibold; }
  .idx-dot { @apply w-2 h-2 rounded-full bg-gray-300 shrink-0; }
  .idx-dot-semantic { @apply bg-emerald-500; }
  .idx-name { @apply flex-1 truncate text-black/70 font-mono text-[9px]; }
  .idx-docs { @apply text-black/40 font-mono text-[9px] shrink-0; }
  .idx-indexing { @apply text-amber-600 text-[9px] animate-pulse; }
  .idx-embedders { @apply flex flex-wrap gap-1 ml-3.5 mb-0.5; }
  .idx-embedder-tag { @apply text-[8px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 font-mono; }
  .idx-legend { @apply flex items-center gap-1.5 mt-2 pt-2 border-t border-primary/10 text-[9px] text-black/40; }
  .legend-text { @apply mr-2; }

  /* Search input */
  .search-input-wrap { @apply relative flex-1; }
  .search-ellipsis {
    @apply absolute right-2 top-1/2 -translate-y-1/2 text-xs text-black/40 font-mono;
  }
  .search-ellipsis::after {
    content: "";
    animation: ellipsis 1.2s steps(4, end) infinite;
  }
  @keyframes ellipsis {
    0% { content: ""; }
    25% { content: "."; }
    50% { content: ".."; }
    75% { content: "..."; }
  }
</style>
