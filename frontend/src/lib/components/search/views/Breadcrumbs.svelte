<script>
  // Presentational. The whole trail is always rendered, so the levels that exist
  // are visible before you have reached them: a node you cannot go to yet is greyed
  // rather than absent.
  //
  // One line per node, `›` between, wrapping when the column is narrow — the shape
  // is what makes it read as a trail. Each node's detail goes in the title rather
  // than under the label, because a second line turns the row into a list.
  let { trail = [], onnavigate } = $props();

  /** @param {{ label: string, sub?: string }} n */
  const tip = (n) => (n.sub ? `${n.label} — ${n.sub}` : n.label);
</script>

<nav class="bc" aria-label="Result hierarchy">
  {#each trail as node, i (node.key)}
    {#if i > 0}<span class="bc-sep" aria-hidden="true">›</span>{/if}
    {#if node.current}
      <span class="bc-node bc-here" aria-current="page" title={tip(node)}>{node.label}</span>
    {:else if node.disabled}
      <span class="bc-node bc-off" aria-disabled="true">{node.label}</span>
    {:else if node.plain}
      <!-- Reached, but not a view of its own — a step in the path, not a link. -->
      <span class="bc-node bc-plain" title={tip(node)}>{node.label}</span>
    {:else}
      <button class="bc-node bc-up" title={tip(node)} onclick={() => onnavigate?.(node.key)}>
        {node.label}
      </button>
    {/if}
  {/each}
</nav>

<style lang="postcss">
  @reference "../../../../app.css";

  .bc { @apply flex flex-wrap items-center gap-x-1 gap-y-0.5 min-w-0; }
  .bc-sep { @apply text-[13px] leading-none text-black/30 shrink-0; }
  .bc-node {
    @apply text-[12px] leading-tight truncate max-w-[24ch];
    background: none; border: none; padding: 0;
  }

  .bc-up { @apply cursor-pointer text-black/55 transition-colors; }
  .bc-up:hover { @apply text-black/85 underline; }
  .bc-up::after { content: ""; }

  .bc-off { @apply text-black/30 italic; }
  .bc-plain { @apply text-black/55; }

  .bc-here {
    @apply font-bold text-black/85;
    border-bottom: 2px solid #b8860b;
  }
</style>
