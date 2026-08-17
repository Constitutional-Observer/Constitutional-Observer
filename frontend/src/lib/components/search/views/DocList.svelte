<script>
  // Flat list of document titles. The fallback whenever a view cannot plot: a
  // group too small to model, a topic with no dated documents, a pane too narrow
  // to hold a projection.
  import { docFormat } from "$lib/components/search/search-state.svelte.js";

  // Accepts hits, or cluster items ({ hit, idx }).
  let { items = [], onselect } = $props();

  const hitOf = (it) => it?.hit ?? it;
</script>

<div class="dl">
  {#each items as it, i (it.j ?? it.id ?? i)}
    {@const hit = hitOf(it)}
    <button class="dl-item" onclick={() => onselect?.(hit)}>
      {docFormat.hitTitle(hit, it.idx ?? i)}
    </button>
  {/each}
</div>

<style lang="postcss">
  @reference "../../../../app.css";

  .dl { @apply flex flex-col flex-1 min-h-0 gap-0.5 overflow-y-auto -mr-1 pr-1; }
  .dl-item {
    @apply text-left text-[0.85em] leading-tight px-1 py-0.5 rounded cursor-pointer transition-colors shrink-0 truncate;
    @apply bg-white/40 text-black/60 hover:bg-white/90 hover:text-black/85;
    border: 1px solid transparent;
  }
</style>
