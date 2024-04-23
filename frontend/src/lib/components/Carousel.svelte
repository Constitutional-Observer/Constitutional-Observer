<script>
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

<section class="md:mx-[10%]">
  <div class=" p-4 grid grid-cols-[auto_1fr_auto] gap-4 items-center">
    <button
      type="button"
      class="btn-icon variant-filled bg-primary"
      on:click={carouselLeft}
    >
    </button>

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

    <button
      type="button"
      class="btn-icon variant-filled bg-primary"
      on:click={carouselRight}
    >
    </button>
  </div>
</section>
