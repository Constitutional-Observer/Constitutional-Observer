<script>
  import { searchBox, topicTerms } from "$lib/components/search/search-state.svelte.js";

  let { query = "", searching = false, onsearch } = $props();

  const LIMIT = 20;

  let ranked = $derived(topicTerms.ranked);
  let shown = $derived(ranked.slice(0, LIMIT));
  let top = $derived(ranked[0]?.docs || 1);

  const phrase = (t) => t.term.replace(/_/g, " ");
  const inQuery = (t) => query.toLowerCase().includes(phrase(t).toLowerCase());

  function tier(t) {
    const share = t.docs / top;
    return share >= 0.6 ? "term-lg" : share >= 0.25 ? "term-md" : "term-sm";
  }

  function hint(t) {
    const src = t.sources.slice(0, 4).join(", ");
    const rest = t.sources.length > 4 ? ` +${t.sources.length - 4} more` : "";
    return `${t.docs} document${t.docs === 1 ? "" : "s"} · ${t.topics} topic${t.topics === 1 ? "" : "s"} · ${src}${rest}`;
  }

  function run(next) {
    searchBox.query = next;
    onsearch?.();
  }
  function search(t) {
    run(phrase(t));
  }
  function refine(t) {
    if (inQuery(t)) return;
    run(query ? `${query} ${phrase(t)}` : phrase(t));
  }
</script>

<aside class="term-rail">
  <section class="term-box">
    <h3 class="term-title">Frequently appearing terms</h3>
    {#if ranked.length}
      <p class="term-sub">
        {#if ranked.length > shown.length}Top {shown.length} of {ranked.length}{:else}{ranked.length}{/if}
        phrases across {topicTerms.topics} topics in {topicTerms.sources}
        {topicTerms.sources === 1 ? "source" : "sources"}
      </p>

      <div class="term-cloud">
        {#each shown as t (t.term)}
          <span class="term-chip {tier(t)}" class:term-chip-on={inQuery(t)}>
            <button
              class="term-go"
              title={hint(t)}
              disabled={searching}
              onclick={() => search(t)}
            >
              {t.label}<span class="term-count">{t.docs}</span>
            </button>
            {#if query && !inQuery(t)}
              <button
                class="term-add"
                title={`Add “${phrase(t)}” to the current search`}
                disabled={searching}
                onclick={() => refine(t)}>+</button
              >
            {/if}
          </span>
        {/each}
      </div>

      <p class="term-foot">
        Phrases the topic model merged as one word. Click to search it on its own;
        <span class="term-foot-key">+</span> narrows the search you already made.
      </p>
    {:else}
      <p class="term-empty">
        {#if topicTerms.topics}
          No multi-word phrase recurs often enough in these results to suggest.
          Single words are left out — on their own they are rarely a search worth
          making.
        {:else if query}
          Reading the topics out of these results…
        {:else}
          Search, and the phrases the topic model finds across every source
          collect here as further things to look for.
        {/if}
      </p>
    {/if}
  </section>
</aside>

<style lang="postcss">
  @reference "../../../app.css";

  .term-rail {
    @apply sticky top-[6%] self-start max-h-[88vh] overflow-y-auto z-20;
  }
  .term-box {
    @apply relative py-3 md:py-5 px-2 md:px-4 bg-primaryLight/90 backdrop-opacity-50 drop-shadow-xl border-4 border-primary;
  }

  .term-title {
    @apply text-[11px] font-bold uppercase tracking-wider text-black/60;
  }
  .term-sub {
    @apply text-[10px] text-black/40 mt-0.5 leading-snug;
  }

  .term-cloud {
    @apply flex flex-wrap items-start gap-1 mt-3;
  }
  .term-chip {
    @apply inline-flex items-stretch rounded border border-primary/30 bg-white/60 overflow-hidden transition-colors;
  }
  .term-chip:hover {
    @apply bg-primary/20 border-primary;
  }
  .term-chip-on {
    @apply bg-primary/40 border-primary;
  }
  .term-go {
    @apply px-1.5 py-0.5 text-left leading-tight text-black/70 cursor-pointer;
  }
  .term-go::after {
    content: "";
  }
  .term-go:disabled {
    @apply cursor-default opacity-50;
  }
  .term-count {
    @apply ml-1 text-[9px] font-mono text-black/35 align-super;
  }
  .term-add {
    @apply px-1 text-[11px] leading-none text-black/40 cursor-pointer border-l border-primary/25;
    @apply hover:bg-primary/40 hover:text-black/80;
  }
  .term-add::after {
    content: "";
  }

  .term-lg .term-go {
    @apply text-[13px] font-semibold text-black/85;
  }
  .term-md .term-go {
    @apply text-[11px];
  }
  .term-sm .term-go {
    @apply text-[10px] text-black/55;
  }

  .term-foot {
    @apply mt-2 pt-2 border-t border-primary/20 text-[9px] text-black/35 leading-snug;
  }
  .term-foot-key {
    @apply font-mono font-bold text-black/50;
  }
  .term-empty {
    @apply mt-2 text-[11px] text-black/40 italic leading-snug;
  }

  @media (max-width: 768px) {
    .term-rail {
      position: static;
      width: 100%;
      max-height: none;
    }
  }
</style>
