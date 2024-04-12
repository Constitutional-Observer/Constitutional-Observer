<script>
  import { fade } from "svelte/transition";
  import { onMount } from "svelte";

  import MainSearch from "../lib/components/MainSearch.svelte";
  let elemCarousel;

  function carouselLeft() {
    const x =
      elemCarousel.scrollLeft === 0
        ? elemCarousel.clientWidth * elemCarousel.childElementCount // loop
        : elemCarousel.scrollLeft - elemCarousel.clientWidth; // step left
    elemCarousel.scroll(x, 0);
  }

  function carouselRight() {
    const x =
      elemCarousel.scrollLeft ===
      elemCarousel.scrollWidth - elemCarousel.clientWidth
        ? 0 // loop
        : elemCarousel.scrollLeft + elemCarousel.clientWidth; // step right
    elemCarousel.scroll(x, 0);
  }

  let images = [
    {
      link: "/stage1-1.jpeg",
      type: "image",
      caption:
        "On 13 December 1946, the Constituent Assembly formally commenced its task of framing the Constitution of India. Jawaharlal Nehru moved the Objectives Resolution, which aimed to declare India as an Independent Sovereign Republic and create a Constitution to govern its future. The Resolution established general principles to guide the work of the Constituent Assembly. On January 22, 1947, the Constituent Assembly adopted the Resolution",
    },
    {
      link: "/loksabha-fight.jpeg",
      type: "image",
      caption:
        "The Lok Sabha, constitutionally the House of the People, is the lower house of India's bicameral Parliament, with the upper house being the Rajya Sabha. Members of the Lok Sabha are elected by an adult universal suffrage and a first-past-the-post system to represent their respective constituencies, and they hold their seats for five years or until the body is dissolved by the President on the advice of the council of ministers. The house meets in the Lok Sabha Chambers of the Parliament House, New Delhi. ",
    },
    { link: "/stage1-1.jpeg", type: "image", caption: "Constituent Assembly" },
  ];
</script>

<main>
  <section class="relative">
    <div class="md:px-[15%] pt-[20vh] mb-20 text-black/70">
      <p class="">Welcome to the</p>

      <h1 class="text-5xl pb-8">Constitutional Discourses Observer</h1>
      <div class="text-pretty text-xl">
        What did the members of the Constituent Assembly debate about? How does
        the Lok Sabha talk about it now? How have they affected the collective
        lives of the nation? <p class="underline">Ask a question.</p>
      </div>
    </div>
  </section>
  <section class="md:mx-[10%]">
    <div class=" p-4 grid grid-cols-[auto_1fr_auto] gap-4 items-center">
      <!-- Button: Left -->
      <button
        type="button"
        class="btn-icon variant-filled bg-primary"
        on:click={carouselLeft}
      >
        <!-- <i class="fa-solid fa-arrow-left" /> -->
      </button>
      <!-- Full Images -->
      <div
        bind:this={elemCarousel}
        class="snap-x snap-mandatory w-full scroll-smooth flex overflow-x-auto"
      >
        {#each images as image}
          <fig class="snap-center flex w-full h-full object-cover">
            <figcaption class="w-[40%] pr-10">
              {image.caption}
            </figcaption>
            {#if image.type === "image"}
              <img
                class=" col-span-4 max-w-[50vw] w-[1024px] h-full"
                src={image.link}
                alt={image.caption}
                loading="lazy"
              />
            {:else}
              <video
                class=" col-span-4 max-w-[50vw] w-[1024px] h-full"
                src={image.link}
                alt={image.caption}
                loading="lazy"
              />
            {/if}
          </fig>
        {/each}
      </div>
      <!-- Button: Right -->
      <button
        type="button"
        class="btn-icon variant-filled bg-primary"
        on:click={carouselRight}
      >
        <!-- <i class="fa-solid fa-arrow-right" /> -->
      </button>
    </div>
  </section>
  <MainSearch />
</main>
<footer class="grid grid-cols-3">
  <div>
    This project is open source and will be made available publicly in the near
    future.
  </div>
  <div></div>
  <div>
    This was co-created and inspired during the course of my undergraduate
    thesis project at Srishti Manipal, with the guidance of Abhishek Hazra.
  </div>
</footer>

<style lang="postcss">
  @import url("https://fonts.googleapis.com/css2?family=IM+Fell+English&display=swap");

  main {
    @apply md:w-3/4 w-full mx-auto;
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

  /* impor ta background image*/
  :global(body) {
    font-family: "IM Fell English", serif;
    background-image: url("/Constitution_of_India_preamble_3.webp");
    @apply bg-primaryLight w-screen bg-fixed md:bg-cover;
    background-position: center;
    background-repeat: repeat-y;
  }

  footer {
    @apply md:px-[10%] px-10 py-20 mt-20 text-black/60 bg-primaryLight backdrop-blur-3xl backdrop-opacity-50;
  }
</style>
