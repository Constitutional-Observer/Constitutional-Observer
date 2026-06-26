<script>
  import WarningDialog from "$lib/components/general/WarningDialog.svelte";
  import Title from "$lib/components/general/Title.svelte";
  import SearchApp from "$lib/components/search/SearchApp.svelte";
  import { goto } from "$app/navigation";
  import { tick } from "svelte";
  import {themes} from "$lib/data/text.js";

  let { data } = $props();

  let firstLoad = false;

  function slowScrollTo(el, duration = 3000) {
    const start = window.scrollY;
    const target = el.getBoundingClientRect().top + window.scrollY;
    const distance = target - start;
    let t0 = null;

    // ease-in-out cubic
    const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

    function step(ts) {
      if (!t0) t0 = ts;
      const progress = Math.min((ts - t0) / duration, 1);
      window.scrollTo(0, start + distance * ease(progress));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  async function searchTheme(theme) {
    // Re-run the home SSR load with the theme's query, then scroll the inline
    // search section into view.
    await goto(`/?query=${encodeURIComponent(theme.query)}`, {
      invalidateAll: true,
      noScroll: true,
      keepFocus: true,
    });
    await tick();
    const el = document.getElementById("ask-section");
    if (el) slowScrollTo(el, 1800);
  }
</script>

<svelte:head>
  <title>Constitutional Observer</title>
  <meta
    name="description"
    content="The Constitutional Observer provides a comparative interface to understand current and past parliamentry discourse in India. Search with a question, and get related discussions in the Lok Sabha and the Constituent Assembly"
  />
  <meta
    name="keywords"
    content="Lok Sabha, Constituent Assembly, Indian Constitution, Politics, Contemporary, Comparative studies"
  />
</svelte:head>

{#if firstLoad}
  <WarningDialog />
{/if}
<main class="">
  <!-- Theme cards tile the whole page -->
  <section class="theme-grid h-screen">
    {#each themes as theme}
      <button
        class="theme-card"
        style="background-image: url(/{theme.image})"
        onclick={() => searchTheme(theme)}
      >
        <div class="theme-card-overlay">
          <div class="theme-card-terms">
            {#each theme.terms as term}
              <span class="theme-term">{term}</span>
            {/each}
          </div>
          <h3 class="theme-card-title">{theme.title}</h3>
        </div>
      </button>
    {/each}
  </section>

  <section class="title-box">
    <Title />
  </section>

  <section id="ask-section" class="relative">
    <SearchApp {data} basePath="/" />
  </section>
</main>


<style lang="postcss">
  .theme-grid {
    @apply grid gap-0;
    /* Tile the whole viewport: columns fill in, rows share the height. */
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    grid-template-rows: repeat(3, 1fr);
  }

  .title-box {
    @apply absolute z-20 flex items-center justify-center p-4;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(90vw, 640px);
  }

  .theme-card {
    @apply relative bg-cover bg-center overflow-hidden cursor-pointer border-0 p-0 text-left;
    background-repeat: no-repeat;
    transition: filter 0.2s;
  }
  .theme-card:hover {
    filter: brightness(1.12);
  }
  .theme-card:hover .theme-card-overlay {
    background: linear-gradient(
      to top,
      rgba(0, 0, 0, 0.88),
      rgba(0, 0, 0, 0.2)
    );
  }
  .theme-card:hover .theme-term {
    opacity: 1;
  }

  .theme-card-overlay,
  .exploration-card-overlay {
    @apply absolute inset-0 flex flex-col justify-end gap-1 p-4 text-white;
    background: linear-gradient(
      to top,
      rgba(0, 0, 0, 0.75),
      rgba(0, 0, 0, 0.1)
    );
  }

  .exploration-card {
    @apply relative w-full my-2 h-[200px] overflow-hidden border-4 border-solid border-primary;
    @apply bg-cover bg-center bg-no-repeat;
  }

  .theme-card-title {
    @apply text-sm font-bold leading-tight capitalize mt-1.5;
  }

  .theme-card-terms {
    @apply flex flex-wrap gap-1;
  }

  .theme-term {
    @apply text-[9px] px-1.5 py-0.5 rounded-full bg-white/20 text-white/80 font-mono backdrop-blur-sm;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  :global(input[type="text"]) {
    @apply selection:bg-primary selection:text-black selection:font-bold;
  }
</style>
