<script>
  // Modal-based detail/bookmarks UI for the search page. The bookmarks modal is
  // opened by a trigger in the sidebar (via the shared `ui.showBookmarks`);
  // clicking a result (or opening a bookmark) opens the detail modal. Reactive
  // state lives on the `panel` (DocPanel) and `bookmarks` (Bookmarks) class
  // instances passed in as props.
  import { renderHighlight as renderHL, chunkText, markQuery } from "$lib/highlight.js";
  import { ui, searchBox, topicHighlight } from "$lib/components/search/search-state.svelte.js";
  

  // ── RelatedSearch ────────────────────────────────────────────────────────────
  // Clicking a highlighted term (interactive only in this panel) searches the
  // already-loaded documents locally — no server call, no parent-search rewrite —
  // and surfaces matches in the panel's right section. Modelled as a state class,
  // like DocPanel / ResultPager / LazyLoader in SearchApp.
  class RelatedSearch {
    active = $state(false); // keeps the panel open even with no document loaded
    term   = $state("");
    tab    = $state("scoped"); // "scoped" (current view) | "all" (everything loaded)

    open(term) {
      const t = String(term || "").replace(/_/g, " ").trim();
      if (!t) return;
      this.term = t;
      this.active = true;
    }
    close() {
      this.active = false;
      this.term = "";
    }

    // use:related.action — delegate clicks on injected .hl-btn highlights to this
    // search. Arrow field so `this` stays bound when used as a Svelte action. The
    // buttons stay keyboard-focusable; stop/preventDefault keep an enclosing
    // element from also reacting.
    action = (node) => {
      const handler = (e) => {
        const btn = e.target.closest?.(".hl-btn");
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        this.open(btn.textContent || "");
      };
      node.addEventListener("click", handler);
      return { destroy: () => node.removeEventListener("click", handler) };
    };

    // The searchable text held for a hit (its matched chunks); full document
    // bodies aren't loaded client-side, so this is best-effort.
    static #hitText(hit) {
      return (hit._matchedChunks || []).map(chunkText).filter(Boolean).join("\n");
    }

    // Hits whose held text contains the term, each with a match count and up to
    // three clickable highlighted snippets, sorted by count. Word boundaries,
    // case-insensitive; underscores treated as spaces (merged phrases).
    search(hits) {
      const q = this.term.replace(/_/g, " ").trim();
      if (!q || !hits?.length) return [];
      const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\b${esc}\\b`, "gi");
      const results = [];
      for (const hit of hits) {
        const text = RelatedSearch.#hitText(hit);
        if (!text) continue;
        re.lastIndex = 0;
        const snippets = [];
        let count = 0, m;
        while ((m = re.exec(text))) {
          count++;
          if (snippets.length < 3) {
            const start = Math.max(0, m.index - 60);
            const end = Math.min(text.length, m.index + m[0].length + 60);
            const raw = (start > 0 ? "…" : "") + text.slice(start, end) +
              (end < text.length ? "…" : "");
            snippets.push(renderHL(raw, [q], true));
          }
          if (m.index === re.lastIndex) re.lastIndex++; // guard empty match
        }
        if (count) results.push({ hit, count, snippets });
      }
      results.sort((a, b) => b.count - a.count);
      return results;
    }
  }

  let {
    panel,
    bookmarks,
    selectedHit,
    allHits = [],
    scopedHits = [],
    onOpenDoc,
  } = $props();

  const related = new RelatedSearch();
  let relatedHits = $derived(related.tab === "all" ? allHits : scopedHits);
  let relatedResults = $derived(related.search(relatedHits));

  // The open document's docKey — bookmarks store it as `key`; selected hits
  // resolve it via panel.docKey.
  let openDocKey = $derived.by(() => {
    if (panel.openedBookmark) return panel.openedBookmark.meta.key;
    if (selectedHit) return panel.docKey(selectedHit);
    return null;
  });

  // The open document's topics (strongest-first) and the union of their terms.
  // Highlighting overlays the amber query terms with every member topic's terms.
  let docTopicList = $derived(
    openDocKey ? topicHighlight.topicsByDoc[openDocKey] || [] : [],
  );
  let highlightTerms = $derived(
    openDocKey ? topicHighlight.termsByDoc[openDocKey] || [] : [],
  );

  // Query-term + topic-term highlight for the open document. Clickable — the
  // detail panel is the one place a highlight is interactive.
  const renderHighlight = (text) => renderHL(text, highlightTerms, true);

  const renderDocChunk = (text) =>
    renderHL(markQuery(text, searchBox.query), highlightTerms, true);

  // Detail modal is open whenever there's a document to read (a result hit or an
  // opened bookmark) OR an active related-term search (which can be started from
  // a result card with no document open yet). The bookmarks modal is independent.
  let hasReader = $derived(!!(panel.openedBookmark || selectedHit));
  let detailOpen = $derived(hasReader || related.active);

  // Lock background scroll while either modal is open.
  $effect(() => {
    if (detailOpen || ui.showBookmarks) {
      document.body.style.overflow = "hidden";
      return () => (document.body.style.overflow = "");
    }
  });

  function closeDetail() {
    panel.selectedHitIndex = null;
    panel.closeBookmark();
    related.close();
  }

  function openBookmark(bm) {
    ui.showBookmarks = false;
    panel.openById(bm);
  }

  function onKeydown(e) {
    if (e.key !== "Escape") return;
    if (detailOpen) closeDetail();
    else if (ui.showBookmarks) ui.showBookmarks = false;
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- One chip per topic the document belongs to (strongest first), showing the
     topic's share and its top terms. -->
{#snippet topicMembership()}
  {#if docTopicList.length}
    <div class="doc-topics">
      <span class="doc-topics-label"
        >In {docTopicList.length} topic{docTopicList.length > 1 ? "s" : ""}</span
      >
      <div class="doc-topics-chips">
        {#each docTopicList as t, ti (t.topic)}
          <span class="topic-chip" class:topic-chip-dom={ti === 0}>
            <span class="topic-chip-pct">{Math.round(t.prob * 100)}%</span>
            {t.terms.slice(0, 3).map((x) => x.replace(/_/g, " ")).join(" · ")}
          </span>
        {/each}
      </div>
    </div>
  {/if}
{/snippet}

<!-- Bookmarks modal -->
{#if ui.showBookmarks}
  <div
    class="modal-overlay"
    role="presentation"
    onclick={() => (ui.showBookmarks = false)}
  >
    <div
      class="modal bookmarks-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Bookmarks"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
    >
      <header class="modal-header">
        <span class="modal-title">★ Bookmarks <span class="bm-count">{bookmarks.items.length}</span></span>
        <button class="modal-close" title="Close" onclick={() => (ui.showBookmarks = false)}>✕</button>
      </header>
      <div class="modal-body">
        {#if bookmarks.items.length === 0}
          <p class="bm-empty">No bookmarks yet. Open a result and tap ☆ to save it.</p>
        {:else}
          <ul class="bm-list">
            {#each bookmarks.items as bm (bm.key)}
              <li class="bm-item">
                <button class="bm-open" onclick={() => openBookmark(bm)}>
                  <span class="bm-item-head">
                    <span class="state-badge">{bm.state}</span>
                    {#if bm.date}<span class="date-badge">{bm.date}</span>{/if}
                  </span>
                  <span class="bm-item-title">{bm.title}</span>
                  {#if bm.docId}<span class="doc-id-badge">{bm.docId}</span>{/if}
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
      </div>
    </div>
  </div>
{/if}

<!-- Detail modal -->
{#if detailOpen}
  <div class="modal-overlay" role="presentation" onclick={closeDetail}>
    <div
      class="modal detail-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Document detail"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
    >
      <header class="modal-header">
        {#if panel.openedBookmark}
          <span class="detail-summary-label">Bookmark</span>
          <span class="modal-title">{panel.openedBookmark.meta.title}</span>
        {:else if selectedHit}
          <span class="detail-summary-label">Selected</span>
          <span class="modal-title"
            >{selectedHit._title || "Untitled"}</span
          >
        {:else}
          <span class="detail-summary-label">Related</span>
          <span class="modal-title">Documents mentioning &ldquo;{related.term}&rdquo;</span>
        {/if}
        <button class="modal-close" title="Close" onclick={closeDetail}>✕</button>
      </header>

      <div class="detail-split">
        <div class="modal-body detail-body reader-pane">
        {#if panel.openedBookmark}
          {@const ob = panel.openedBookmark}
          <div class="detail-header">
            <h3 class="detail-title">{ob.meta.title}</h3>
            <div class="result-head">
              <span class="state-badge">{ob.meta.state}</span>
              {#if ob.meta.date}<span class="date-badge">{ob.meta.date}</span>{/if}
            </div>
            {#if ob.meta.docId}<p class="doc-id-line">ID: <span class="doc-id-badge">{ob.meta.docId}</span></p>{/if}
            {@render topicMembership()}
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
                  <p use:related.action>{@html renderDocChunk(chunk.text)}</p>
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
              {selectedHit._title || "Untitled"}
            </h3>
            <div class="result-head">
              <span class="state-badge">{selectedHit.state || "Unknown"}</span>
              {#if panel.hitDate(selectedHit)}<span class="date-badge"
                  >{panel.hitDate(selectedHit)}</span
                >{/if}
            </div>
            {#if panel.docId(selectedHit)}<p class="doc-id-line">ID: <span class="doc-id-badge">{panel.docId(selectedHit)}</span></p>{/if}
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
            {@render topicMembership()}
          </div>

          <!-- groupHitsIntoDocs builds every doc from at least one hit, so a
               result always carries _matchedChunks. -->
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
                      panel.copyText(chunkText(mc), `mc-${selectedHit.id}-${mc.chunk_id}`)}
                  >
                    {panel.copiedId === `mc-${selectedHit.id}-${mc.chunk_id}`
                      ? "Copied"
                      : "Copy"}
                  </button>
                </div>
                <p class="result-excerpt" use:related.action>{@html renderHighlight(mc.textHL)}</p>
              </div>
            {/each}
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
                  <p use:related.action>{@html renderDocChunk(chunk.text)}</p>
                </div>
              {/each}
            </div>
          {:else}
            <p class="doc-loading">Could not load document.</p>
          {/if}
        {:else}
          <p class="reader-placeholder">
            Pick a related document on the right to read it here.
          </p>
        {/if}
        </div>

        <aside class="related-pane">
          <header class="related-header">
            <span class="related-title">Related documents</span>
            {#if related.term}
              <span class="related-term">&ldquo;{related.term}&rdquo;</span>
              <span class="related-count">{relatedResults.length}</span>
            {/if}
          </header>

          {#if !related.term}
            <p class="related-hint">
              Click a highlighted term in the document to find other documents
              that mention it.
            </p>
          {:else}
            <div class="related-tabs">
              <button class="related-tab" class:related-tab-active={related.tab === "scoped"} onclick={() => (related.tab = "scoped")}
                >In current results ({scopedHits.length})</button
              >
              <button class="related-tab" class:related-tab-active={related.tab === "all"} onclick={() => (related.tab = "all")}
                >All loaded ({allHits.length})</button
              >
            </div>

            <div class="related-body" use:related.action>
              {#if !relatedResults.length}
                <p class="related-empty">
                  No other documents mention &ldquo;{related.term}&rdquo;.
                </p>
              {:else}
                {#each relatedResults as r (r.hit.id || r.hit.file_name)}
                  <div class="related-result">
                    <button class="related-open" onclick={() => onOpenDoc?.(r.hit)}>
                      <span class="related-doc-title">{r.hit._title || "Untitled"}</span>
                      <span class="related-meta">
                        <span class="state-badge">{r.hit.state || "Unknown"}</span>
                        <span class="related-hits">{r.count} hit{r.count === 1 ? "" : "s"}</span>
                      </span>
                    </button>
                    {#each r.snippets as s}
                      <p class="related-snippet">{@html s}</p>
                    {/each}
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        </aside>
      </div>
    </div>
  </div>
{/if}

<style lang="postcss">
  @reference "../../../app.css";

  .bm-count {
    @apply text-[10px] font-mono font-bold px-1.5 rounded bg-black/10 text-black/50;
  }

  /* Modal shell */
  .modal-overlay {
    @apply fixed inset-0 z-50 flex items-center justify-center p-4;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(2px);
  }
  .modal {
    @apply flex flex-col bg-primaryLight border border-4 border-primaryDark/90 shadow-2xl overflow-hidden;
    width: 100%;
    max-height: 85vh;
  }
  .detail-modal {
    max-width: 1040px;
  }
  .bookmarks-modal {
    max-width: 420px;
  }

  /* Two sections: the document reader (left) + related documents (right). */
  .detail-split {
    @apply flex min-h-0 flex-1;
  }
  .reader-pane {
    @apply flex-[1.7] min-w-0;
  }
  .related-pane {
    @apply flex-1 min-w-0 flex flex-col overflow-hidden p-3 border-l border-primary/20 bg-black/[0.02];
  }
  .related-header {
    @apply flex items-center gap-2 mb-2 shrink-0;
  }
  .related-title {
    @apply text-[11px] font-bold uppercase tracking-wider text-black/50;
  }
  .related-term {
    @apply text-xs font-semibold text-black/80 truncate;
  }
  .related-count {
    @apply text-[10px] font-mono font-bold px-1.5 rounded bg-black/10 text-black/50;
  }
  .related-hint {
    @apply text-xs text-black/40 italic;
  }
  .related-tabs {
    @apply flex gap-1 mb-2 shrink-0;
  }
  .related-tab {
    @apply text-[11px] px-2 py-1 rounded border border-primary/20 bg-white/40 text-black/60 cursor-pointer transition hover:bg-primary/15;
  }
  .related-tab::after {
    content: "";
  }
  .related-tab-active {
    @apply bg-primary/30 text-black/90 font-semibold border-primary/40;
  }
  .related-body {
    @apply overflow-y-auto space-y-2 min-h-0;
  }
  .related-empty {
    @apply text-xs text-black/40 italic;
  }
  .related-result {
    @apply rounded-lg bg-white/50 border border-primary/15 p-2;
  }
  .related-open {
    @apply w-full text-left cursor-pointer bg-transparent border-0 p-0 mb-1;
  }
  .related-open::after {
    content: "";
  }
  .related-doc-title {
    @apply block text-[13px] font-semibold text-black/85 hover:underline;
  }
  .related-meta {
    @apply flex items-center gap-2 mt-0.5;
  }
  .related-hits {
    @apply text-[10px] font-mono text-black/40;
  }
  .related-snippet {
    @apply text-[12px] text-black/70 leading-relaxed border-l-2 border-primary/30 pl-2 whitespace-pre-wrap;
  }
  .reader-placeholder {
    @apply text-sm text-black/40 italic;
  }
  @media (max-width: 768px) {
    /* Stack the two sections and let the modal scroll as one column. */
    .detail-split {
      @apply flex-col overflow-y-auto;
    }
    .related-pane {
      @apply border-l-0 border-t;
    }
  }
  .modal-header {
    @apply flex items-center gap-2 p-3 border-b border-primary/20 shrink-0;
  }
  .modal-title {
    @apply flex-1 min-w-0 text-sm font-semibold text-black/90 truncate;
  }
  .modal-close {
    @apply shrink-0 px-2 py-1 rounded text-sm text-black/50 bg-white/40 hover:bg-red-100 hover:text-red-700 transition cursor-pointer border border-transparent;
  }
  .modal-close::after {
    content: "";
  }
  .modal-body {
    @apply overflow-y-auto p-4;
    min-height: 0;
  }

  /* Bookmarks list */
  .bm-empty {
    @apply text-xs text-black/40 italic;
  }
  .bm-list {
    @apply flex flex-col gap-1 m-0 p-0 list-none;
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

  /* Detail content */
  .detail-summary-label {
    @apply text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/30 text-black/60 shrink-0;
  }
  .detail-body {
    @apply text-black/80;
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
  .detail-header {
    @apply space-y-2 mb-4 pb-3 border-b border-primary/20;
  }
  .detail-title {
    @apply text-base font-bold text-black/90;
  }
  .doc-id-line {
    @apply text-[10px] text-black/40 mt-0.5;
  }

  /* Multi-topic membership chips */
  .doc-topics {
    @apply flex flex-col gap-1 mt-1;
  }
  .doc-topics-label {
    @apply text-[9px] font-bold uppercase tracking-wider text-black/40;
  }
  .doc-topics-chips {
    @apply flex flex-wrap gap-1;
  }
  .topic-chip {
    @apply flex items-center gap-1 text-[10px] text-black/60 bg-primary/15 border border-primary/25 rounded px-1.5 py-0.5;
  }
  .topic-chip-dom {
    @apply bg-primary/30 text-black/80 font-medium;
  }
  .topic-chip-pct {
    @apply font-mono font-bold text-[9px] text-black/45;
  }
  .doc-id-badge {
    @apply font-mono text-[10px] text-black/55 bg-black/5 px-1 py-0.5 rounded select-all break-all;
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
    @apply !text-[1em] prose text-black/80 border-l-[3px] border-primary/50 pl-3 py-1 my-2 whitespace-pre-wrap;
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
    @apply mt-3 border-t border-primary/20 pt-3 space-y-2;
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
