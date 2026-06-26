<script>
  // Right-hand column for the search page: a localStorage bookmarks list plus a
  // collapsible detail accordion that shows the selected result, or a bookmark
  // opened by id. Reactive state lives on the `panel` (DocPanel) and `bookmarks`
  // (Bookmarks) class instances passed in as props.
  let { panel, bookmarks, selectedHit } = $props();

  // Render Meilisearch highlight markup ({@html}) safely: escape everything,
  // then restore only the <strong>…</strong> highlight tags the search API adds.
  function renderHighlight(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/&lt;strong&gt;/g, "<strong>")
      .replace(/&lt;\/strong&gt;/g, "</strong>");
  }

  // Open whenever something is selected (a result hit or an opened bookmark),
  // closed otherwise.
  let detailOpen = $state(false);
  $effect(() => {
    detailOpen = !!(panel.openedBookmark || selectedHit);
  });
</script>

<aside class="right-col">
  <!-- Bookmarks (persisted to localStorage) -->
  <section class="bookmarks-panel">
    <header class="bm-header">
      <span class="bm-title">★ Bookmarks</span>
      <span class="bm-count">{bookmarks.items.length}</span>
    </header>
    {#if bookmarks.items.length === 0}
      <p class="bm-empty">No bookmarks yet. Open a result and tap ☆ to save it.</p>
    {:else}
      <ul class="bm-list">
        {#each bookmarks.items as bm (bm.key)}
          <li class="bm-item">
            <button class="bm-open" onclick={() => panel.openById(bm)}>
              <span class="bm-item-head">
                <span class="state-badge">{bm.state}</span>
                {#if bm.date}<span class="date-badge">{bm.date}</span>{/if}
              </span>
              <span class="bm-item-title">{bm.title}</span>
            </button>
            <button
              class="bm-remove"
              title="Remove bookmark"
              onclick={() => bookmarks.remove(bm.key)}>✕</button
            >
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Detail accordion — closed when nothing is selected -->
  <details class="detail-accordion" bind:open={detailOpen}>
    <summary class="detail-summary">
      {#if panel.openedBookmark}
        <span class="detail-summary-label">Bookmark</span>
        <span class="detail-summary-title">{panel.openedBookmark.meta.title}</span>
      {:else if selectedHit}
        <span class="detail-summary-label">Selected</span>
        <span class="detail-summary-title"
          >{selectedHit.title_en || selectedHit.subject || "Untitled"}</span
        >
      {:else}
        <span class="detail-summary-title detail-summary-empty">Nothing selected</span>
      {/if}
    </summary>

    <div class="detail-body">
      {#if panel.openedBookmark}
        {@const ob = panel.openedBookmark}
        <div class="detail-header">
          <div class="detail-actions">
            <button class="back-btn" onclick={() => panel.closeBookmark()}
              >← Close</button
            >
          </div>
          <h3 class="detail-title">{ob.meta.title}</h3>
          <div class="result-head">
            <span class="state-badge">{ob.meta.state}</span>
            {#if ob.meta.date}<span class="date-badge">{ob.meta.date}</span>{/if}
          </div>
        </div>
        {#if ob.loading}
          <p class="doc-loading">Loading document…</p>
        {:else if ob.chunks.length}
          <div class="full-doc">
            <p class="doc-info">{ob.chunks.length} chunks in document</p>
            {#each ob.chunks as chunk, ci (chunk.chunk_id ?? ci)}
              <div
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
      {:else if selectedHit}
        <div class="detail-header">
          <div class="detail-actions">
            <button
              class="bookmark-btn"
              class:bookmarked={bookmarks.has(selectedHit)}
              onclick={() => bookmarks.toggle(selectedHit)}
            >
              {bookmarks.has(selectedHit) ? "★ Bookmarked" : "☆ Bookmark"}
            </button>
          </div>
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
          {#each selectedHit._matchedChunks as mc, mci (mc.chunk_id ?? mci)}
            <div class="matched-chunk">
              <div class="chunk-header">
                <span class="chunk-id"
                  >#{mc.chunk_id} &middot; {mc.score?.toFixed(3) || ""}</span
                >
                <button
                  class="copy-btn"
                  onclick={() =>
                    panel.copyText(mc.text, `mc-${selectedHit.id}-${mc.chunk_id}`)}
                >
                  {panel.copiedId === `mc-${selectedHit.id}-${mc.chunk_id}`
                    ? "Copied"
                    : "Copy"}
                </button>
              </div>
              <p>{@html renderHighlight(mc.textHL || mc.text)}</p>
            </div>
          {/each}
        {:else}
          <blockquote class="result-excerpt">
            {@html renderHighlight(
              selectedHit._formatted?.__discussions ||
                selectedHit.__discussions ||
                "",
            )}
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
            {#each panel.fullDocs[panel.docKey(selectedHit)].chunks as chunk, ci (chunk.chunk_id ?? ci)}
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
      {:else}
        <p class="detail-empty-body">
          Select a result, a topic dot, or a bookmark to see details here.
        </p>
      {/if}
    </div>
  </details>
</aside>

<style lang="postcss">
  /* Layout: stacked bookmarks panel + detail accordion; hidden on mobile. */
  .right-col {
    @apply flex flex-col gap-3;
    width: 420px;
    min-height: 0;
    flex-shrink: 0;
  }
  @media (max-width: 768px) {
    .right-col { display: none; }
  }

  /* Bookmarks */
  .bookmarks-panel {
    @apply rounded-lg bg-primaryLight/80 backdrop-blur-sm border border-primary/30 p-3 flex flex-col;
    flex-shrink: 0;
    max-height: 38%;
  }
  .bm-header {
    @apply flex items-center justify-between mb-2 pb-2 border-b border-primary/20;
  }
  .bm-title {
    @apply text-[11px] font-bold text-black/70 uppercase tracking-wider;
  }
  .bm-count {
    @apply text-[10px] font-mono font-bold px-1.5 rounded bg-black/10 text-black/50;
  }
  .bm-empty {
    @apply text-xs text-black/40 italic;
  }
  .bm-list {
    @apply flex flex-col gap-1 overflow-y-auto m-0 p-0 list-none;
    min-height: 0;
  }
  .bm-item {
    @apply flex items-stretch gap-1;
  }
  .bm-open {
    @apply flex-1 min-w-0 text-left rounded p-1.5 bg-white/50 hover:bg-primary/20 transition cursor-pointer border border-transparent;
  }
  .bm-item-head {
    @apply flex items-center gap-1.5 mb-0.5;
  }
  .bm-item-title {
    @apply block text-[12px] font-semibold text-black/80 truncate;
  }
  .bm-remove {
    @apply shrink-0 px-1.5 rounded text-[11px] text-black/40 bg-white/40 hover:bg-red-100 hover:text-red-700 transition cursor-pointer border border-transparent;
  }
  .bm-remove::after {
    content: "";
  }

  /* Detail accordion */
  .detail-accordion {
    @apply rounded-lg bg-primaryLight/80 backdrop-blur-sm border border-primary/30 flex flex-col overflow-hidden;
    flex: 1;
    min-height: 0;
  }
  .detail-summary {
    @apply flex items-center gap-2 p-3 cursor-pointer list-none border-b border-transparent;
    flex-shrink: 0;
  }
  .detail-accordion[open] .detail-summary {
    @apply border-primary/20;
  }
  .detail-summary::-webkit-details-marker {
    display: none;
  }
  .detail-summary::before {
    content: "▸";
    @apply text-black/40 text-xs;
  }
  .detail-accordion[open] .detail-summary::before {
    content: "▾";
  }
  .detail-summary-label {
    @apply text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/30 text-black/60 shrink-0;
  }
  .detail-summary-title {
    @apply text-sm font-semibold text-black/90 truncate;
  }
  .detail-summary-empty {
    @apply text-black/40 font-normal italic;
  }
  .detail-body {
    @apply overflow-y-auto p-4 pt-2;
    min-height: 0;
  }
  .detail-empty-body {
    @apply text-sm text-black/40 italic;
  }
  .detail-actions {
    @apply flex justify-end mb-1;
  }
  .bookmark-btn {
    @apply text-[11px] px-2 py-0.5 rounded border border-primary/40 bg-white/60 text-black/70 cursor-pointer transition hover:bg-primary/20;
  }
  .bookmark-btn.bookmarked {
    @apply bg-amber-100 border-amber-300 text-amber-900;
  }
  .bookmark-btn::after {
    content: "";
  }
  .back-btn {
    @apply text-[11px] px-2 py-0.5 rounded border border-primary/30 bg-white/60 text-black/70 cursor-pointer hover:bg-primary/20;
  }
  .back-btn::after {
    content: "";
  }
  .detail-header {
    @apply space-y-2 mb-4 pb-3 border-b border-primary/20;
  }
  .detail-title {
    @apply text-base font-bold text-black/90;
  }

  /* Shared document-display styles (also defined in the result list). */
  .state-badge {
    @apply text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200;
  }
  .result-head {
    @apply flex items-center gap-2 flex-wrap;
  }
  .date-badge {
    @apply text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300;
  }
  .meta-tags {
    @apply flex flex-wrap gap-1.5 mt-1;
  }
  .meta-tag {
    @apply text-[10px] bg-primary/20 text-black/70 px-1.5 py-0.5 rounded;
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
  /* Meilisearch highlight tags (search terms) */
  .matched-chunk :global(strong),
  .result-excerpt :global(strong) {
    background: rgba(251, 191, 36, 0.55);
    border-radius: 2px;
    padding: 0 1px;
    font-weight: 700;
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
</style>
