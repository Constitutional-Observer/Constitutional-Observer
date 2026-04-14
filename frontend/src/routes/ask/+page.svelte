<script>
  import { query } from "$lib/stores";
  import { Accordion, AccordionItem } from "@skeletonlabs/skeleton";
  import MainSearch from "$lib/components/MainSearch.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import IndiaMap from "$lib/components/IndiaMap.svelte";
  import TitleWithNav from "$lib/components/TitleWithNav.svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount, tick } from "svelte";

  export let data;
  let loading = true;
  let activeState = null;
  let fullDocs = {};
  let copiedId = null;

  function copyText(text, id) {
    navigator.clipboard.writeText(text);
    copiedId = id;
    setTimeout(() => { if (copiedId === id) copiedId = null; }, 1500);
  }
  let yearMin = "";
  let yearMax = "";
  let selectedStates = new Set();

  // Editable search params (synced from server defaults on load)
  let paramSemanticRatio = data.searchParams?.semanticRatio ?? 0.5;
  let paramLimit = data.searchParams?.limit ?? 50;
  let paramScoreThreshold = data.searchParams?.scoreThreshold ?? 0.58;

  const METADATA_KEYS = [
    "house", "session", "term_number", "term_start", "term_end",
    "section_type", "languages", "state_code",
  ];

  function extractState(hit) { return hit.state || "Unknown"; }

  function groupByState(hits) {
    const grouped = {};
    for (const hit of hits) {
      const s = extractState(hit);
      if (!grouped[s]) grouped[s] = [];
      grouped[s].push(hit);
    }
    return grouped;
  }

  $: resolvedDebates = Array.isArray(data.debates) ? data.debates : [];
  $: console.log("Result JSON:", resolvedDebates);

  // All unique states (before filtering)
  $: allStates = [...new Set(resolvedDebates.map(extractState))].sort();

  // Year range across all results
  $: allYears = resolvedDebates.map(h => h.year).filter(Boolean);
  $: globalMinYear = allYears.length ? Math.min(...allYears) : 0;
  $: globalMaxYear = allYears.length ? Math.max(...allYears) : 0;

  // Filtered hits
  $: filteredHits = resolvedDebates.filter(h => {
    if (selectedStates.size > 0 && !selectedStates.has(extractState(h))) return false;
    if (yearMin && h.year && h.year < Number(yearMin)) return false;
    if (yearMax && h.year && h.year > Number(yearMax)) return false;
    return true;
  });

  $: allHits = filteredHits;
  $: resultsByState = groupByState(allHits);
  $: stateNames = Object.keys(resultsByState).sort((a, b) => {
    if (a === "Unknown") return 1;
    if (b === "Unknown") return -1;
    return a.localeCompare(b);
  });
  $: hasQuery = !!$page.url.searchParams.get("query");
  $: loading = !hasQuery;

  // Ranked view: all results sorted by score
  $: rankedHits = [...filteredHits].sort((a, b) => (b._bestScore || b._rankingScore || 0) - (a._bestScore || a._rankingScore || 0));

  function toggleStateFilter(s) {
    if (selectedStates.has(s)) {
      selectedStates.delete(s);
    } else {
      selectedStates.add(s);
    }
    selectedStates = selectedStates; // trigger reactivity
  }

  function clearFilters() {
    yearMin = "";
    yearMax = "";
    selectedStates = new Set();
  }

  onMount(() => {
    const q = $page.url.searchParams.get("query");
    if (q) $query = q;
  });

  function handleSubmit() {
    activeState = null;
    fullDocs = {};
    const params = new URLSearchParams({
      query: $query,
      semanticRatio: paramSemanticRatio,
      limit: paramLimit,
      scoreThreshold: paramScoreThreshold,
    });
    goto(`/ask?${params.toString()}`, { invalidateAll: true });
  }

  function handleStateClick(e) {
    const state = e.detail.state;
    if (selectedStates.has(state)) {
      selectedStates.delete(state);
    } else {
      selectedStates.add(state);
    }
    selectedStates = selectedStates;
  }

  function getHitTitle(hit) { return hit.title_en || hit.subject || "Untitled"; }
  function getHitContent(hit) { return hit.__discussions || ""; }
  function getHitDate(hit) {
    if (hit.year) {
      const m = String(hit.month || 1).padStart(2, "0");
      const d = String(hit.day || 1).padStart(2, "0");
      return `${hit.year}-${m}-${d}`;
    }
    return null;
  }
  function getHitLink(hit) { return hit.archive_link || null; }

  function getMetaTags(hit) {
    const tags = [];
    for (const key of METADATA_KEYS) {
      if (hit[key] != null && hit[key] !== "") {
        let val = hit[key];
        if (Array.isArray(val)) val = val.join(", ");
        tags.push({ key, label: key.replace(/_/g, " "), value: String(val) });
      }
    }
    if (hit._rankingScore != null) {
      tags.push({ key: "_score", label: "score", value: hit._rankingScore.toFixed(3) });
    }
    return tags;
  }

  function getIndexFromHit(hit) {
    const code = (hit.state_code || "").toLowerCase();
    return code ? `state_legislature_debates_${code}` : null;
  }

  function getDocKey(hit) {
    return `${hit.state_code}:${hit.file_name}`;
  }

  async function loadFullDocument(hit) {
    const key = getDocKey(hit);
    if (fullDocs[key]) return;
    const index = getIndexFromHit(hit);
    if (!index || !hit.file_name) return;

    fullDocs[key] = { loading: true, chunks: [] };
    fullDocs = fullDocs;

    // Pass all matched chunk IDs for highlighting
    const highlightIds = (hit._matchedChunks || []).map(c => c.chunk_id).join(",");

    try {
      const resp = await fetch(
        `/api/document?index=${encodeURIComponent(index)}&file_name=${encodeURIComponent(hit.file_name)}&highlight_chunks=${highlightIds}`
      );
      const d = await resp.json();
      fullDocs[key] = { loading: false, chunks: d.chunks || [] };
    } catch {
      fullDocs[key] = { loading: false, chunks: [] };
    }
    fullDocs = fullDocs;

    await tick();
    // Scroll to first highlighted chunk
    const firstChunkId = hit._matchedChunks?.[0]?.chunk_id;
    if (firstChunkId != null) {
      const el = document.getElementById(`chunk-${key}-${firstChunkId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
</script>

<svelte:head>
  <title>Ask a question to the Constitutional Observer</title>
  <meta name="description" content="The Constitutional Observer provides a comparative interface to understand current and past parliamentary discourse in India." />
</svelte:head>

<div id="container">
<div id="container">
  {#if loading}
    <div class="md:p-20 h-auto">
      <MainSearch />
    </div>
  {:else}
    <div class="page-layout">
      <!-- Left: sticky map + search -->
      <aside class="sidebar">
        <TitleWithNav
          title={$query}
          subtitle="{allHits.length} results, {stateNames.length} states"
        >
          <form class="mt-2" on:submit|preventDefault={handleSubmit}>
            <div class="flex">
              <input type="text" class="p-1 mr-2 w-full text-xs text-gray-300" placeholder="Ask a question" bind:value={$query} autofocus />
              <button type="submit" class="btn bg-primary text-white px-2 py-0.5 text-xs rounded-md">Go</button>
            </div>
          </form>
        </TitleWithNav>
        <div class="map-box">
          <IndiaMap {resultsByState} activeState={selectedStates.size === 1 ? [...selectedStates][0] : null} on:stateclick={handleStateClick} />
        </div>

        <!-- Filters -->
        <div class="filters">
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

          <div class="filter-section">
            <label class="filter-label">States</label>
            <div class="state-filters">
              {#each allStates as s}
                <button
                  class="state-filter-btn"
                  class:selected={selectedStates.has(s)}
                  on:click={() => toggleStateFilter(s)}
                >
                  {s}
                </button>
              {/each}
            </div>
          </div>

          {#if yearMin || yearMax || selectedStates.size > 0}
            <button class="clear-btn" on:click={clearFilters}>Clear filters</button>
          {/if}

          <div class="filter-section">
            <label class="filter-label">Search params</label>
            <div class="param-grid">
              <label class="param-label">Semantic ratio <span class="param-value">{paramSemanticRatio}</span></label>
              <input type="range" step="0.01" min="0" max="1" bind:value={paramSemanticRatio} class="param-slider" />
              <label class="param-label">Limit</label>
              <input type="number" step="1" min="1" max="200" bind:value={paramLimit} class="param-input" />
              <label class="param-label">Score threshold</label>
              <input type="number" step="0.01" min="0" max="1" bind:value={paramScoreThreshold} class="param-input" />
            </div>
            <p class="param-hint">Changes apply on next search</p>
          </div>
        </div>
      </aside>

      <!-- Right: ranked results across all states -->
      <main class="results-panel">
        <Accordion>
          {#each rankedHits as hit, i (hit.id || i)}
            <AccordionItem open={i < 3}>
              <svelte:fragment slot="summary">
                <div class="result-summary">
                  <span class="score-badge" title="Ranking score">{(hit._bestScore || hit._rankingScore || 0).toFixed(3)}</span>
                  <div class="result-info">
                    <div class="result-head">
                      <span class="state-badge">{extractState(hit)}</span>
                      {#if getHitDate(hit)}
                        <span class="date-badge">{getHitDate(hit)}</span>
                      {/if}
                      <h4 class="result-title">{getHitTitle(hit)}</h4>
                    </div>
                    <div class="meta-tags">
                      {#if hit._matchedChunks?.length > 1}
                        <span class="meta-tag chunks-tag">{hit._matchedChunks.length} chunks</span>
                      {/if}
                      {#each getMetaTags(hit).filter(t => t.key !== '_score') as tag (tag.key)}
                        <span class="meta-tag">{tag.label}: {tag.value}</span>
                      {/each}
                      {#if getHitLink(hit)}
                        <a href={getHitLink(hit)} target="_blank" class="meta-tag meta-link" on:click|stopPropagation>archive</a>
                      {/if}
                    </div>
                  </div>
                </div>
              </svelte:fragment>
              <svelte:fragment slot="content">
                <!-- Matched chunks from search -->
                {#if hit._matchedChunks && hit._matchedChunks.length > 0}
                  <p class="matched-label">{hit._matchedChunks.length} matched section{hit._matchedChunks.length > 1 ? "s" : ""}</p>
                  {#each hit._matchedChunks as mc (mc.chunk_id)}
                    <div class="matched-chunk">
                      <div class="chunk-header">
                        <span class="chunk-id">#{mc.chunk_id} &middot; {mc.score?.toFixed(3) || ""}</span>
                        <button class="copy-btn" on:click={() => copyText(mc.text, `mc-${hit.id}-${mc.chunk_id}`)}>
                          {copiedId === `mc-${hit.id}-${mc.chunk_id}` ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <p>{mc.text}</p>
                    </div>
                  {/each}
                {:else}
                  <blockquote class="result-excerpt">
                    {getHitContent(hit)}
                    <button class="copy-btn" on:click={() => copyText(getHitContent(hit), `ex-${hit.id}`)}>
                      {copiedId === `ex-${hit.id}` ? "Copied" : "Copy"}
                    </button>
                  </blockquote>
                {/if}

                <!-- Full document loader -->
                {@const docKey = getDocKey(hit)}
                {#if !fullDocs[docKey]}
                  <button class="load-doc-btn" on:click={() => loadFullDocument(hit)}>Load full document</button>
                {:else if fullDocs[docKey].loading}
                  <p class="doc-loading">Loading...</p>
                {:else if fullDocs[docKey].chunks.length > 0}
                  <div class="full-doc">
                    <p class="doc-info">{fullDocs[docKey].chunks.length} chunks in document</p>
                    {#each fullDocs[docKey].chunks as chunk (chunk.chunk_id)}
                      <div id="chunk-{docKey}-{chunk.chunk_id}" class="doc-chunk" class:doc-chunk-highlight={chunk.isHighlighted}>
                        <span class="chunk-id">#{chunk.chunk_id}</span>
                        <p>{chunk.text}</p>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <p class="doc-loading">Could not load document.</p>
                {/if}
              </svelte:fragment>
            </AccordionItem>
          {/each}
        </Accordion>
      </main>
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
    max-width: 1000px;
  }

  @media (max-width: 768px) {
    .page-layout {
      @apply flex-col;
    }
  }

  /* Sidebar: map + search */
  .sidebar {
    @apply shrink-0 md:sticky md:top-4 md:self-start;
    width: 280px;
  }

  @media (max-width: 768px) {
    .sidebar {
      width: 100%;
    }
  }

  .map-box {
    @apply mt-3 bg-white/60 backdrop-blur-sm rounded-lg p-3 border border-primary/30;
  }

  /* Results panel */
  .results-panel {
    @apply flex-1 min-w-0;
  }

  .result-summary {
    @apply flex items-start gap-3 w-full;
  }

  .score-badge {
    @apply shrink-0 text-sm font-mono font-bold px-2 py-1 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300;
  }

  .result-info {
    @apply flex-1 min-w-0;
  }

  .state-badge {
    @apply text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200;
  }

  /* Filters */
  .filters {
    @apply mt-3 space-y-3;
  }

  .filter-section {
    @apply space-y-1;
  }

  .filter-label {
    @apply text-[10px] font-bold text-black/50 uppercase tracking-wider;
  }

  .filter-range {
    @apply text-[10px] text-black/40 font-mono ml-2;
  }

  .year-inputs {
    @apply flex items-center gap-1;
  }

  .year-input {
    @apply w-16 text-[11px] px-1.5 py-1 rounded border border-primary/30 bg-white/80 font-mono;
  }

  .year-dash {
    @apply text-black/30 text-xs;
  }

  .state-filters {
    @apply flex flex-wrap gap-1;
  }

  .state-filter-btn {
    @apply text-[9px] px-1.5 py-0.5 rounded border border-primary/20 bg-white/60 text-black/60 transition-all;
    @apply hover:bg-primary/20;
  }

  .state-filter-btn.selected {
    @apply bg-primary/40 border-primary text-black/90 font-semibold;
  }

  .clear-btn {
    @apply text-[10px] text-blue-700 underline;
  }

  .clear-btn::after {
    content: "";
  }

  .param-grid {
    @apply grid grid-cols-2 gap-x-2 gap-y-1 items-center;
  }

  .param-label {
    @apply text-[9px] text-black/50;
  }

  .param-input {
    @apply w-full text-[11px] px-1.5 py-0.5 rounded border border-primary/30 bg-white/80 font-mono;
  }

  .param-slider {
    @apply w-full h-1.5 rounded-full appearance-none cursor-pointer;
    @apply bg-primary/30 accent-emerald-600;
  }

  .param-value {
    @apply font-mono text-[10px] text-black/70 ml-1;
  }

  .param-hint {
    @apply text-[8px] text-black/30 mt-1 italic;
  }

  /* Result styles */
  .result-head {
    @apply flex items-center gap-2 flex-wrap;
  }

  .date-badge {
    @apply text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300;
  }

  .result-title {
    @apply text-sm font-semibold text-black/90;
  }

  .meta-tags {
    @apply flex flex-wrap gap-1.5 mt-1;
  }

  .meta-tag {
    @apply text-[10px] bg-primary/20 text-black/70 px-1.5 py-0.5 rounded;
  }

  .chunks-tag {
    @apply bg-amber-100 text-amber-800 font-semibold;
  }

  .meta-link {
    @apply bg-blue-100 text-blue-800 no-underline;
  }

  .meta-link::after {
    content: " ↗";
  }

  .matched-label {
    @apply text-[10px] font-bold text-black/40 uppercase tracking-wider mb-1;
  }

  .matched-chunk {
    @apply text-sm text-black/80 border-l-[3px] border-amber-400 bg-amber-50/50 pl-3 py-2 my-1 rounded-r whitespace-pre-wrap;
  }

  .result-excerpt {
    @apply text-sm text-black/80 border-l-[3px] border-primary/50 pl-3 py-1 my-2 whitespace-pre-wrap;
  }

  .load-doc-btn {
    @apply text-xs text-blue-700 underline mt-2 hover:text-blue-900;
  }

  .load-doc-btn::after {
    content: "";
  }

  .doc-loading {
    @apply text-xs text-black/50 mt-2 italic;
  }

  .full-doc {
    @apply mt-3 border-t border-primary/20 pt-3 max-h-[50vh] overflow-y-auto space-y-2;
  }

  .doc-info {
    @apply text-xs text-black/40 mb-2;
  }

  .doc-chunk {
    @apply text-sm text-black/70 px-3 py-2 rounded whitespace-pre-wrap;
  }

  .doc-chunk-highlight {
    @apply bg-yellow-200/80 border-l-4 border-yellow-500 text-black/90 font-medium;
  }

  .chunk-header {
    @apply flex items-center justify-between mb-1;
  }

  .chunk-id {
    @apply text-[10px] text-black/30 font-mono;
  }

  .copy-btn {
    @apply text-[10px] px-1.5 py-0.5 rounded border border-primary/20 bg-white/60 text-black/50 hover:bg-primary/20 hover:text-black/80 transition-all;
  }

  .copy-btn::after {
    content: "";
  }

  :global(input[type="text"]) {
    @apply selection:bg-primary selection:text-black;
  }

  a::after {
    content: "↗";
  }
  a {
    @apply text-blue-800;
  }

  /* Accordion overrides */
  :global(.accordion-lead) {
    @apply font-bold text-xl pb-2 w-full;
  }
  :global(.accordion-summary) {
    @apply text-sm p-0;
  }
  :global(.accordion-control) {
    @apply flex-wrap;
  }
  :global(.accordion-panel) {
    @apply text-balance;
  }
  :global(.accordion-item, .accordion-item > button) {
    @apply rounded-lg;
  }
  :global(.accordion-control[aria-expanded="true"]) {
    @apply bg-primary/100;
  }
  :global(.accordion-control[aria-expanded="true"]:hover) {
    @apply bg-primary/40;
  }
  :global(.accordion-item) {
    @apply bg-primaryLight select-all;
  }
  :global(.accordion-item:hover) {
    @apply bg-primary/40;
  }
  :global(.accordion-panel[aria-hidden="false"]) {
    @apply bg-primary/40;
  }

  .loader {
    width: 180px;
    aspect-ratio: 8/5;
    --_g: no-repeat radial-gradient(#000 68%, #0000 71%);
    -webkit-mask: var(--_g), var(--_g), var(--_g);
    -webkit-mask-size: 50% 40%;
    @apply bg-primaryLight;
    animation: load 2s infinite;
  }

  @keyframes load {
    0% { -webkit-mask-position: 0% 0%, 50% 0%, 100% 0%; }
    16.67% { -webkit-mask-position: 0% 100%, 50% 0%, 100% 0%; }
    33.33% { -webkit-mask-position: 0% 100%, 50% 100%, 100% 0%; }
    50% { -webkit-mask-position: 0% 100%, 50% 100%, 100% 100%; }
    66.67% { -webkit-mask-position: 0% 0%, 50% 100%, 100% 100%; }
    83.33% { -webkit-mask-position: 0% 0%, 50% 0%, 100% 100%; }
    100% { -webkit-mask-position: 0% 0%, 50% 0%, 100% 0%; }
  }
</style>
