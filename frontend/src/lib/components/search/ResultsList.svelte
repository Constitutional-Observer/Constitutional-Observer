<script>
  import TopicViews from "$lib/components/search/views/TopicViews.svelte";
  import { topicHighlight } from "$lib/components/search/search-state.svelte.js";
  import { renderHighlight, chunkText, chunkSnippet } from "$lib/highlight.js";
  

  let {
    pager,
    panel,
    query = "",
    indices = [],
    paginationDone = true,
    searching = false,
  } = $props();

  // The document's dominant-topic terms, for highlighting in its card.
  const hitTopics = (hit) => topicHighlight.termsByDoc[panel.docKey(hit)] || [];

  // When the map opens a cluster (topicHighlight.docKeys changes), jump back to
  // the first page and clear any open detail. The pager itself reads docKeys.
  $effect(() => {
    topicHighlight.docKeys;
    pager.currentPage = 0;
    panel.selectedHitIndex = null;
  });
</script>

{#snippet pagination(showInfo)}
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
    {#if showInfo}
      <span class="page-info">Page {pager.currentPage + 1} of {pager.totalPages}</span>
    {/if}
  </nav>
{/snippet}

<main class="results-list-container" class:is-stale={searching}>
  <TopicViews
    hits={pager.allRankedHits}
    {query}
    {indices}
    {paginationDone}
    onselect={(hit) => {
      const i = pager.selectByHit(hit);
      if (i >= 0) panel.select(i);
    }}
  />
<div class="results-list">
  <!-- Pagination top -->
  {#if pager.totalPages > 1}{@render pagination(true)}{/if}

  {#each pager.pageHits as hit, i (hit.id || `${pager.currentPage}-${i}`)}
    <!-- Mobile -->
    <details class="accordion mobile-only" open={i < 3}>
      <summary>
        <div class="result-summary">
          <!-- <span class="score-badge">{(hit._bestScore || 0).toFixed(3)}</span> -->
          <div class="result-info">
            <div class="result-head">
            {#if panel.hitDate(hit)}<span class="date-badge"
                  >{panel.hitDate(hit)}</span
                >{/if}
              <span class="state-badge">In {hit.state || "Unknown"}, on </span>
              
              <h4 class="result-title">
                {hit._title || "Untitled"}
              </h4>
            </div>
            <p class="result-preview">{@html renderHighlight(hit._matchedChunks[0].textHL, hitTopics(hit))}</p>
          </div>
        </div>
      </summary>
      <div class="accordion-content">
        <!-- groupHitsIntoDocs builds every doc from at least one hit, so a
             result always carries _matchedChunks. -->
        {#if hit._matchedChunks?.length}
          <p class="matched-label">
            {hit._matchedChunks.length} matched section{hit._matchedChunks.length >
            1
              ? "s"
              : ""}
          </p>
          {#each hit._matchedChunks as mc, mci (mc.chunk_id ?? mci)}
            <div class="matched-chunk">
              <div class="chunk-header">
                <span class="chunk-id"
                  >#{mc.chunk_id} &middot; {mc.score?.toFixed(3) || ""}</span
                >
                <button
                  class="copy-btn"
                  onclick={() =>
                    panel.copyText(chunkText(mc), `mc-${hit.id}-${mc.chunk_id}`)}
                >
                  {panel.copiedId === `mc-${hit.id}-${mc.chunk_id}`
                    ? "Copied"
                    : "Copy"}
                </button>
              </div>
              <p>{@html renderHighlight(chunkSnippet(mc), hitTopics(hit))}</p>
            </div>
          {/each}
        {/if}
        {#if !panel.fullDocs[panel.docKey(hit)]}
          <button class="load-doc-btn" onclick={() => panel.loadFullDocument(hit)}
            >Load full document</button
          >
        {:else if panel.fullDocs[panel.docKey(hit)].loading}
          <p class="doc-loading">Loading...</p>
        {:else if panel.fullDocs[panel.docKey(hit)].chunks.length > 0}
          <div class="full-doc">
            <p class="doc-info">
              {panel.fullDocs[panel.docKey(hit)].chunks.length} chunks in document
            </p>
            {#each panel.fullDocs[panel.docKey(hit)].chunks as chunk, ci (chunk.chunk_id ?? ci)}
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
      class:result-card-active={panel.selectedHitIndex === i}
      onclick={() => panel.toggleSelect(i)}
    >
      <div class="result-summary">
        <!-- <span class="score-badge">{(hit._bestScore || 0).toFixed(3)}</span> -->
        <div class="result-info">
          <div class="result-head">
                 {#if panel.hitDate(hit)}<span class="date-badge"
                >{panel.hitDate(hit)}</span
              >{/if}
            <span class="state-badge">In {hit.state || "Unknown"}, </span>
     
            <h4 class="result-title">
              {hit._title || "Untitled"}
            </h4>
          </div>
          <p class="result-preview">{@html renderHighlight(panel.hitExcerpt(hit), hitTopics(hit))}</p>
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
  {#if pager.totalPages > 1}{@render pagination(false)}{/if}
  </div>
</main>

<style lang="postcss">
  @reference "../../../app.css";

  .results-list-container {
    @apply flex-1 ;
    transition: opacity 0.15s ease;
  }
  /* Results from the previous query, still shown while the new one loads. */
  .is-stale {
    @apply opacity-40 pointer-events-none;
  }

  .results-list {
    @apply h-auto overflow-y-auto p-2 bg-primary/10 border border-primary/30;
  }
  .mobile-only {
    display: none;
  }
  .desktop-only {
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
    @apply w-full text-left bg-white/50 p-3 mb-3 transition-all cursor-pointer;
    border: 5px solid rgba(139, 115, 85, 0.8);
  }
  .result-card:hover {
    @apply bg-white/70 shadow-sm;
    border-color: rgba(139, 115, 85, 0.55);
  }
  .result-card-active {
    @apply bg-primary/30;
    border-color: #b8860b;
    box-shadow: 0 0 0 2px rgba(184, 134, 11, 0.4);
  }

  .result-summary {
    @apply flex items-start gap-3 w-full min-w-0;
  }
  .score-badge {
    @apply shrink-0 text-sm font-mono font-bold px-2 py-1 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300;
  }
  .result-info {
    @apply grid flex-1 min-w-0 gap-x-3 gap-y-1;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "meta tags"
      "preview tags";
  }
  .state-badge {
    @apply text-[1em] font-semibold px-2 py-0.5;
  }
  .result-head {
    @apply flex flex-wrap items-baseline min-w-0;
    grid-area: meta;
  }
  .date-badge {
    @apply text-[1em] font-mono font-bold px-2 py-0.5;
  }
  .result-title {
    @apply text-[1em] capitalize font-semibold text-black/90;
  }
  .result-preview {
    @apply text-[0.9em] text-black/50 line-clamp-4 leading-relaxed;
    grid-area: preview;
  }

  .meta-tags {
    @apply flex flex-wrap content-start justify-end gap-1 max-w-[11rem];
    grid-area: tags;
  }
  .meta-tag {
    @apply text-[10px] bg-primary/20 text-black/70 px-1.5 py-0.5 rounded h-fit;
    border: 1px solid rgba(139, 115, 85, 0.35);
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

  .accordion {
    @apply bg-white/50 p-3 mb-3 transition-all;
    border: 5px solid rgba(139, 115, 85, 0.8);
  }
  .accordion:hover {
    @apply bg-white/70;
    border-color: rgba(139, 115, 85, 0.55);
  }
  .accordion[open] {
    @apply bg-primary/30;
    border-color: #b8860b;
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
