<script>
  import IndiaMap from "$lib/components/search/IndiaMap.svelte";
  import TimelineSlider from "$lib/components/search/TimelineSlider.svelte";
  import TitleWithNav from "$lib/components/general/TitleWithNav.svelte";

  let {
    // Search bar
    searchInput = $bindable(""),
    searching = false,
    subtitle = "",
    // Loading progress
    loadingMore = false,
    loadProgress = "",
    loadPct = 0,
    // Data
    indices = [],
    collectionDebates = [],
    resultsByStateForMap = {},
    isStateCollection = true,
    allStates = [],
    // Filters (bindable — parent reacts to changes)
    selectedStates = $bindable(new Set()),
    yearMin = $bindable(""),
    yearMax = $bindable(""),
    selectedIndexIds = $bindable(new Set()),
    // Search params (bindable)
    paramHybrid = $bindable(false),
    paramSemanticRatio = $bindable(0.5),
    paramScoreThreshold = $bindable(0.1),
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

  function handleStateClick(e) {
    const state = e.detail?.state ?? e.state;
    if (state) toggleState(state);
  }

  function toggleIndex(uid) {
    const next = new Set(selectedIndexIds);
    next.has(uid) ? next.delete(uid) : next.add(uid);
    selectedIndexIds = next;
  }
</script>

<aside class="sidebar">
  <TitleWithNav title={searchInput} {subtitle}>
    <form class="mt-2" onsubmit={(e) => { e.preventDefault(); onsearch?.(); }}>
      <div class="flex items-center">
        <div class="search-input-wrap">
          <input
            type="text"
            class="p-1 w-full text-xs text-gray-300"
            placeholder="Ask a question"
            bind:value={searchInput}
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
  </TitleWithNav>

  {#if loadingMore}
    <div class="loading-bar">
      <div class="loading-bar-fill" style="width: {loadPct}%"></div>
    </div>
    <p class="loading-text">{loadProgress}</p>
  {/if}

  <div class="filter-box">
    <!-- Map — no accordion -->
    {#if isStateCollection}
      <IndiaMap resultsByState={resultsByStateForMap} {selectedStates} onstateclick={handleStateClick} />
    {/if}

    <!-- Timeline — no accordion -->
    <TimelineSlider hits={collectionDebates} bind:yearMin bind:yearMax />

    <!-- States — accordion, open by default -->
    {#if isStateCollection && allStates.length > 0}
      <details class="filter-accordion" open>
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
        {#if paramHybrid}
          <span class="filter-badge">hybrid {paramSemanticRatio}</span>
        {/if}
        <span class="accordion-arrow"></span>
      </summary>
      <div class="accordion-body">
        <div class="param-grid">
          <label class="param-label">Hybrid (semantic)</label>
          <input type="checkbox" bind:checked={paramHybrid} />
          {#if paramHybrid}
            <label class="param-label">Semantic ratio <span class="param-value">{paramSemanticRatio}</span></label>
            <input type="range" step="0.01" min="0" max="1" bind:value={paramSemanticRatio} class="param-slider" />
          {/if}
          <label class="param-label">Score threshold</label>
          <input type="number" step="0.01" min="0" max="1" bind:value={paramScoreThreshold} class="param-input" />
        </div>
        <p class="param-hint">Changes apply on next search</p>
      </div>
    </details>

    <!-- Indices — accordion, closed by default -->
    <details class="filter-accordion">
      <summary class="filter-accordion-summary">
        <span class="summary-label">Indices ({indices.length}){selectedIndexIds.size > 0 ? ` · ${selectedIndexIds.size} selected` : ''}</span>
        <span class="indices-pills">
          <span class="semantic-pill">{semanticCount} semantic</span>
          <span class="docs-pill">{totalDocs.toLocaleString()}</span>
        </span>
        <span class="accordion-arrow"></span>
      </summary>
      <div class="accordion-body">
        <div class="idx-controls">
          <button class="idx-control-btn" onclick={() => selectedIndexIds = new Set(indices.map(i => i.uid))}>All</button>
          <button class="idx-control-btn" onclick={() => selectedIndexIds = new Set()}>None</button>
          {#if selectedIndexIds.size === 0}
            <span class="idx-hint">None = search all</span>
          {/if}
        </div>

        {#each Object.entries(indicesByCollection) as [col, idxList] (col)}
          <div class="idx-group">
            <span class="idx-group-label">{col}</span>
            {#each idxList as idx (idx.uid)}
              <button
                class="idx-row"
                class:idx-row-selected={selectedIndexIds.has(idx.uid)}
                onclick={() => toggleIndex(idx.uid)}
              >
                <span
                  class="idx-dot"
                  class:idx-dot-semantic={idx.semanticSearch}
                  title={idx.semanticSearch ? `Embedders: ${idx.embedders.join(', ')}` : 'Keyword only'}
                ></span>
                <span class="idx-name">{idx.uid}</span>
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
</aside>

<style lang="postcss">
  .sidebar {
    @apply shrink-0 overflow-y-auto;
    width: 280px;
    min-height: 0;
  }

  @media (max-width: 768px) {
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
    @apply mt-3 bg-white/60 backdrop-blur-sm rounded-lg p-3 border border-primary/30 space-y-3;
  }

  /* Accordion */
  .filter-accordion {
    @apply border border-primary/20 rounded-md overflow-hidden;
  }

  .filter-accordion-summary {
    @apply flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none list-none;
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
    @apply text-[9px] px-1.5 py-0.5 rounded border border-primary/20 bg-white/60 text-black/60 transition-all;
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
  .indices-pills { @apply flex gap-1 shrink-0; }
  .semantic-pill { @apply text-[8px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-medium; }
  .docs-pill { @apply text-[8px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-mono; }
  .idx-controls { @apply flex items-center gap-2; }
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
