<script>
  // One document card, three placements:
  //
  //   placed  pinned beside its marker in the projection
  //   float   following the cursor, for a document with no card of its own
  //   inline  in the flow, chrome-less, filling whatever box already frames it
  //
  // Every view renders this and nothing else, so the same document can never read
  // differently in two places. `inline` carries no background or border of its own
  // — it inherits the surface it sits on, which is how the lens popup keeps the
  // band's colour while still showing a real card.
  import { renderHighlight } from "$lib/highlight.js";
  import { docFormat } from "$lib/components/search/search-state.svelte.js";

  let {
    hit,
    idx = 0,
    subtitle = "",
    terms = [],
    /** @type {"placed" | "float" | "inline"} */
    variant = "placed",
    x = 0,
    y = 0,
    w = 196,
    h = 600,
    on = false,
    onopen,
    onenter,
    onleave,
  } = $props();

  let excerpt = $derived(docFormat.hitExcerpt(hit));
</script>

{#snippet body()}
  <div class="dc-title" title={subtitle}>{docFormat.hitTitle(hit, idx)}</div>
  {#if excerpt}
    <p class="dc-excerpt">{@html renderHighlight(excerpt, terms)}</p>
  {/if}
{/snippet}

{#if variant === "inline"}
  <div class="dc dc-inline">
    {@render body()}
  </div>
{:else if variant === "float"}
  <div class="dc dc-float" style="left: {x}px; top: {y}px; --card-w: {w}px;">
    {@render body()}
  </div>
{:else}
  <div
    class="dc dc-placed"
    class:dc-on={on}
    style="left: {x}px; top: {y}px; width: {w}px; height: {h}px;"
    role="button"
    tabindex="0"
    onmouseenter={onenter}
    onmouseleave={onleave}
    onclick={() => onopen?.()}
    onkeydown={(e) => { if (e.key === "Enter") onopen?.(); }}
  >
    {@render body()}
  </div>
{/if}

<style lang="postcss">
  @reference "../../../../app.css";

  .dc { @apply flex flex-col overflow-hidden text-left; }
  .dc-placed, .dc-float {
    @apply absolute bg-white/95 rounded-md shadow-sm;
    border: 1px solid rgba(0, 0, 0, 0.12);
  }
  /* No surface of its own: the box around it supplies one. */
  .dc-inline { @apply w-full; }
  .dc-placed { @apply z-10 cursor-pointer; }
  .dc-placed:hover, .dc-on { @apply bg-white shadow-lg z-30; border-color: #b8860b; }
  .dc-float {
    @apply z-40 pointer-events-none shadow-lg;
    width: var(--card-w, 196px); transform: translate(-50%, calc(-100% - 14px)); border-color: #b8860b;
  }

  .dc-title {
    @apply px-2 pt-1.5 pb-1 text-[1em] font-semibold capitalize text-black/80 leading-tight line-clamp-2 shrink-0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }
  .dc-inline .dc-title { border-bottom: none; }
  .dc-inline .dc-excerpt { @apply text-black/60; }
  /* The title takes the two lines it clamps to; the excerpt takes the rest. Both
     carried h-full before, which made each ask for the whole card and left flex
     to split the difference at 50/50 regardless of how tall the card is. */
  .dc-excerpt { @apply px-2 py-1 text-[0.82em] text-black/50 leading-snug line-clamp-5 flex-1 min-h-0 overflow-hidden; }
  .dc-excerpt :global(strong) {
    background: rgba(251, 191, 36, 0.45); border-radius: 2px; padding: 0 1px; font-weight: inherit;
  }

  @media (max-width: 768px) {
    .dc-float { width: min(var(--card-w, 196px), 84vw); }
  }
</style>
