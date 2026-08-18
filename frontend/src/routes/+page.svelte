<script>
  import WarningDialog from "$lib/components/general/WarningDialog.svelte";
  import Title from "$lib/components/general/Title.svelte";
  import SearchApp from "$lib/components/search/SearchApp.svelte";
  import { goto } from "$app/navigation";
  import {thematicQuestions} from "$lib/data/text.js";
  import { searchBox } from "$lib/components/search/search-state.svelte.js";

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

  function searchQuery(query) {
    searchBox.query = query;
        goto(`/?query=${encodeURIComponent(query)}`, {
      invalidateAll: true,
      noScroll: true,
      keepFocus: true,
    });
    const el = document.getElementById("ask-section");
    if (el) slowScrollTo(el, 1800);


  }

  function searchTheme(theme) {
    searchQuery(theme.query);
  }

  // Scatter the thematic questions at random positions within the viewport,
  // keeping clear of the centred title box and not overlapping each other.
  // Each box is sized in vw/vh; we retry until it fits. Computed once on load.
  const BOX_W = 26; // vw, matches max-width of a question
  const BOX_H = 14; // vh, allows for up to ~3 wrapped lines
  const TITLE = { top: 35, left: 20, bottom: 65, right: 70 }; // centred title zone

  function overlaps(a, b) {
    return (
      a.left < b.right &&
      a.right > b.left &&
      a.top < b.bottom &&
      a.bottom > b.top
    );
  }

  // Surface a random handful so the viewport doesn't get crowded.
  const SHOW =5;
  const sample = [...thematicQuestions]
    .sort(() => Math.random() - 0.5)
    .slice(0, SHOW);

  const placed = [];
  const scattered = sample.map((q) => {
    let box;
    for (let i = 0; i < 200; i++) {
      const top = 6 + Math.random() * (88 - BOX_H); // vh, padded from edges
      const left = 4 + Math.random() * (92 - BOX_W); // vw
      box = { top, left, bottom: top + BOX_H, right: left + BOX_W };
      const clashes =
        overlaps(box, TITLE) || placed.some((p) => overlaps(box, p));
      if (!clashes) break;
    }
    placed.push(box);
    return { ...q, top: box.top, left: box.left };
  });
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
  <!-- Thematic questions scattered randomly across the viewport -->
  <section class="scatter-box h-screen">
    {#each scattered as q}
      <button
        class="scatter-question"
        style="top: {q.top}vh; left: {q.left}vw"
        onclick={() => searchQuery(q.query)}
      >
        {q.question}
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
  @reference "../app.css";
  .scatter-box {
    @apply relative w-full overflow-hidden;
    background-image: url("/stage1-1.jpeg");
    background-repeat: no-repeat;
    background-size: cover;
    background-position-y: bottom;
    filter: sepia(5%) blur(0.5px) saturate(20%) ;
  }

  .scatter-question {
    @apply absolute cursor-pointer border-0 bg-primaryLight opacity-100 px-1 text-left drop-shadow-lg;
    @apply text-base md:text-lg font-medium text-balance;
    max-width: 26vw;
    transition: color 0.2s, transform 0.2s;
  }
  .scatter-question:hover {
    color: #c3b091;
    transform: scale(1.05);
    filter: blur(0px)
  }

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
    @apply relative w-full my-2 h-[200px] overflow-hidden border-4 border-solid;
    border-color: #c3b091;
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

  :global(input[type="text"])::selection {
    background-color: #c3b091;
    @apply text-black font-bold;
  }
</style>
