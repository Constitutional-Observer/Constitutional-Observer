<script>
  import ResultsList from "#lib/components/search/ResultsList.svelte";
  import SearchSidebar from "#lib/components/search/SearchSidebar.svelte";
  import TermSuggestions from "#lib/components/search/TermSuggestions.svelte";
  import DetailPanel from "#lib/components/search/DetailPanel.svelte";
  
  import { searchBox, searchParams, ui, docFormat, topicHighlight } from "#lib/components/search/search-state.svelte.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { browser } from "$app/env";
  import { tick, untrack, onMount } from "svelte";

  // Per-document key and date come from docFormat, so the result cards, the map
  // views and a saved bookmark can never disagree about which document is which.
  const docKeyOf = docFormat.docKey;

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
    linkedHit = $state(null);
    focusChunk = $state(null);
    copiedId = $state(null);
    fullDocs = $state({});
    // A bookmark opened by id — { loading, meta:{...}, chunks } — takes over the
    // detail accordion so a saved entry can be viewed even when it isn't in the
    // current result set.
    openedBookmark = $state(null);

    #pager;
    constructor(pager) {
      this.#pager = pager;
    }

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
      this.#clearOpen();
      this.selectedHitIndex = this.selectedHitIndex === i ? null : i;
    }
    select(i) {
      this.#clearOpen();
      this.selectedHitIndex = i;
    }
    close() {
      this.#clearOpen();
      this.selectedHitIndex = null;
    }
    #clearOpen() {
      this.openedBookmark = null;
      this.linkedHit = null;
      this.focusChunk = null;
    }

    openDoc(selectedHit) {
      if (this.openedBookmark) {
        const m = this.openedBookmark.meta;
        return { docId: m.docId || m.key, index: m.index };
      }
      if (selectedHit) return { docId: this.docId(selectedHit), index: selectedHit._index };
      return null;
    }

    openLink({ docId, index, chunk }, docs) {
      const hit = docs.find((d) => docKeyOf(d) === docId && (!index || d._index === index));
      if (!hit) {
        this.openById({ key: docId, docId, index }, chunk);
        return;
      }
      this.close();
      this.linkedHit = hit;
      this.focusChunk = chunk;
      if (chunk == null) return;
      if (hit._matchedChunks?.some((c) => c.chunk_id === chunk))
        tick().then(() => this.scrollToChunk(`mc-${this.docKey(hit)}`, chunk));
      else this.loadFullDocument(hit);
    }

    topChunk(hit) {
      let best = null;
      for (const c of hit?._matchedChunks || [])
        if (c.chunk_id != null && (best == null || (c.score || 0) > (best.score || 0))) best = c;
      return best?.chunk_id ?? null;
    }

    scrollToChunk(prefix, chunkId) {
      document
        .getElementById(`${prefix}-${chunkId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // Open a document in the reader (used by the related-documents section).
    // Prefer the in-results selection path (stays in sync with the pager); fall
    // back to fetching by id for a document outside the current filtered view.
    openHit(hit) {
      const i = this.#pager.selectByHit(hit);
      if (i >= 0) {
        this.select(i);
        return;
      }
      this.openById({
        key: this.docKey(hit),
        id: hit.id ?? null,
        docId: this.docId(hit),
        index: hit._index,
        file_name: hit.file_name,
        title: hit._title || "Untitled",
        state: hit.state || "Unknown",
        date: this.hitDate(hit),
      });
    }
    reset() {
      this.close();
      this.fullDocs = {};
    }

    // Open the exact document for a saved bookmark — fetched from Meilisearch by
    // id (the document API resolves the file_name and returns every chunk).
    async openById(bm, chunk = null) {
      this.close();
      this.focusChunk = chunk;
      const opened = { loading: true, meta: { ...bm }, chunks: [] };
      this.openedBookmark = opened;
      try {
        const did = bm.docId || docKeyOf(bm);
        const params = new URLSearchParams({ index: bm.index });
        if (did) params.set("doc_id", did);
        else params.set("file_name", bm.file_name);
        if (chunk != null) params.set("highlight_chunks", String(chunk));
        const resp = await fetch(`/api/document?${params}`);
        const d = await resp.json();
        if (this.openedBookmark?.meta.key !== opened.meta.key) return;
        this.openedBookmark = {
          loading: false,
          meta: {
            ...bm,
            title: bm.title || d.title_en || "Untitled",
            file_name: d.file_name || bm.file_name,
            docId: d.doc_id || did,
          },
          chunks: d.chunks || [],
        };
      } catch {
        if (this.openedBookmark?.meta.key !== opened.meta.key) return;
        this.openedBookmark = { loading: false, meta: { ...bm }, chunks: [] };
      }
      if (chunk != null) {
        await tick();
        this.scrollToChunk(`chunk-${bm.key}`, chunk);
      }
    }
    docKey(hit) {
      return docKeyOf(hit);
    }

    // Per-document id, matching docKey. Bookmarks carry it as `docId`.
    docId(hit) {
      return docKeyOf(hit);
    }

    hitDate(hit) {
      return docFormat.hitDate(hit);
    }

    hitPreview(hit) {
      return docFormat.hitPreview(hit);
    }

    hitExcerpt(hit) {
      return docFormat.hitExcerpt(hit);
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
      const docId = this.docId(hit);
      if (!hit._index || !docId) return;

      this.fullDocs[key] = { loading: true, chunks: [] };
      const highlightIds = (hit._matchedChunks || [])
        .map((c) => c.chunk_id)
        .join(",");

      try {
        const resp = await fetch(
          `/api/document?index=${encodeURIComponent(hit._index)}&doc_id=${encodeURIComponent(docId)}&highlight_chunks=${highlightIds}`,
        );
        const d = await resp.json();
        this.fullDocs[key] = { loading: false, chunks: d.chunks || [] };
      } catch {
        this.fullDocs[key] = { loading: false, chunks: [] };
      }

      await tick();
      const target = this.focusChunk ?? hit._matchedChunks?.[0]?.chunk_id;
      if (target != null) this.scrollToChunk(`chunk-${key}`, target);
    }
  }

  // ---------------------------------------------------------------------------
  // Bookmarks — unique saved entries, persisted to localStorage
  // ---------------------------------------------------------------------------
  class Bookmarks {
    static #KEY = "co_bookmarks";

    items = $state([]);

    static #key(hit) {
      return docKeyOf(hit);
    }

    load() {
      if (!browser) return;
      try {
        this.items = JSON.parse(localStorage.getItem(Bookmarks.#KEY) || "[]");
      } catch {
        this.items = [];
      }
    }
    #persist() {
      if (browser) localStorage.setItem(Bookmarks.#KEY, JSON.stringify(this.items));
    }

    has(hit) {
      const k = Bookmarks.#key(hit);
      return this.items.some((b) => b.key === k);
    }
    toggle(hit) {
      const k = Bookmarks.#key(hit);
      const i = this.items.findIndex((b) => b.key === k);
      if (i >= 0) {
        this.items = this.items.filter((_, j) => j !== i);
      } else {
        this.items = [
          ...this.items,
          {
            key: k,
            id: hit.id ?? null,
            docId: docKeyOf(hit),
            index: hit._index,
            file_name: hit.file_name,
            title: hit._title || "Untitled",
            state: hit.state || "Unknown",
            date: docFormat.hitDate(hit),
            score: hit._bestScore || 0,
          },
        ];
      }
      this.#persist();
    }
    remove(key) {
      this.items = this.items.filter((b) => b.key !== key);
      this.#persist();
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

    /** @type {AbortController | null} */
    #controller = null;

    // Stop any in-flight/queued background batch immediately. Called
    // whenever a new search starts so a stale query's lazy-load never
    // overlaps the new one's own (much heavier) multi-search.
    cancelBackgroundLoad() {
      this.#controller?.abort();
      this.#controller = null;
      this.loading = false;
      this.progress = "";
    }

    seed(serverData) {
      this.cancelBackgroundLoad();
      this.docs = Array.isArray(serverData.debates) ? serverData.debates : [];
      this.hitCount = serverData.hitCount || 0;
      this.estimated = serverData.totalEstimated || 0;
    }

    async fetchRemaining(query, extraParams = {}, startOffset = LazyLoader.#BATCH_SIZE) {
      this.cancelBackgroundLoad();
      const controller = new AbortController();
      this.#controller = controller;
      this.loading = true;

      let offset = startOffset;
      let accumulated = this.hitCount;
      let estimated = this.estimated;

      while (accumulated < LazyLoader.#MAX_HITS && accumulated < estimated) {
        this.progress = `Loading more results... ${accumulated} of ~${estimated}`;
        try {
          const params = new URLSearchParams({
            query,
            limit: String(LazyLoader.#BATCH_SIZE),
            offset: String(offset),
            ...extraParams,
          });
          const resp = await fetch(`/api/search?${params}`, { signal: controller.signal });
          if (!resp.ok) break;
          const batch = await resp.json();
          if (!batch.docs?.length) break;

          const docMap = new Map(this.docs.map((d) => [docKeyOf(d), d]));
          for (const doc of batch.docs) {
            const key = docKeyOf(doc);
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
          if (err instanceof Error && err.name === "AbortError") return; // a newer call already owns state — don't touch it
          console.error("Lazy load failed:", err);
          break;
        }
      }

      if (this.#controller === controller) {
        this.loading = false;
        this.progress = "";
        this.#controller = null;
      }
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
    static #PER_PAGE = 10;

    currentPage = $state(0);

    #filter;
    constructor(filter) {
      this.#filter = filter;
    }

    // Full ranked list (drives the topic map — must stay unfiltered by topic,
    // else selecting a topic would re-run LDA on only that topic's docs).
    get allRankedHits() {
      return [...this.#filter.filteredHits].sort(
        (a, b) => (b._bestScore || 0) - (a._bestScore || 0),
      );
    }

    // Ranked list actually paged/shown — narrowed to the cluster opened in the
    // map (topicHighlight.docKeys), if any.
    get rankedHits() {
      const all = this.allRankedHits;
      const keys = topicHighlight.docKeys;
      return keys ? all.filter((h) => keys.has(docKeyOf(h))) : all;
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

    // Navigate to the page containing `hit` (in the currently shown list) and
    // return its within-page index, or -1 if it isn't in the shown list.
    selectByHit(hit) {
      const key = docKeyOf(hit);
      const r = this.rankedHits.findIndex((h) => docKeyOf(h) === key);
      if (r < 0) return -1;
      this.goTo(Math.floor(r / ResultPager.#PER_PAGE));
      return r % ResultPager.#PER_PAGE;
    }
  }

  // ---------------------------------------------------------------------------

  const loader = new LazyLoader();
  const filter = new ResultFilter(loader);
  const pager = new ResultPager(filter);
  const panel = new DocPanel(pager);
  const bookmarks = new Bookmarks();

  onMount(() => bookmarks.load());

  let container;
  onMount(() => {
    const sp = page.url.searchParams;
    if (sp.has("query") || sp.has("doc")) container?.scrollIntoView({ behavior: "instant", block: "start" });
  });

  onMount(() => {
    const sp = page.url.searchParams;
    const states = sp.get("states");
    if (states) filter.selectedStates = new Set(states.split(","));
    filter.yearMin = sp.get("yearMin") || "";
    filter.yearMax = sp.get("yearMax") || "";
    if (sp.has("hybrid")) searchParams.hybrid = sp.get("hybrid") === "true";
    if (sp.has("semanticRatio")) searchParams.semanticRatio = parseFloat(sp.get("semanticRatio") ?? "");
    if (sp.has("scoreThreshold")) searchParams.scoreThreshold = parseFloat(sp.get("scoreThreshold") ?? "");
    const indices = sp.get("indices");
    if (indices) searchParams.indexIds = new Set(indices.split(","));
  });

  let pendingLink = $state(readLink(page.url.searchParams));

  function readLink(sp) {
    const docId = sp.get("doc");
    if (!docId) return null;
    const chunk = sp.has("chunk") ? Number(sp.get("chunk")) : NaN;
    return { docId, index: sp.get("index") || "", chunk: Number.isInteger(chunk) ? chunk : null };
  }

  function linkParams(chunk = panel.focusChunk ?? panel.topChunk(selectedHit)) {
    const query = resolved.searchParams?.query;
    const doc = panel.openDoc(selectedHit) ?? pendingLink;
    const params = new URLSearchParams();
    if (query) {
      params.set("query", query);
      params.set("hybrid", String(searchParams.hybrid));
      params.set("semanticRatio", String(searchParams.semanticRatio));
      params.set("scoreThreshold", String(searchParams.scoreThreshold));
    }
    if (searchParams.indexIds.size) params.set("indices", [...searchParams.indexIds].join(","));
    if (filter.selectedStates.size) params.set("states", [...filter.selectedStates].join(","));
    if (filter.yearMin) params.set("yearMin", filter.yearMin);
    if (filter.yearMax) params.set("yearMax", filter.yearMax);
    if (doc?.docId) {
      params.set("doc", doc.docId);
      if (doc.index) params.set("index", doc.index);
      const c = doc === pendingLink ? pendingLink.chunk : chunk;
      if (c != null) params.set("chunk", String(c));
    }
    return params;
  }

  function permalink(chunk) {
    return new URL(`${basePath}?${linkParams(chunk)}`, location.origin).href;
  }

  $effect(() => {
    if (!loaded || searching || loadError) return;
    const params = linkParams();
    if (!params.has("query") && !params.has("doc")) return;
    const url = `${basePath}?${params}`;
    if (browser && url !== `${location.pathname}${location.search}`) goto(url, { shallow: true, replace: true });
  });

  // `data` comes from the route's SSR load; `basePath` is the route this app
  // lives on so searches navigate back to the same page ("/ask" or "/").
  let { data, basePath = "/ask" } = $props();

  /** @type {any} */
  const EMPTY_SEARCH_DATA = {
    debates: [],
    hitCount: 0,
    totalEstimated: 0,
    collections: [],
    indices: [],
    searchParams: {},
  };
  let resolved = $state(EMPTY_SEARCH_DATA);
  let loaded = $state(false);
  let indexDetails = $state([]);

  // UI state — search bar + loading flag
  let searching = $state(false);
  let loadError = $state(null);

  const CLIENT_LOAD_TIMEOUT = 12_000;

  // Stale-while-revalidate: keep the previous results rendered while the new
  // search resolves and swap them in one go. Blanking `resolved` here instead
  // left the map, cards and subtitle empty for the whole multi-search (seconds),
  // which read as a broken page — `searching` already drives the loading UI.
  $effect(() => {
    const source = data.streamed ?? data;
    searching = true;
    loadError = null;
    let cancelled = false;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Search timed out")), CLIENT_LOAD_TIMEOUT);
    });
    Promise.race([source, timeout])
      .then(
        (value) => {
          if (cancelled) return;
          loaded = true;
          resolved = value;
          searching = false;
        },
        (err) => {
          if (cancelled) return;
          console.error("Search load failed:", err);
          loadError = "The search took too long or failed.";
          searching = false;
        },
      )
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  $effect(() => {
    let cancelled = false;
    Promise.resolve(data.indices ?? []).then((value) => {
      if (!cancelled && Array.isArray(value)) indexDetails = value;
    });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    searchBox.query = resolved.searchParams?.query || "";
  });

  // Seed loader + reset everything when the resolved data changes
  $effect(() => {
    loader.seed(resolved);
    pager.reset();
    panel.reset();

    untrack(() => {
      if (!loaded || !pendingLink) return;
      panel.openLink(pendingLink, loader.docs);
      pendingLink = null;
    });

    const query = resolved.searchParams?.query;
    if (query && (resolved.totalEstimated || 0) > (resolved.hitCount || 0)) {
      untrack(() =>
        loader.fetchRemaining(query, {
          hybrid: String(resolved.searchParams?.hybrid || false),
          semanticRatio: String(resolved.searchParams?.semanticRatio || 0.5),
          scoreThreshold: String(resolved.searchParams?.scoreThreshold || 0.4),
          ...(resolved.searchParams?.indices
            ? { indices: resolved.searchParams.indices }
            : {}),
        }, resolved.searchParams?.limit),
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

  let hasQuery = $derived(!!resolved.searchParams?.query);
  let indices = $derived(indexDetails);

  let subtitle = $derived(
    `${pager.allRankedHits.length} documents, ${loader.hitCount} results of ~${loader.estimated} total` +
      (filter.isStateCollection ? `, ${filter.stateNames.length} states` : "") +
      (filter.activeCollection ? ` in ${filter.activeCollection}` : ""),
  );
  let loadPct = $derived(
    Math.min(100, (loader.hitCount / Math.min(loader.estimated, 1500)) * 100),
  );

  // Detail/accordion is driven by an *explicit* selection only — no implicit
  // "default to first hit", so the accordion stays closed until the user picks
  // a result, a topic dot, or a bookmark.
  let selectedHit = $derived(
    panel.linkedHit ??
      (panel.selectedHitIndex != null && panel.selectedHitIndex < pager.pageHits.length
        ? pager.pageHits[panel.selectedHitIndex]
        : null),
  );

  // --- Actions ---

  function navigateSearch(url) {
    loader.cancelBackgroundLoad();
    panel.reset();
    pager.reset();
    loadError = null;
    searching = true;
    goto(url, { refreshAll: true, reset: false }).catch((err) => {
      console.error("Search navigation failed:", err);
      loadError = "The search could not be started.";
      searching = false;
    });
  }

  function handleSubmit() {
    navigateSearch(`${basePath}?${searchParams.build(searchBox.query).toString()}`);
  }

  function retrySearch() {
    navigateSearch(`${page.url.pathname}${page.url.search}`);
  }

</script>

<div id="container" bind:this={container}>
  <div class="page-layout">
    <SearchSidebar
      {searching}
      {subtitle}
      loadingMore={loader.loading}
      loadProgress={loader.progress}
      {loadPct}
      {indices}
      collectionDebates={filter.collectionDebates}
      isStateCollection={filter.isStateCollection}
      allStates={filter.allStates}
      bind:selectedStates={filter.selectedStates}
      bind:yearMin={filter.yearMin}
      bind:yearMax={filter.yearMax}
      bookmarkCount={bookmarks.items.length}
      onsearch={handleSubmit}
    />

    <!-- Center column: topic map + paged results -->
    <ResultsList
      {pager}
      {panel}
      {searching}
      {loadError}
      onretry={retrySearch}
      query={resolved.searchParams?.query || ""}
      {indices}
      paginationDone={!loader.loading}
    />

    <!-- Right rail: the topic model's vocabulary, as further searches -->
    <TermSuggestions
      {searching}
      query={resolved.searchParams?.query || ""}
      onsearch={handleSubmit}
    />

    <!-- modal: bookmarks + collapsible detail accordion -->
    <DetailPanel
      {panel}
      {bookmarks}
      {selectedHit}
      allHits={loader.docs}
      scopedHits={pager.rankedHits}
      onOpenDoc={(hit) => panel.openHit(hit)}
      {permalink}
    />
  </div>
</div>

<style lang="postcss">
  @reference "../../../app.css";

  #container {
    @apply mx-auto w-screen md:w-[90vw];
    display: flex;
    flex-direction: column;
  }

  .page-layout {
    @apply grid gap-4 px-4 mx-2 h-auto items-start;
    /* Bounded so the rails never shrink to an unusably narrow column before
       the layout switches to a single stacked column below. */
    --rail-primary: clamp(240px, 20vw, 340px);
    --rail: clamp(210px, 15vw, 320px);

    grid-template-columns: var(--rail-primary) minmax(0, 1fr) var(--rail);
    padding-top: 1.5rem;
    padding-bottom: 1.5rem;
  }

  @media (max-width: 1000px) {
    /* Below this, even the clamped rail leaves too little room for the
       center column — let the page scroll naturally as a column instead */
    .page-layout {
      grid-template-columns: minmax(0, 1fr);
      padding-bottom: 2rem;
    }
  }

  :global(input[type="text"]) {
    @apply selection:bg-primary selection:text-black;
  }
</style>
