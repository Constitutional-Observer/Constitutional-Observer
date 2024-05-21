<script>
  import MainSearch from "$lib/components/MainSearch.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import WarningDialog from "$lib/components/WarningDialog.svelte";

  import Title from "$lib/components/Title.svelte";
  import Carousel from "$lib/components/Carousel.svelte";
  import { questions, images } from "$lib/text.js";
</script>

<svelte:head>
  <title>Constitutional Observer</title>
</svelte:head>

<WarningDialog />

<main class="relative">
  <section class="relative z-20">
    <div class="md:absolute top-0 md:h-full md:top-[10%] z-20">
      <div
        class="md:sticky md:top-1/6 w-full md:w-1/2 lg:w-2/6 h-screen md:h-auto"
      >
        <Title />
      </div>
    </div>
    <figure class="absolute top-0 md:relative md:mx-[9%]">
      <figcaption
        class="absolute top-2/4 mr-2 right-0
} z-10 drop-shadow-2xl border-2 border-primary bg-primaryLight/90 text-black/80 text-pretty w-full md:w-[40%] lg:w-[30%] p-5"
      >
        On 13 December 1946, the Constituent Assembly formally commenced its
        task of framing the Constitution of India. Jawaharlal Nehru moved the
        Objectives Resolution, which aimed to declare India as an Independent
        Sovereign Republic and create a Constitution to govern its future. On
        January 26, 1950, the Constituent Assembly adopted the Constitution of
        India
      </figcaption>
      <img
        src="/stage1-1.jpeg"
        class="w-full h-screen object-cover brightness-[70%] saturate-50 overflow-hidden"
        alt="stage1"
        loading="lazy"
      />
    </figure>
    <!-- <Carousel contents={images[0]}></Carousel> -->
  </section>

  <!-- <section
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
  </section> -->
  <!-- <section class="py-40">
    <MainSearch />
  </section> -->
</main>

<Footer />

<style lang="postcss">
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

  #landing {
    @apply md:mx-auto px-[4%] md:px-[11%] md:py-5;
  }
</style>
