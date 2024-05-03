<script>
  import { onMount } from "svelte";

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

  // auto scroll every 5 seconds
  onMount(() => {
    setInterval(carouselLeft, 5000);
  });

  export let contents;
</script>

<section class="md:mx-[7%]">
  <div class="grid grid-cols-[auto_1fr_auto] gap-5 place-items-center">
    <div
      bind:this={elemCarousel}
      class="snap-x scroll-smooth text-black/50 flex overflow-x-hidden items-center w-full"
    >
      {#if contents.type === "text"}
        {#each contents.content as section}
          <div class="snap-center flex-none w-full">
            {#each section as p}
              <p class="text-5xl py-5">
                {p}
              </p>
            {/each}
          </div>
        {/each}
      {:else}
        <!-- <fig class="snap-center flex w-full h-full object-cover">
            <figcaption class="w-[40%] pr-10">
              {element.caption}
            </figcaption>
            {#if image.type === "image"}
              <img
                class=" col-span-4 max-w-[50vw] w-[1024px] h-full"
                src={element.link}
                alt={element.caption}
                loading="lazy"
              />
            {:else}
              <video
                class=" col-span-4 max-w-[50vw] w-[1024px] h-full"
                src={element.link}
                alt={element.caption}
                loading="lazy"
              />
            {/if}
          </fig> -->
      {/if}
    </div>

    <button
      type="button"
      class="btn-icon variant-filled bg-primary/40"
      on:click={carouselRight}
    >
    </button>
  </div>
</section>
