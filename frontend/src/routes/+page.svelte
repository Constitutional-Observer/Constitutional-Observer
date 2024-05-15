<script>
  import MainSearch from "$lib/components/MainSearch.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import WarningDialog from "$lib/components/WarningDialog.svelte";

  import Title from "$lib/components/Title.svelte";
  import { questions } from "$lib/text.js";
  import { onMount } from "svelte";

  let questionsDiv;

  // Randomly highlight spans in the questionsDiv

  function highlightSpans() {
    // Get all spans in the questionsDiv
    const spans = questionsDiv.querySelectorAll("span");

    // find 30 random spans
    const randomSpans = [];
    for (let i = 0; i < 70; i++) {
      const randomIndex = Math.floor(Math.random() * spans.length);
      randomSpans.push(spans[randomIndex]);
    }

    for (let i = 0; i < randomSpans.length; i++) {
      randomSpans[i].classList.add(
        "underline",
        "font-semibold",
        "decoration-2",
        "text-black/60"
      );
    }
  }

  onMount(() => {
    highlightSpans();
  });
</script>

<svelte:head>
  <title>Constitutional Observer</title>
</svelte:head>

<WarningDialog />

<section
  class="absolute top-[70%] md:top-[70%] left-1/2 translate-x-[-50%] translate-y-[-50%] mx-auto w-full md:w-auto md:w-2/7 text-bold z-20"
>
  <div id="title">
    <Title />
    <p class="relative text-center py-5">Scroll</p>
  </div>
</section>
<main class="relative">
  <section
    id="landing"
    class="text-left tracking-wide grid grid-cols-1 gap-x-2
   relative px-10"
    bind:this={questionsDiv}
  >
    {#each questions as section}
      <div class="text-xl md:text-2xl text-bold text-black/50 flex flex-col">
        <p
          class="leading-[1.8rem] text-justify w-full leading-[2.5rem] md:leading-[4rem] my-0"
        >
          {#each section as stanza}
            {#each stanza as p}
              <span class="pr-2 text-justify">{p}</span>
            {/each}
          {/each}
        </p>
      </div>
    {/each}
  </section>
  <section class="py-40">
    <MainSearch />
  </section>
</main>

<Footer />

<style lang="postcss">
  @import url("https://fonts.googleapis.com/css2?family=IM+Fell+English&display=swap");

  main {
    background-image: url("/Constitution_of_India_preamble_3.webp");
    background-repeat: no-repeat;
    background-position: center;
    background-size: cover;
    @apply px-[5%] md:px-[10%] md:mx-auto md:bg-fixed;

    background-position: center;
  }

  .card {
    @apply rounded-md px-4 py-5 snap-y snap-center max-h-60 overflow-y-hidden my-5 text-sm;
  }

  .card-header {
    @apply text-lg font-bold pb-2;
  }

  figcaption {
    @apply text-pretty  py-3 text-black/40;
  }
  .center-box {
    @apply absolute top-1/4 md:px-[15%] px-20  text-left w-full text-pretty w-[80%];

    font-weight: 600;
    font-style: normal;
  }

  :global(input[type="text"]) {
    @apply selection:bg-primary selection:text-black;
  }

  #title {
    @apply relative py-[20%] md:py-5 pt-8 backdrop-opacity-50 bg-primaryLight/100;

    border-radius: 10px;
    box-shadow:
      0 0px 4vw 4vw #f0e9da,
      inset 0 0 5vw 5vw #f0e9da;
  }

  #landing {
    @apply md:mx-auto px-[4%] md:px-[11%] md:py-5;
  }
</style>
