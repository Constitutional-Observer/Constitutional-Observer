<script>
  import { onMount } from "svelte";

  let elemCarousel;

  function carouselLeft() {
    const x =
      elemCarousel.scrollLeft === 0
        ? elemCarousel.clientWidth * elemCarousel.childElementCount // loop
        : elemCarousel.scrollLeft - elemCarousel.clientWidth; // step left
    elemCarousel.scroll({ left: x, top: 0, behavior: "smooth" });
  }

  function carouselRight() {
    const x =
      elemCarousel.scrollLeft ===
      elemCarousel.scrollWidth - elemCarousel.clientWidth
        ? 0 // loop
        : elemCarousel.scrollLeft + elemCarousel.clientWidth; // step right
    elemCarousel.scroll({ left: x, top: 0, behavior: "smooth" });
  }

  // // auto scroll every 5 seconds
  // onMount(() => {
  //   setInterval(carouselRight, 5000);
  // });

  export let contents;
</script>

<section class="md:mx-[9%]">
  <div class="relative">
    <div
      bind:this={elemCarousel}
      class="snap-x h-auto flex flex-col scroll-smooth text-black/50 flex overflow-x-hidden items-center w-full"
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
        {#each contents as element, index (element)}
          <fig class="relative h-screen w-full snap-center snap-y">
            <!--  -->
            <figcaption
              class="absolute right-0 {index % 2
                ? 'top-20'
                : 'bottom-20'} z-10 bg-primaryLight/90 text-pretty w-full md:w-[40%] p-10"
            >
              <h2 class="text-2xl pb-10">{@html element.title}</h2>
              {@html element.caption}
            </figcaption>
            {#if element.type === "image"}
              <img
                class="max-w-none h-[50vh] md:h-screen object-cover brightness-[70%] saturate-50 overflow-hidden"
                src={element.link}
                alt={element.caption}
                loading="lazy"
              />
            {:else}
              <video
                class="max-w-none col-span-4 max-w-[50vw] w-[1024px] h-full"
                src={element.link}
                alt={element.caption}
                loading="lazy"
              />
            {/if}
          </fig>
        {/each}
      {/if}
    </div>
    <!-- 
    <button
      type="button"
      class="btn-icon absolute right-0 top-1/2 z-20 variant-filled bg-primary/90"
      on:click={carouselRight}
    >
    </button> -->
  </div>
</section>
