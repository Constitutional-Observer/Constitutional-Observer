<script>
  import ResultsList from "$lib/components/search/ResultsList.svelte";
  import SearchSidebar from "$lib/components/search/SearchSidebar.svelte";
  import DetailPanel from "$lib/components/search/DetailPanel.svelte";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import { tick, untrack, onMount } from "svelte";

  // ---------------------------------------------------------------------------
  // DocPanel — result selection, copy feedback, full-document cache
  // ---------------------------------------------------------------------------
  class DocPanel {
    static #METADATA_KEYS = [
      "house",
      "session",
      "term_number",
      "term_start",
      "term_end",
      "section_type",
      "languages",
      "state_code",
    ];

    selectedHitIndex = $state(null);
    copiedId = $state(null);
    fullDocs = $state({});

    effectiveIndex(pageHits) {
      return this.selectedHitIndex != null &&
        this.selectedHitIndex < pageHits.length
        ? this.selectedHitIndex
        : pageHits.length > 0
          ? 0
          : null;
    }

    selectedHit(pageHits) {
      const i = this.effectiveIndex(pageHits);
      return i != null ? pageHits[i] : null;
    }

    toggleSelect(i) {
      this.selectedHitIndex = this.selectedHitIndex === i ? null : i;
    }
    reset() {
      this.selectedHitIndex = null;
      this.fullDocs = {};
    }
    docKey(hit) {
      return `${hit._index || hit.state_code}:${hit.file_name}`;
    }

    hitDate(hit) {
      if (!hit.year) return null;
      const m = String(hit.month || 1).padStart(2, "0");
      const d = String(hit.day || 1).padStart(2, "0");
      return `${hit.year}-${m}-${d}`;
    }

    hitPreview(hit) {
      const text = hit._matchedChunks?.[0]?.text || hit.__discussions || "";
      return text.length > 150 ? text.slice(0, 150) + "..." : text;
    }

    metaTags(hit) {
      const tags = [];
      for (const key of DocPanel.#METADATA_KEYS) {
        if (hit[key] != null && hit[key] !== "") {
          const val = Array.isArray(hit[key])
            ? hit[key].join(", ")
            : String(hit[key]);
          tags.push({ key, label: key.replace(/_/g, " "), value: val });
        }
      }
      return tags;
    }

    copyText(text, id) {
      navigator.clipboard.writeText(text);
      this.copiedId = id;
      setTimeout(() => {
        if (this.copiedId === id) this.copiedId = null;
      }, 1500);
    }

    async loadFullDocument(hit) {
      const key = this.docKey(hit);
      if (this.fullDocs[key]) return;
      if (!hit._index || !hit.file_name) return;

      this.fullDocs[key] = { loading: true, chunks: [] };
      const highlightIds = (hit._matchedChunks || [])
        .map((c) => c.chunk_id)
        .join(",");

      try {
        const resp = await fetch(
          `/api/document?index=${encodeURIComponent(hit._index)}&file_name=${encodeURIComponent(hit.file_name)}&highlight_chunks=${highlightIds}`,
        );
        const d = await resp.json();
        this.fullDocs[key] = { loading: false, chunks: d.chunks || [] };
      } catch {
        this.fullDocs[key] = { loading: false, chunks: [] };
      }

      await tick();
      const firstChunkId = hit._matchedChunks?.[0]?.chunk_id;
      if (firstChunkId != null) {
        document
          .getElementById(`chunk-${key}-${firstChunkId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // LazyLoader — background fetch loop, doc merging, loading state
  // ---------------------------------------------------------------------------
  class LazyLoader {
    static #MAX_HITS = 1500;
    static #BATCH_SIZE = 200;

    docs = $state([]);
    hitCount = $state(0);
    estimated = $state(0);
    loading = $state(false);
    progress = $state("");

    #activeQuery = "";

    seed(serverData) {
      this.docs = Array.isArray(serverData.debates) ? serverData.debates : [];
      this.hitCount = serverData.hitCount || 0;
      this.estimated = serverData.totalEstimated || 0;
      this.loading = false;
      this.progress = "";
    }

    async fetchRemaining(query, extraParams = {}) {
      this.#activeQuery = query;
      this.loading = true;

      let offset = LazyLoader.#BATCH_SIZE;
      let accumulated = this.hitCount;
      let estimated = this.estimated;

      while (accumulated < LazyLoader.#MAX_HITS && accumulated < estimated) {
        if (this.#activeQuery !== query) break;

        this.progress = `Loading more results... ${accumulated} of ~${estimated}`;
        try {
          const params = new URLSearchParams({
            query,
            limit: String(LazyLoader.#BATCH_SIZE),
            offset: String(offset),
            ...extraParams,
          });
          const resp = await fetch(`/api/search?${params}`);
          if (!resp.ok) break;
          const batch = await resp.json();
          if (!batch.docs?.length) break;
          if (this.#activeQuery !== query) break;

          const docMap = new Map(
            this.docs.map((d) => [`${d._index}:${d.file_name}`, d]),
          );
          for (const doc of batch.docs) {
            const key = `${doc._index}:${doc.file_name}`;
            if (docMap.has(key)) {
              const existing = docMap.get(key);
              const existingChunkIds = new Set(
                existing._matchedChunks.map((c) => c.chunk_id),
              );
              for (const mc of doc._matchedChunks) {
                if (!existingChunkIds.has(mc.chunk_id))
                  existing._matchedChunks.push(mc);
              }
              existing._matchedChunks.sort(
                (a, b) => (a.chunk_id || 0) - (b.chunk_id || 0),
              );
              if (doc._bestScore > existing._bestScore) {
                existing._bestScore = doc._bestScore;
                existing._rankingScore = doc._rankingScore;
              }
            } else {
              docMap.set(key, doc);
            }
          }
          this.docs = [...docMap.values()].sort(
            (a, b) => (b._bestScore || 0) - (a._bestScore || 0),
          );
          accumulated += batch.hitCount;
          this.hitCount = accumulated;
          estimated = batch.totalEstimated || estimated;
          this.estimated = estimated;
          offset += LazyLoader.#BATCH_SIZE;
        } catch (err) {
          console.error("Lazy load failed:", err);
          break;
        }
      }

      if (this.#activeQuery === query) {
        this.loading = false;
        this.progress = "";
      }
    }
  }

  // ---------------------------------------------------------------------------
  // SearchParams — adjustable search configuration + URL-params builder
  // ---------------------------------------------------------------------------
  class SearchParams {
    hybrid = $state(false);
    semanticRatio = $state(0.5);
    limit = $state(200);
    scoreThreshold = $state(0.1);
    indexIds = $state(new Set());

    build(query) {
      const params = new URLSearchParams({
        query,
        hybrid: this.hybrid,
        semanticRatio: this.semanticRatio,
        limit: this.limit,
        scoreThreshold: this.scoreThreshold,
      });
      if (this.indexIds.size > 0)
        params.set("indices", [...this.indexIds].join(","));
      return params;
    }
  }

  // ---------------------------------------------------------------------------
  // ResultFilter — filter state + all views derived from it
  // Getters are reactive: Svelte tracks $state reads on both this and #loader.
  // ---------------------------------------------------------------------------
  class ResultFilter {
    activeCollection = $state(null);
    selectedStates = $state(new Set());
    yearMin = $state("");
    yearMax = $state("");

    #loader;
    constructor(loader) {
      this.#loader = loader;
    }

    static #groupByState(hits) {
      const grouped = {};
      for (const hit of hits)
        (grouped[hit.state || "Unknown"] ||= []).push(hit);
      return grouped;
    }

    get isStateCollection() {
      return (
        !this.activeCollection || this.activeCollection === "State Legislatures"
      );
    }

    // Collection-only slice — used by map, timeline, and as base for filteredHits
    get collectionDebates() {
      const docs = this.#loader.docs;
      return this.activeCollection
        ? docs.filter((h) => h._collection === this.activeCollection)
        : docs;
    }

    // Full filter pipeline — reuses collectionDebates so collection filter runs once
    get filteredHits() {
      let hits = this.collectionDebates;
      if (this.selectedStates.size)
        hits = hits.filter((h) =>
          this.selectedStates.has(h.state || "Unknown"),
        );
      if (this.yearMin)
        hits = hits.filter((h) => !h.year || h.year >= Number(this.yearMin));
      if (this.yearMax)
        hits = hits.filter((h) => !h.year || h.year <= Number(this.yearMax));
      return hits;
    }

    get allStates() {
      return [
        ...new Set(this.collectionDebates.map((h) => h.state || "Unknown")),
      ].sort();
    }

    get resultsByState() {
      return ResultFilter.#groupByState(this.collectionDebates);
    }

    // Optimised: single-pass Set instead of building a full grouped map
    get stateNames() {
      const seen = new Set();
      for (const h of this.filteredHits) seen.add(h.state || "Unknown");
      return [...seen].sort((a, b) => {
        if (a === "Unknown") return 1;
        if (b === "Unknown") return -1;
        return a.localeCompare(b);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // ResultPager — pagination state + sorted/paged views of filtered results
  // ---------------------------------------------------------------------------
  class ResultPager {
    static #PER_PAGE = 20;

    currentPage = $state(0);

    #filter;
    constructor(filter) {
      this.#filter = filter;
    }

    get rankedHits() {
      return [...this.#filter.filteredHits].sort(
        (a, b) => (b._bestScore || 0) - (a._bestScore || 0),
      );
    }

    get totalPages() {
      return Math.ceil(this.rankedHits.length / ResultPager.#PER_PAGE);
    }

    get pageHits() {
      const start = this.currentPage * ResultPager.#PER_PAGE;
      return this.rankedHits.slice(start, start + ResultPager.#PER_PAGE);
    }

    // Windowed page numbers with -1 as ellipsis sentinel
    pageWindow(maxVisible = 7) {
      const total = this.totalPages;
      const current = this.currentPage;
      if (total <= maxVisible)
        return Array.from({ length: total }, (_, i) => i);
      const pages = [0];
      const start = Math.max(1, current - 2);
      const end = Math.min(total - 2, current + 2);
      if (start > 1) pages.push(-1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < total - 2) pages.push(-1);
      pages.push(total - 1);
      return pages;
    }

    goTo(page) {
      this.currentPage = Math.max(0, Math.min(page, this.totalPages - 1));
    }
    reset() {
      this.currentPage = 0;
    }

    // Navigate to the page that contains rank `r` and return its within-page index.
    selectByRank(r) {
      this.goTo(Math.floor(r / ResultPager.#PER_PAGE));
      return r % ResultPager.#PER_PAGE;
    }
  }

  // ---------------------------------------------------------------------------

  const panel = new DocPanel();
  const loader = new LazyLoader();
  const search = new SearchParams();
  const filter = new ResultFilter(loader);
  const pager = new ResultPager(filter);

  let { data } = $props();

  // UI state — search bar + loading flag
  let searchInput = $state("");
  let searching = $state(false);
  $effect(() => {
    searchInput = data.searchParams?.query || "";
  });

  // Seed loader + reset everything when server returns new data
  $effect(() => {
    loader.seed(data);
    pager.reset();
    panel.reset();
    searching = false;

    const query = data.searchParams?.query;
    if (query && (data.totalEstimated || 0) > (data.hitCount || 0)) {
      untrack(() =>
        loader.fetchRemaining(query, {
          hybrid: String(data.searchParams?.hybrid || false),
          semanticRatio: String(data.searchParams?.semanticRatio || 0.5),
          scoreThreshold: String(data.searchParams?.scoreThreshold || 0.1),
          ...(data.searchParams?.indices
            ? { indices: data.searchParams.indices }
            : {}),
        }),
      );
    }
  });

  // Reset page + selection when any filter changes
  $effect(() => {
    filter.activeCollection;
    filter.selectedStates;
    filter.yearMin;
    filter.yearMax;
    pager.reset();
    panel.selectedHitIndex = null;
  });

  // --- Derived (only what can't live in a class) ---

  let hasQuery = $derived(!!data.searchParams?.query);
  let indices = $derived(data.indices || []);

  let subtitle = $derived(
    `${pager.rankedHits.length} documents, ${loader.hitCount} results of ~${loader.estimated} total` +
      (filter.isStateCollection ? `, ${filter.stateNames.length} states` : "") +
      (filter.activeCollection ? ` in ${filter.activeCollection}` : ""),
  );
  let loadPct = $derived(
    Math.min(100, (loader.hitCount / Math.min(loader.estimated, 1500)) * 100),
  );

  // effectiveIndex is still needed in the template for the active-card highlight
  let effectiveIndex = $derived(panel.effectiveIndex(pager.pageHits));
  let selectedHit = $derived(panel.selectedHit(pager.pageHits));

  // --- Actions ---

  function handleSubmit() {
    panel.reset();
    pager.reset();
    searching = true;
    goto(`/ask?${search.build(searchInput).toString()}`, {
      invalidateAll: true,
    });
  }
</script>

<svelte:head>
  <title>Ask a question to the Constitutional Observer</title>
  <meta
    name="description"
    content="The Constitutional Observer provides a comparative interface to understand current and past parliamentary discourse in India."
  />
</svelte:head>

<div id="container">
  <div class="page-layout">
    <SearchSidebar
      bind:searchInput
      {searching}
      {subtitle}
      loadingMore={loader.loading}
      loadProgress={loader.progress}
      {loadPct}
      {indices}
      collectionDebates={filter.collectionDebates}
      resultsByStateForMap={filter.resultsByState}
      isStateCollection={filter.isStateCollection}
      allStates={filter.allStates}
      bind:selectedStates={filter.selectedStates}
      bind:yearMin={filter.yearMin}
      bind:yearMax={filter.yearMax}
      bind:selectedIndexIds={search.indexIds}
      bind:paramHybrid={search.hybrid}
      bind:paramSemanticRatio={search.semanticRatio}
      bind:paramScoreThreshold={search.scoreThreshold}
      onsearch={handleSubmit}
    />

    <!-- Results list -->
    <main class="results-list">
      <TopicMap
        hits={pager.rankedHits}
        query={data.searchParams?.query || ""}
        onselect={(rank) => {
          panel.selectedHitIndex = pager.selectByRank(rank);
        }}
      />

      <!-- Pagination top -->
      {#if pager.totalPages > 1}
        <nav class="pagination">
          <button
            class="page-btn"
            disabled={pager.currentPage === 0}
            onclick={() => pager.goTo(pager.currentPage - 1)}>Prev</button
          >
          {#each pager.pageWindow() as p}
            {#if p === -1}
              <span class="page-ellipsis">...</span>
            {:else}
              <button
                class="page-btn"
                class:page-btn-active={p === pager.currentPage}
                onclick={() => pager.goTo(p)}>{p + 1}</button
              >
            {/if}
          {/each}
          <button
            class="page-btn"
            disabled={pager.currentPage >= pager.totalPages - 1}
            onclick={() => pager.goTo(pager.currentPage + 1)}>Next</button
          >
          <span class="page-info"
            >Page {pager.currentPage + 1} of {pager.totalPages}</span
          >
        </nav>
      {/if}

      {#each pager.pageHits as hit, i (hit.id || `${pager.currentPage}-${i}`)}
        <!-- Mobile -->
        <details class="accordion mobile-only" open={i < 3}>
          <summary>
            <div class="result-summary">
              <span class="score-badge">{(hit._bestScore || 0).toFixed(3)}</span
              >
              <div class="result-info">
                <div class="result-head">
                  <span class="state-badge">{hit.state || "Unknown"}</span>
                  {#if panel.hitDate(hit)}<span class="date-badge"
                      >{panel.hitDate(hit)}</span
                    >{/if}
                  <h4 class="result-title">
                    {hit.title_en || hit.subject || "Untitled"}
                  </h4>
                </div>
                <p class="result-preview">{panel.hitPreview(hit)}</p>
              </div>
            </div>
          </summary>
          <div class="accordion-content">
            {#if hit._matchedChunks?.length}
              <p class="matched-label">
                {hit._matchedChunks.length} matched section{hit._matchedChunks
                  .length > 1
                  ? "s"
                  : ""}
              </p>
              {#each hit._matchedChunks as mc (mc.chunk_id)}
                <div class="matched-chunk">
                  <div class="chunk-header">
                    <span class="chunk-id"
                      >#{mc.chunk_id} &middot; {mc.score?.toFixed(3) ||
                        ""}</span
                    >
                    <button
                      class="copy-btn"
                      onclick={() =>
                        panel.copyText(mc.text, `mc-${hit.id}-${mc.chunk_id}`)}
                    >
                      {panel.copiedId === `mc-${hit.id}-${mc.chunk_id}`
                        ? "Copied"
                        : "Copy"}
                    </button>
                  </div>
                  <p>{mc.text}</p>
                </div>
              {/each}
            {:else}
              <blockquote class="result-excerpt">
                {hit.__discussions || ""}
              </blockquote>
            {/if}
            {#if !panel.fullDocs[panel.docKey(hit)]}
              <button
                class="load-doc-btn"
                onclick={() => panel.loadFullDocument(hit)}
                >Load full document</button
              >
            {:else if panel.fullDocs[panel.docKey(hit)].loading}
              <p class="doc-loading">Loading...</p>
            {:else if panel.fullDocs[panel.docKey(hit)].chunks.length > 0}
              <div class="full-doc">
                <p class="doc-info">
                  {panel.fullDocs[panel.docKey(hit)].chunks.length} chunks in document
                </p>
                {#each panel.fullDocs[panel.docKey(hit)].chunks as chunk (chunk.chunk_id)}
                  <div
                    id="chunk-{panel.docKey(hit)}-{chunk.chunk_id}"
                    class="doc-chunk"
                    class:doc-chunk-highlight={chunk.isHighlighted}
                  >
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
          onclick={() => panel.toggleSelect(i)}
        >
          <div class="result-summary">
            <span class="score-badge">{(hit._bestScore || 0).toFixed(3)}</span>
            <div class="result-info">
              <div class="result-head">
                <span class="state-badge">{hit.state || "Unknown"}</span>
                {#if panel.hitDate(hit)}<span class="date-badge"
                    >{panel.hitDate(hit)}</span
                  >{/if}
                <h4 class="result-title">
                  {hit.title_en || hit.subject || "Untitled"}
                </h4>
              </div>
              <p class="result-preview">{panel.hitPreview(hit)}</p>
              <div class="meta-tags">
                {#if hit._matchedChunks?.length > 1}
                  <span class="meta-tag chunks-tag"
                    >{hit._matchedChunks.length} chunks</span
                  >
                {/if}
                {#each panel.metaTags(hit) as tag (tag.key)}
                  <span class="meta-tag">{tag.label}: {tag.value}</span>
                {/each}
                {#if hit.archive_link}
                  <a
                    href={hit.archive_link}
                    target="_blank"
                    class="meta-tag meta-link"
                    onclick={(e) => e.stopPropagation()}>archive</a
                  >
                {/if}
              </div>
            </div>
          </div>
        </button>
      {/each}

      <!-- Pagination bottom -->
      {#if pager.totalPages > 1}
        <nav class="pagination">
          <button
            class="page-btn"
            disabled={pager.currentPage === 0}
            onclick={() => pager.goTo(pager.currentPage - 1)}>Prev</button
          >
          {#each pager.pageWindow() as p}
            {#if p === -1}
              <span class="page-ellipsis">...</span>
            {:else}
              <button
                class="page-btn"
                class:page-btn-active={p === pager.currentPage}
                onclick={() => pager.goTo(p)}>{p + 1}</button
              >
            {/if}
          {/each}
          <button
            class="page-btn"
            disabled={pager.currentPage >= pager.totalPages - 1}
            onclick={() => pager.goTo(pager.currentPage + 1)}>Next</button
          >
        </nav>
      {/if}
    </main>

    <!-- Detail panel -->
    {#if selectedHit}
      <section class="detail-panel desktop-only">
        <div class="detail-header">
          <h3 class="detail-title">
            {selectedHit.title_en || selectedHit.subject || "Untitled"}
          </h3>
          <div class="result-head">
            <span class="state-badge">{selectedHit.state || "Unknown"}</span>
            {#if panel.hitDate(selectedHit)}<span class="date-badge"
                >{panel.hitDate(selectedHit)}</span
              >{/if}
          </div>
          <div class="meta-tags">
            {#each panel.metaTags(selectedHit) as tag (tag.key)}
              <span class="meta-tag">{tag.label}: {tag.value}</span>
            {/each}
            {#if selectedHit.archive_link}
              <a
                href={selectedHit.archive_link}
                target="_blank"
                class="meta-tag meta-link">archive</a
              >
            {/if}
          </div>
        </div>

        {#if selectedHit._matchedChunks?.length}
          <p class="matched-label">
            {selectedHit._matchedChunks.length} matched section{selectedHit
              ._matchedChunks.length > 1
              ? "s"
              : ""}
          </p>
          {#each selectedHit._matchedChunks as mc (mc.chunk_id)}
            <div class="matched-chunk">
              <div class="chunk-header">
                <span class="chunk-id"
                  >#{mc.chunk_id} &middot; {mc.score?.toFixed(3) || ""}</span
                >
                <button
                  class="copy-btn"
                  onclick={() =>
                    panel.copyText(
                      mc.text,
                      `mc-${selectedHit.id}-${mc.chunk_id}`,
                    )}
                >
                  {panel.copiedId === `mc-${selectedHit.id}-${mc.chunk_id}`
                    ? "Copied"
                    : "Copy"}
                </button>
              </div>
              <p>{mc.text}</p>
            </div>
          {/each}
        {:else}
          <blockquote class="result-excerpt">
            {selectedHit.__discussions || ""}
            <button
              class="copy-btn"
              onclick={() =>
                panel.copyText(
                  selectedHit.__discussions || "",
                  `ex-${selectedHit.id}`,
                )}
            >
              {panel.copiedId === `ex-${selectedHit.id}` ? "Copied" : "Copy"}
            </button>
          </blockquote>
        {/if}

        {#if !panel.fullDocs[panel.docKey(selectedHit)]}
          <button
            class="load-doc-btn"
            onclick={() => panel.loadFullDocument(selectedHit)}
            >Load full document</button
          >
        {:else if panel.fullDocs[panel.docKey(selectedHit)].loading}
          <p class="doc-loading">Loading...</p>
        {:else if panel.fullDocs[panel.docKey(selectedHit)].chunks.length > 0}
          <div class="full-doc">
            <p class="doc-info">
              {panel.fullDocs[panel.docKey(selectedHit)].chunks.length} chunks in
              document
            </p>
            {#each panel.fullDocs[panel.docKey(selectedHit)].chunks as chunk (chunk.chunk_id)}
              <div
                id="chunk-{panel.docKey(selectedHit)}-{chunk.chunk_id}"
                class="doc-chunk"
                class:doc-chunk-highlight={chunk.isHighlighted}
              >
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
</div>

<style lang="postcss">
  #container {
    background-image: url("/Constitution_of_India_inside_4.webp");
    background-repeat: no-repeat;
    background-position: center;
    background-size: cover;
    height: 100dvh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .page-layout {
    @apply flex gap-4 px-4 mx-auto;
    flex: 1;
    min-height: 0;       /* allows flex children to shrink and scroll */
    overflow: hidden;
    max-width: 1600px;
    padding-top: 1.5rem;
    padding-bottom: 1.5rem;
    align-items: stretch;
  }

  @media (max-width: 768px) {
    /* On small screens let the page scroll naturally as a column */
    #container { height: auto; overflow: visible; }
    .page-layout { @apply flex-col; flex: none; overflow: visible; padding-bottom: 2rem; }
  }

  .mobile-only {
    display: none;
  }
  .desktop-only {
    display: block;
  }
  button.desktop-only {
    display: block;
  }

  @media (max-width: 768px) {
    .mobile-only {
      display: block;
    }
    .desktop-only {
      display: none !important;
    }
  }

  .results-list {
    @apply flex-1 min-w-0 overflow-y-auto;
    min-height: 0;
  }

  /* Pagination */
  .pagination {
    @apply flex items-center gap-1 py-2 flex-wrap;
  }
  .page-btn {
    @apply text-[11px] px-2 py-1 rounded border border-primary/20 bg-white/60 text-black/60 transition-all cursor-pointer;
    @apply hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed;
  }
  .page-btn::after {
    content: "";
  }
  .page-btn-active {
    @apply bg-primary/40 border-primary text-black/90 font-bold;
  }
  .page-ellipsis {
    @apply text-[11px] text-black/30 px-1;
  }
  .page-info {
    @apply text-[10px] text-black/40 ml-2;
  }

  .result-card {
    @apply w-full text-left bg-primaryLight rounded-lg p-3 mb-2 transition cursor-pointer border-2 border-transparent;
  }
  .result-card:hover {
    @apply bg-primary/30;
  }
  .result-card-active {
    @apply bg-primary/40 border-primary/60;
  }

  .detail-panel {
    @apply overflow-y-auto rounded-lg bg-primaryLight/80 backdrop-blur-sm p-4 border border-primary/30;
    width: 420px;
    min-height: 0;
    flex-shrink: 0;
  }
  .detail-header {
    @apply space-y-2 mb-4 pb-3 border-b border-primary/20;
  }
  .detail-title {
    @apply text-base font-bold text-black/90;
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
  .result-head {
    @apply flex items-center gap-2 flex-wrap;
  }
  .date-badge {
    @apply text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300;
  }
  .result-title {
    @apply text-sm font-semibold text-black/90;
  }
  .result-preview {
    @apply text-[11px] text-black/50 mt-1 line-clamp-2 leading-relaxed;
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
  .accordion {
    @apply bg-primaryLight rounded-lg p-3 mb-3 transition;
  }
  .accordion:hover {
    @apply bg-primary/40;
  }
  .accordion[open] {
    @apply bg-primary/40;
  }
  .accordion summary {
    @apply cursor-pointer list-none;
  }
  .accordion summary::-webkit-details-marker {
    display: none;
  }
  .accordion-content {
    @apply mt-3 text-balance;
  }
</style>
