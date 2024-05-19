<script>
  import MainSearch from "$lib/components/MainSearch.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import WarningDialog from "$lib/components/WarningDialog.svelte";

  import Title from "$lib/components/Title.svelte";
  import Carousel from "$lib/components/Carousel.svelte";
  import { questions, images } from "$lib/text.js";
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

  // onMount(() => {
  //   highlightSpans();
  // });
</script>

<svelte:head>
  <title>Constitutional Observer</title>
</svelte:head>

<WarningDialog />

<main class="relative">
  <section class="relative">
    <div class="md:absolute top-0 h-full md:top-[10%]">
      <div
        class="md:sticky md:top-2/4 w-full md:w-2/6 md:-translate-y-2/4 h-screen md:h-auto z-20"
      >
        <div id="title">
          <Title />
        </div>
      </div>
    </div>
    <Carousel contents={images}></Carousel>
  </section>

  <!-- <section
    id="landing"
    class="text-left tracking-wide grid grid-cols-1 gap-x-2
   relative"
    bind:this={questionsDiv}
  >
    {#each questions as section}
      <div class="text-2xl md:text-2.5xl text-bold text-black/50 flex flex-col">
        <p class="px-2 leading-2 text-justify w-full leading-[4rem] my-0">
          {#each section as stanza}
            {#each stanza as p}
              <span class="pr-2 text-justify">{p}</span>
            {/each}
          {/each}
        </p>
      </div>
    {/each}
  </section> -->
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
    @apply px-[5%] md:px-[10%] md:mx-auto bg-fixed;

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
    @apply relative py-7 px-5 backdrop-opacity-50 bg-primaryLight/90;
  }
  #landing {
    @apply md:mx-auto px-[4%] md:px-[11%] md:py-5;
  }
</style>
