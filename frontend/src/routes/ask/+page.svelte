<script>
  import MainSearch from "$lib/components/MainSearch.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import IndiaMap from "$lib/components/IndiaMap.svelte";
  import TitleWithNav from "$lib/components/TitleWithNav.svelte";
  import { goto } from "$app/navigation";
  import { tick } from "svelte";

  let { data } = $props();

  // Local UI state
  let searchInput = $state("");
  $effect(() => { searchInput = data.searchParams?.query || ""; });
  let activeCollection = $state(null);
  let selectedStates = $state(new Set());
  let yearMin = $state("");
  let yearMax = $state("");
  let selectedHitIndex = $state(null);
  let copiedId = $state(null);
  let fullDocs = $state({});
  let showIndices = $state(true);
  let selectedIndexUids = $state(new Set());

  // Search params (user-adjustable)
  let paramHybrid = $state(false);
  let paramSemanticRatio = $state(0.5);
  let paramLimit = $state(50);
  let paramScoreThreshold = $state(0.58);

  const METADATA_KEYS = [
    "house", "session", "term_number", "term_start", "term_end",
    "section_type", "languages", "state_code",
  ];

  // --- Derived data ---

  let hasQuery = $derived(!!data.searchParams?.query);
  let debates = $derived(Array.isArray(data.debates) ? data.debates : []);
  let collections = $derived(data.collections || []);
  let indices = $derived(data.indices || []);

  let currentOffset = $derived(data.searchParams?.offset || 0);
  let currentLimit = $derived(data.searchParams?.limit || 50);
  let totalEstimated = $derived(data.totalEstimated || 0);
  let hasNextPage = $derived(currentOffset + currentLimit < totalEstimated);
  let hasPrevPage = $derived(currentOffset > 0);

  let isStateCollection = $derived(!activeCollection || activeCollection === "State Legislatures");

  // Filter: collection -> state -> year
  let filteredHits = $derived.by(() => {
    let hits = debates;
    if (activeCollection) {
      hits = hits.filter(h => h._collection === activeCollection);
    }
    if (selectedStates.size > 0) {
      hits = hits.filter(h => selectedStates.has(h.state || "Unknown"));
    }
    if (yearMin) {
      hits = hits.filter(h => !h.year || h.year >= Number(yearMin));
    }
    if (yearMax) {
      hits = hits.filter(h => !h.year || h.year <= Number(yearMax));
    }
    return hits;
  });

  let rankedHits = $derived(
    [...filteredHits].sort((a, b) => (b._bestScore || 0) - (a._bestScore || 0))
  );

  // For the map: group by state from collection-filtered (not year/state filtered) debates
  let collectionDebates = $derived(
    activeCollection ? debates.filter(h => h._collection === activeCollection) : debates
  );
  let resultsByStateForMap = $derived(groupByState(collectionDebates));
  let allStates = $derived([...new Set(collectionDebates.map(h => h.state || "Unknown"))].sort());
  let stateNames = $derived(Object.keys(groupByState(filteredHits)).sort((a, b) => {
    if (a === "Unknown") return 1;
    if (b === "Unknown") return -1;
    return a.localeCompare(b);
  }));

  let allYears = $derived(collectionDebates.map(h => h.year).filter(Boolean));
  let globalMinYear = $derived(allYears.length ? Math.min(...allYears) : 0);
  let globalMaxYear = $derived(allYears.length ? Math.max(...allYears) : 0);

  // Detail panel selection
  let effectiveIndex = $derived(
    selectedHitIndex != null && selectedHitIndex < rankedHits.length
      ? selectedHitIndex
      : rankedHits.length > 0 ? 0 : null
  );
  let selectedHit = $derived(effectiveIndex != null ? rankedHits[effectiveIndex] : null);

  // Indices sidebar
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

  // --- Helpers ---

  function groupByState(hits) {
    const grouped = {};
    for (const hit of hits) {
      const s = hit.state || "Unknown";
      (grouped[s] ||= []).push(hit);
    }
    return grouped;
  }

  function hitDate(hit) {
    if (!hit.year) return null;
    const m = String(hit.month || 1).padStart(2, "0");
    const d = String(hit.day || 1).padStart(2, "0");
    return `${hit.year}-${m}-${d}`;
  }

  function hitPreview(hit) {
    const text = hit._matchedChunks?.[0]?.text || hit.__discussions || "";
    return text.length > 150 ? text.slice(0, 150) + "..." : text;
  }

  function metaTags(hit) {
    const tags = [];
    for (const key of METADATA_KEYS) {
      if (hit[key] != null && hit[key] !== "") {
        let val = Array.isArray(hit[key]) ? hit[key].join(", ") : String(hit[key]);
        tags.push({ key, label: key.replace(/_/g, " "), value: val });
      }
    }
    return tags;
  }

  function docKey(hit) {
    return `${hit._index || hit.state_code}:${hit.file_name}`;
  }

  // --- Actions ---

  function buildSearchParams(overrides = {}) {
    const params = new URLSearchParams({
      query: searchInput,
      hybrid: paramHybrid,
      semanticRatio: paramSemanticRatio,
      limit: paramLimit,
      scoreThreshold: paramScoreThreshold,
      ...overrides,
    });
    if (selectedIndexUids.size > 0) {
      params.set("indices", [...selectedIndexUids].join(","));
    }
    return params;
  }

  function handleSubmit() {
    fullDocs = {};
    selectedHitIndex = null;
    goto(`/ask?${buildSearchParams().toString()}`, { invalidateAll: true });
  }

  function goToPage(newOffset) {
    goto(`/ask?${buildSearchParams({ offset: newOffset }).toString()}`, { invalidateAll: true });
  }

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
    const next = new Set(selectedIndexUids);
    next.has(uid) ? next.delete(uid) : next.add(uid);
    selectedIndexUids = next;
  }

  function copyText(text, id) {
    navigator.clipboard.writeText(text);
    copiedId = id;
    setTimeout(() => { if (copiedId === id) copiedId = null; }, 1500);
  }

  async function loadFullDocument(hit) {
    const key = docKey(hit);
    if (fullDocs[key]) return;
    if (!hit._index || !hit.file_name) return;

    fullDocs[key] = { loading: true, chunks: [] };
    const highlightIds = (hit._matchedChunks || []).map(c => c.chunk_id).join(",");

    try {
      const resp = await fetch(
        `/api/document?index=${encodeURIComponent(hit._index)}&file_name=${encodeURIComponent(hit.file_name)}&highlight_chunks=${highlightIds}`
      );
      const d = await resp.json();
      fullDocs[key] = { loading: false, chunks: d.chunks || [] };
    } catch {
      fullDocs[key] = { loading: false, chunks: [] };
    }

    await tick();
    const firstChunkId = hit._matchedChunks?.[0]?.chunk_id;
    if (firstChunkId != null) {
      document.getElementById(`chunk-${key}-${firstChunkId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
</script>

<svelte:head>
  <title>Ask a question to the Constitutional Observer</title>
  <meta name="description" content="The Constitutional Observer provides a comparative interface to understand current and past parliamentary discourse in India." />
</svelte:head>

<div id="container">
  {#if !hasQuery}
    <div class="md:p-20 h-auto">
      <MainSearch />
    </div>
  {:else}
    <div class="page-layout">
      <!-- Sidebar -->
      <aside class="sidebar">
        <TitleWithNav
          title={searchInput}
          subtitle="{filteredHits.length} documents, {data.hitCount || 0} results of {data.totalEstimated || 0} total{isStateCollection ? `, ${stateNames.length} states` : ''}{activeCollection ? ` in ${activeCollection}` : ''}"
        >
          <form class="mt-2" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            <div class="flex">
              <input type="text" class="p-1 mr-2 w-full text-xs text-gray-300" placeholder="Ask a question" bind:value={searchInput} autofocus />
              <button type="submit" class="btn bg-primary text-white px-2 py-0.5 text-xs rounded-md">Go</button>
            </div>
          </form>
        </TitleWithNav>

        <div class="filter-box">
          {#if collections.length > 1}
            <div class="collection-tabs">
              <button
                class="collection-tab"
                class:collection-tab-active={!activeCollection}
                onclick={() => { activeCollection = null; selectedStates = new Set(); selectedHitIndex = null; }}
              >All</button>
              {#each collections as col}
                <button
                  class="collection-tab"
                  class:collection-tab-active={activeCollection === col}
                  onclick={() => { activeCollection = activeCollection === col ? null : col; selectedStates = new Set(); selectedHitIndex = null; }}
                >{col}</button>
              {/each}
            </div>
          {/if}

          {#if isStateCollection}
            <IndiaMap resultsByState={resultsByStateForMap} {selectedStates} onstateclick={handleStateClick} />
            <div class="filter-section">
              <label class="filter-label">States</label>
              <div class="state-filters">
                {#each allStates as s}
                  <button class="state-filter-btn" class:selected={selectedStates.has(s)} onclick={() => toggleState(s)}>{s}</button>
                {/each}
              </div>
            </div>
          {/if}

          <div class="filter-section">
            <label class="filter-label">Time period</label>
            {#if globalMinYear}
              <span class="filter-range">{globalMinYear} – {globalMaxYear}</span>
            {/if}
            <div class="year-inputs">
              <input type="number" placeholder="From" bind:value={yearMin} min={globalMinYear} max={globalMaxYear} class="year-input" />
              <span class="year-dash">–</span>
              <input type="number" placeholder="To" bind:value={yearMax} min={globalMinYear} max={globalMaxYear} class="year-input" />
            </div>
          </div>

          {#if yearMin || yearMax || selectedStates.size > 0}
            <button class="clear-btn" onclick={() => { yearMin = ""; yearMax = ""; selectedStates = new Set(); }}>Clear filters</button>
          {/if}

          <div class="filter-section">
            <label class="filter-label">Search params</label>
            <div class="param-grid">
              <label class="param-label">Hybrid (semantic)</label>
              <input type="checkbox" bind:checked={paramHybrid} class="param-checkbox" />
              {#if paramHybrid}
                <label class="param-label">Semantic ratio <span class="param-value">{paramSemanticRatio}</span></label>
                <input type="range" step="0.01" min="0" max="1" bind:value={paramSemanticRatio} class="param-slider" />
              {/if}
              <label class="param-label">Limit</label>
              <input type="number" step="1" min="1" max="200" bind:value={paramLimit} class="param-input" />
              <label class="param-label">Score threshold</label>
              <input type="number" step="0.01" min="0" max="1" bind:value={paramScoreThreshold} class="param-input" />
            </div>
            <p class="param-hint">Changes apply on next search</p>
          </div>

          <!-- Indices panel -->
          <div class="filter-section">
            <button class="indices-toggle" onclick={() => showIndices = !showIndices}>
              <span class="filter-label" style="cursor:pointer">Indices ({indices.length}){selectedIndexUids.size > 0 ? ` · ${selectedIndexUids.size} selected` : ''}</span>
              <span class="indices-summary">
                <span class="semantic-pill">{semanticCount} semantic</span>
                <span class="docs-pill">{totalDocs.toLocaleString()} docs</span>
              </span>
              <span class="toggle-arrow">{showIndices ? '\u25BE' : '\u25B8'}</span>
            </button>

            {#if showIndices}
              <div class="idx-controls">
                <button class="idx-control-btn" onclick={() => selectedIndexUids = new Set(indices.map(i => i.uid))}>All</button>
                <button class="idx-control-btn" onclick={() => selectedIndexUids = new Set()}>None</button>
                {#if selectedIndexUids.size === 0}
                  <span class="idx-hint">None selected = search all</span>
                {/if}
              </div>

              {#each Object.entries(indicesByCollection) as [col, idxList] (col)}
                <div class="idx-group">
                  <span class="idx-group-label">{col}</span>
                  {#each idxList as idx (idx.uid)}
                    <button class="idx-row" class:idx-row-selected={selectedIndexUids.has(idx.uid)} onclick={() => toggleIndex(idx.uid)}>
                      <span class="idx-dot" class:idx-dot-semantic={idx.semanticSearch} title={idx.semanticSearch ? `Embedders: ${idx.embedders.join(', ')}` : 'No semantic search'}></span>
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
                <span class="idx-dot idx-dot-semantic"></span> <span class="legend-text">Semantic</span>
                <span class="idx-dot"></span> <span class="legend-text">Keyword only</span>
              </div>
            {/if}
          </div>
        </div>
      </aside>

      <!-- Results list -->
      <main class="results-list">
        {#each rankedHits as hit, i (hit.id || i)}
          <!-- Mobile -->
          <details class="accordion mobile-only" open={i < 3}>
            <summary>
              <div class="result-summary">
                <span class="score-badge">{(hit._bestScore || 0).toFixed(3)}</span>
                <div class="result-info">
                  <div class="result-head">
                    <span class="state-badge">{hit.state || "Unknown"}</span>
                    {#if hitDate(hit)}<span class="date-badge">{hitDate(hit)}</span>{/if}
                    <h4 class="result-title">{hit.title_en || hit.subject || "Untitled"}</h4>
                  </div>
                  <p class="result-preview">{hitPreview(hit)}</p>
                </div>
              </div>
            </summary>
            <div class="accordion-content">
              {#if hit._matchedChunks?.length}
                <p class="matched-label">{hit._matchedChunks.length} matched section{hit._matchedChunks.length > 1 ? "s" : ""}</p>
                {#each hit._matchedChunks as mc (mc.chunk_id)}
                  <div class="matched-chunk">
                    <div class="chunk-header">
                      <span class="chunk-id">#{mc.chunk_id} &middot; {mc.score?.toFixed(3) || ""}</span>
                      <button class="copy-btn" onclick={() => copyText(mc.text, `mc-${hit.id}-${mc.chunk_id}`)}>
                        {copiedId === `mc-${hit.id}-${mc.chunk_id}` ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p>{mc.text}</p>
                  </div>
                {/each}
              {:else}
                <blockquote class="result-excerpt">{hit.__discussions || ""}</blockquote>
              {/if}
              {#if !fullDocs[docKey(hit)]}
                <button class="load-doc-btn" onclick={() => loadFullDocument(hit)}>Load full document</button>
              {:else if fullDocs[docKey(hit)].loading}
                <p class="doc-loading">Loading...</p>
              {:else if fullDocs[docKey(hit)].chunks.length > 0}
                <div class="full-doc">
                  <p class="doc-info">{fullDocs[docKey(hit)].chunks.length} chunks in document</p>
                  {#each fullDocs[docKey(hit)].chunks as chunk (chunk.chunk_id)}
                    <div id="chunk-{docKey(hit)}-{chunk.chunk_id}" class="doc-chunk" class:doc-chunk-highlight={chunk.isHighlighted}>
                      <span class="chunk-id">#{chunk.chunk_id}</span>
                      <p>{chunk.text}</p>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="doc-loading">Could not load document.</p>
              {/if}
            </div>
          </details>

          <!-- Desktop -->
          <button
            class="result-card desktop-only"
            class:result-card-active={effectiveIndex === i}
            onclick={() => selectedHitIndex = selectedHitIndex === i ? null : i}
          >
            <div class="result-summary">
              <span class="score-badge">{(hit._bestScore || 0).toFixed(3)}</span>
              <div class="result-info">
                <div class="result-head">
                  <span class="state-badge">{hit.state || "Unknown"}</span>
                  {#if hitDate(hit)}<span class="date-badge">{hitDate(hit)}</span>{/if}
                  <h4 class="result-title">{hit.title_en || hit.subject || "Untitled"}</h4>
                </div>
                <p class="result-preview">{hitPreview(hit)}</p>
                <div class="meta-tags">
                  {#if hit._matchedChunks?.length > 1}
                    <span class="meta-tag chunks-tag">{hit._matchedChunks.length} chunks</span>
                  {/if}
                  {#each metaTags(hit) as tag (tag.key)}
                    <span class="meta-tag">{tag.label}: {tag.value}</span>
                  {/each}
                  {#if hit.archive_link}
                    <a href={hit.archive_link} target="_blank" class="meta-tag meta-link" onclick={(e) => e.stopPropagation()}>archive</a>
                  {/if}
                </div>
              </div>
            </div>
          </button>
        {/each}
      </main>

      <!-- Detail panel -->
      {#if selectedHit}
        <section class="detail-panel desktop-only">
          <div class="detail-header">
            <h3 class="detail-title">{selectedHit.title_en || selectedHit.subject || "Untitled"}</h3>
            <div class="result-head">
              <span class="state-badge">{selectedHit.state || "Unknown"}</span>
              {#if hitDate(selectedHit)}<span class="date-badge">{hitDate(selectedHit)}</span>{/if}
            </div>
            <div class="meta-tags">
              {#each metaTags(selectedHit) as tag (tag.key)}
                <span class="meta-tag">{tag.label}: {tag.value}</span>
              {/each}
              {#if selectedHit.archive_link}
                <a href={selectedHit.archive_link} target="_blank" class="meta-tag meta-link">archive</a>
              {/if}
            </div>
          </div>

          {#if selectedHit._matchedChunks?.length}
            <p class="matched-label">{selectedHit._matchedChunks.length} matched section{selectedHit._matchedChunks.length > 1 ? "s" : ""}</p>
            {#each selectedHit._matchedChunks as mc (mc.chunk_id)}
              <div class="matched-chunk">
                <div class="chunk-header">
                  <span class="chunk-id">#{mc.chunk_id} &middot; {mc.score?.toFixed(3) || ""}</span>
                  <button class="copy-btn" onclick={() => copyText(mc.text, `mc-${selectedHit.id}-${mc.chunk_id}`)}>
                    {copiedId === `mc-${selectedHit.id}-${mc.chunk_id}` ? "Copied" : "Copy"}
                  </button>
                </div>
                <p>{mc.text}</p>
              </div>
            {/each}
          {:else}
            <blockquote class="result-excerpt">
              {selectedHit.__discussions || ""}
              <button class="copy-btn" onclick={() => copyText(selectedHit.__discussions || "", `ex-${selectedHit.id}`)}>
                {copiedId === `ex-${selectedHit.id}` ? "Copied" : "Copy"}
              </button>
            </blockquote>
          {/if}

          {#if !fullDocs[docKey(selectedHit)]}
            <button class="load-doc-btn" onclick={() => loadFullDocument(selectedHit)}>Load full document</button>
          {:else if fullDocs[docKey(selectedHit)].loading}
            <p class="doc-loading">Loading...</p>
          {:else if fullDocs[docKey(selectedHit)].chunks.length > 0}
            <div class="full-doc">
              <p class="doc-info">{fullDocs[docKey(selectedHit)].chunks.length} chunks in document</p>
              {#each fullDocs[docKey(selectedHit)].chunks as chunk (chunk.chunk_id)}
                <div id="chunk-{docKey(selectedHit)}-{chunk.chunk_id}" class="doc-chunk" class:doc-chunk-highlight={chunk.isHighlighted}>
                  <span class="chunk-id">#{chunk.chunk_id}</span>
                  <p>{chunk.text}</p>
                </div>
              {/each}
            </div>
          {:else}
            <p class="doc-loading">Could not load document.</p>
          {/if}
        </section>
      {/if}
    </div>
  {/if}
</div>
<Footer />

<style lang="postcss">
  #container {
    background-image: url("/Constitution_of_India_inside_4.webp");
    background-repeat: no-repeat;
    background-position: center;
    background-size: cover;
    min-height: 100vh;
  }

  .page-layout {
    @apply flex gap-4 py-6 px-4 mx-auto;
    max-width: 1400px;
  }

  @media (max-width: 768px) {
    .page-layout { @apply flex-col; }
  }

  .sidebar {
    @apply shrink-0 md:sticky md:top-4 md:self-start;
    width: 280px;
  }

  @media (max-width: 768px) {
    .sidebar { width: 100%; }
  }

  .filter-box {
    @apply mt-3 bg-white/60 backdrop-blur-sm rounded-lg p-3 border border-primary/30 space-y-3;
  }

  .mobile-only { display: none; }
  .desktop-only { display: block; }
  button.desktop-only { display: block; }

  @media (max-width: 768px) {
    .mobile-only { display: block; }
    .desktop-only { display: none !important; }
  }

  .results-list {
    @apply flex-1 min-w-0 overflow-y-auto;
    max-height: calc(100vh - 3rem);
  }

  @media (max-width: 768px) {
    .results-list { max-height: none; }
  }

  .result-card {
    @apply w-full text-left bg-primaryLight rounded-lg p-3 mb-2 transition cursor-pointer border-2 border-transparent;
  }
  .result-card:hover { @apply bg-primary/30; }
  .result-card-active { @apply bg-primary/40 border-primary/60; }

  .detail-panel {
    @apply md:sticky md:top-4 md:self-start overflow-y-auto rounded-lg bg-primaryLight/80 backdrop-blur-sm p-4 border border-primary/30;
    width: 420px;
    max-height: calc(100vh - 3rem);
  }
  .detail-header { @apply space-y-2 mb-4 pb-3 border-b border-primary/20; }
  .detail-title { @apply text-base font-bold text-black/90; }
  .result-summary { @apply flex items-start gap-3 w-full; }
  .score-badge { @apply shrink-0 text-sm font-mono font-bold px-2 py-1 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300; }
  .result-info { @apply flex-1 min-w-0; }
  .state-badge { @apply text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200; }
  .collection-tabs { @apply flex flex-wrap gap-1; }
  .collection-tab {
    @apply text-[10px] px-2 py-1 rounded-md border border-primary/20 bg-white/60 text-black/60 transition-all font-medium;
    @apply hover:bg-primary/20;
  }
  .collection-tab-active { @apply bg-primary/40 border-primary text-black/90 font-bold; }
  .filter-section { @apply space-y-1; }
  .filter-label { @apply text-[10px] font-bold text-black/50 uppercase tracking-wider; }
  .filter-range { @apply text-[10px] text-black/40 font-mono ml-2; }
  .year-inputs { @apply flex items-center gap-1; }
  .year-input { @apply w-16 text-[11px] px-1.5 py-1 rounded border border-primary/30 bg-white/80 font-mono; }
  .year-dash { @apply text-black/30 text-xs; }
  .state-filters { @apply flex flex-wrap gap-1; }
  .state-filter-btn {
    @apply text-[9px] px-1.5 py-0.5 rounded border border-primary/20 bg-white/60 text-black/60 transition-all;
    @apply hover:bg-primary/20;
  }
  .state-filter-btn.selected { @apply bg-primary/40 border-primary text-black/90 font-semibold; }
  .clear-btn { @apply text-[10px] text-blue-700 underline; }
  .clear-btn::after { content: ""; }
  .param-grid { @apply grid grid-cols-2 gap-x-2 gap-y-1 items-center; }
  .param-label { @apply text-[9px] text-black/50; }
  .param-input { @apply w-full text-[11px] px-1.5 py-0.5 rounded border border-primary/30 bg-white/80 font-mono; }
  .param-slider {
    @apply w-full h-1.5 rounded-full appearance-none cursor-pointer;
    @apply bg-primary/30 accent-emerald-600;
  }
  .param-value { @apply font-mono text-[10px] text-black/70 ml-1; }
  .param-hint { @apply text-[8px] text-black/30 mt-1 italic; }
  .indices-toggle { @apply w-full flex items-center gap-2 text-left cursor-pointer bg-transparent border-none p-0; }
  .indices-summary { @apply flex gap-1 ml-auto; }
  .semantic-pill { @apply text-[8px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-medium; }
  .docs-pill { @apply text-[8px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-mono; }
  .toggle-arrow { @apply text-[10px] text-black/40 shrink-0; }
  .idx-group { @apply mt-2; }
  .idx-group-label { @apply text-[9px] font-semibold text-black/40 uppercase tracking-wider; }
  .idx-controls { @apply flex items-center gap-2; }
  .idx-control-btn {
    @apply text-[9px] px-1.5 py-0.5 rounded border border-primary/20 bg-white/60 text-black/60 transition-all;
    @apply hover:bg-primary/20;
  }
  .idx-control-btn::after { content: ""; }
  .idx-hint { @apply text-[8px] text-black/30 italic ml-1; }
  .idx-row {
    @apply w-full flex items-center gap-1.5 py-0.5 text-[10px] text-left bg-transparent border border-transparent rounded px-1 cursor-pointer transition-all;
    @apply hover:bg-primary/10;
  }
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
  .result-head { @apply flex items-center gap-2 flex-wrap; }
  .date-badge { @apply text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300; }
  .result-title { @apply text-sm font-semibold text-black/90; }
  .result-preview { @apply text-[11px] text-black/50 mt-1 line-clamp-2 leading-relaxed; }
  .meta-tags { @apply flex flex-wrap gap-1.5 mt-1; }
  .meta-tag { @apply text-[10px] bg-primary/20 text-black/70 px-1.5 py-0.5 rounded; }
  .chunks-tag { @apply bg-amber-100 text-amber-800 font-semibold; }
  .meta-link { @apply bg-blue-100 text-blue-800 no-underline; }
  .meta-link::after { content: " ↗"; }
  .matched-label { @apply text-[10px] font-bold text-black/40 uppercase tracking-wider mb-1; }
  .matched-chunk { @apply text-sm text-black/80 border-l-[3px] border-amber-400 bg-amber-50/50 pl-3 py-2 my-1 rounded-r whitespace-pre-wrap; }
  .result-excerpt { @apply text-sm text-black/80 border-l-[3px] border-primary/50 pl-3 py-1 my-2 whitespace-pre-wrap; }
  .load-doc-btn { @apply text-xs text-blue-700 underline mt-2 hover:text-blue-900; }
  .load-doc-btn::after { content: ""; }
  .doc-loading { @apply text-xs text-black/50 mt-2 italic; }
  .full-doc { @apply mt-3 border-t border-primary/20 pt-3 max-h-[50vh] overflow-y-auto space-y-2; }
  .doc-info { @apply text-xs text-black/40 mb-2; }
  .doc-chunk { @apply text-sm text-black/70 px-3 py-2 rounded whitespace-pre-wrap; }
  .doc-chunk-highlight { @apply bg-yellow-200/80 border-l-4 border-yellow-500 text-black/90 font-medium; }
  .chunk-header { @apply flex items-center justify-between mb-1; }
  .chunk-id { @apply text-[10px] text-black/30 font-mono; }
  .copy-btn { @apply text-[10px] px-1.5 py-0.5 rounded border border-primary/20 bg-white/60 text-black/50 hover:bg-primary/20 hover:text-black/80 transition-all; }
  .copy-btn::after { content: ""; }
  :global(input[type="text"]) { @apply selection:bg-primary selection:text-black; }
  a::after { content: "↗"; }
  a { @apply text-blue-800; }
  .accordion { @apply bg-primaryLight rounded-lg p-3 mb-3 transition; }
  .accordion:hover { @apply bg-primary/40; }
  .accordion[open] { @apply bg-primary/40; }
  .accordion summary { @apply cursor-pointer list-none; }
  .accordion summary::-webkit-details-marker { display: none; }
  .accordion-content { @apply mt-3 text-balance; }
</style>
