<script>
  // Level 1 — one cell per source index. Hovering a cell opens (and grows) it;
  // it closes on mouseleave of the grid. Clicking a topic inside a cell descends
  // to that topic's views.
  import DocList from "$lib/components/search/views/DocList.svelte";
  import { MIN_GROUP_DOCS } from "$lib/components/search/views/geo-groups.svelte.js";
  import { docFormat, viewNav } from "$lib/components/search/search-state.svelte.js";
  

  // `columns` is the wide-screen column count. It is a prop rather than a media
  // query because the grid now shares its row with the overview timeline — how
  // many cells fit depends on the half it was given, not on the viewport.
  let { geo, paginationDone = true, columns = 4, onselect, onopentopic } = $props();

  let openKey = $state(null);

  const topicLabel = (c) =>
    c.terms.slice(0, 3).map((t) => docFormat.humanTerm(t.term)).join(" · ");
</script>

{#snippet groupStatus(g)}
  {@const pl = g.pipeline}
  {#if g.count === 0}
    <span class="gm-cell-note">no results</span>
  {:else if g.count < MIN_GROUP_DOCS}
    <span class="gm-cell-note">too few to model</span>
    <DocList items={g.items} {onselect} />
  {:else if !paginationDone}
    <span class="gm-cell-note"><span class="gm-spin"></span>counting…</span>
  {:else if pl.topicCount === 0}
    <span class="gm-cell-note"><span class="gm-spin"></span>modelling…</span>
  {:else}
    <!-- count === 0 means no document clears the membership floor here. It still
         anchors the plot, but there is nothing to open. -->
    <div class="gm-cell-topics">
      {#each pl.clusters as c, ci (c.topic)}
        {#if c.count > 0}
          <button
            class="gm-cell-topic"
            class:gm-cell-topic-selected={viewNav.isTopic(g.key, ci)}
            title={`${c.count} docs`}
            onclick={() => onopentopic?.(g.key, ci)}
          >
            {topicLabel(c)}
          </button>
        {/if}
      {/each}
    </div>
  {/if}
{/snippet}

<div
  class="gm-grid-pane"
  class:gm-grid-pane-overflow={geo.overflowing}
  style="--gm-cols: {columns};"
  onmouseleave={() => (openKey = null)}
  role="presentation"
>
  {#each geo.cellGroups as g (g.key)}
    <div
      class="gm-cell"
      class:gm-cell-open={g.key === openKey}
      class:gm-cell-selected={viewNav.topic?.groupKey === g.key}
      title={`${g.label} · ${g.count} docs${g.annotation ? `\n\n${g.annotation}` : ""}`}
      onmouseenter={() => (openKey = g.key)}
      role="presentation"
    >
      <div class="gm-cell-head">
        <span class="gm-cell-name">{g.label}</span>
        <span class="gm-cell-count">{g.count}</span>
      </div>
      {@render groupStatus(g)}
    </div>
  {/each}

  {#if geo.overflowing}
    <div class="gm-accordion-col">
      <span class="gm-accordion-head">{geo.accordionGroups.length} more sources</span>
      <div class="gm-accordion-list">
        {#each geo.accordionGroups as g (g.key)}
          <details class="gm-accordion-item">
            <summary class="gm-accordion-summary">
              <span class="gm-accordion-label">{g.label}</span>
              <span class="gm-accordion-count">{g.count === 0 ? "no results" : g.count}</span>
            </summary>
            <div class="gm-accordion-body">
              {@render groupStatus(g)}
            </div>
          </details>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style lang="postcss">
  @reference "../../../../app.css";

  /* No height:100% — the parent grid stretches this item to its track already, and
     a percentage height here resolves against that track and lets content push it
     back out. min-h-0 is what allows it to be shorter than its cells and scroll. */
  .gm-grid-pane {
    @apply grid content-start gap-2 overflow-y-auto min-h-0 pb-16;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (min-width: 768px) {
    .gm-grid-pane { grid-template-columns: repeat(var(--gm-cols, 4), minmax(0, 1fr)); }
  }

  .gm-cell { @apply relative flex flex-col text-left p-1.5 transition-all overflow-hidden h-[160px] md:h-[200px] bg-white/50; border: 5px solid var(--borderDark); }
  .gm-cell:hover { @apply shadow-sm; border-color: rgba(139, 115, 85, 0.55); }
  .gm-cell-open { border-color: rgba(139, 115, 85, 0.8); transform: scale(1.02); z-index: 5; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22); }
  .gm-cell-selected { border-color: #b8860b !important; box-shadow: 0 0 0 2px rgba(184, 134, 11, 0.4); }

  .gm-accordion-col {
    @apply flex flex-col gap-1.5 overflow-y-auto min-h-0 min-w-0 rounded-md border border-primary/20 bg-white/40 p-1.5;
    /* -1 as a start line can't span backwards and falls into a new implicit
       column; "span 1 / -1" correctly lands in the real last column. */
    grid-column: span 1 / -1;
  }
  .gm-accordion-head { @apply text-[0.8em] font-bold uppercase tracking-wider text-black/40 px-0.5; }
  .gm-accordion-list { @apply flex flex-col gap-1 overflow-y-auto; }
  .gm-accordion-item { @apply rounded border border-primary/15 bg-white/60; }
  .gm-accordion-summary { @apply flex items-center justify-between gap-1 px-1.5 py-1 text-[10px] font-semibold text-black/70 cursor-pointer list-none; }
  .gm-accordion-summary::-webkit-details-marker { display: none; }
  .gm-accordion-count { @apply font-mono text-black/40 shrink-0; }
  .gm-accordion-body { @apply px-1.5 pb-1.5; }

  .gm-cell-head { @apply flex items-start justify-between gap-1 shrink-0; }
  .gm-cell-name { @apply text-[0.75em] text-black/80 leading-tight pb-2 line-clamp-2; }
  .gm-cell-count { @apply text-[12px] font-mono font-bold text-black/60 leading-none shrink-0; }
  .gm-cell-note { @apply flex items-center gap-1 text-[12px] text-black/40 italic; }

  .gm-cell-topics { @apply flex flex-col flex-1 min-h-0 gap-0.5 overflow-y-auto -mr-1 pr-1 ; }
  .gm-cell-topic {
    @apply text-left text-[1em] px-1 py-0.5 rounded cursor-pointer transition-colors shrink-0 ;
    @apply bg-white/50 text-black/65 hover:bg-white/90 hover:text-black/85;
    border: 1px solid transparent;
  }
  .gm-cell-topic-selected { @apply bg-white text-black/85 font-semibold; border-color: #b8860b; }

  @media (max-width: 768px) {
    .gm-accordion-col {
      grid-column: 1 / -1;
      grid-row: auto;
      max-height: 240px;
    }
  }
</style>
