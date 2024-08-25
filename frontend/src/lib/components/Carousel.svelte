<script>
  import { onDestroy, onMount } from "svelte";

  let elemCarousel;
  let interval;
  let questionsDiv;

  // function carouselLeft() {
  //   const x =
  //     elemCarousel.scrollLeft === 0
  //       ? elemCarousel.clientWidth * elemCarousel.childElementCount // loop
  //       : elemCarousel.scrollLeft - elemCarousel.clientWidth; // step left
  //   elemCarousel.scroll({ left: x, top: 0, behavior: "smooth" });
  // }

  function carouselRight() {
    const x =
      elemCarousel.scrollLeft ===
      elemCarousel.scrollWidth - elemCarousel.clientWidth
        ? 0 // loop
        : elemCarousel.scrollLeft + elemCarousel.clientWidth; // step right
    elemCarousel.scroll({ left: x, top: 0, behavior: "smooth" });
  }

  // auto scroll every 5 seconds
  onMount(() => {
    interval = setInterval(carouselRight, 4000);
  });

  onDestroy(() => {
    clearInterval(interval);
  });

  // function highlightSpans() {
  //   // Get all spans in the questionsDiv
  //   const spans = questionsDiv.querySelectorAll("li");

  //   // find 30 random spans
  //   const randomSpans = [];
  //   for (let i = 0; i < 30; i++) {
  //     const randomIndex = Math.floor(Math.random() * spans.length);
  //     randomSpans.push(spans[randomIndex]);
  //   }

  //   for (let i = 0; i < randomSpans.length; i++) {
  //     randomSpans[i].classList.add(
  //       "underline",
  //       "font-semibold",
  //       "decoration-2",
  //       "text-black/60"
  //     );
  //   }
  // }

  // onMount(() => {
  //   highlightSpans();
  // });

  export let contents;
</script>

<section class="relative">
  <div class="relative">
    <div
      bind:this={elemCarousel}
      class="min-h-[40vh] flex flex-row text-black/50 flex overflow-hidden items-center snap-mandatory w-full"
    >
      {#if contents.type === "text"}
        <figcaption
          class="absolute
            top-2/4 right-0 z-10 drop-shadow-2xl border-2 border-primary bg-primaryLight/90 text-black/60 text-pretty w-full md:w-[80%] p-5"
        >
          <h2 class="text-xl pb-10">{@html contents.title}</h2>
          {@html contents.caption}
        </figcaption>
        <div
          class="snap-center max-w-none object-cover w-[1024px]"
          bind:this={questionsDiv}
        >
          {#each contents.text[0][0] as q}
            <span class="text-xl py-5">
              {q}
            </span>
          {/each}
        </div>
      {:else if contents.type === "textCarousel"}
        {#each contents.text as section}
          <ul class="block flex-none text-xl w-full">
            {#each section as subsection}
              {#each subsection as q}
                <li>{q}</li>
              {/each}
            {/each}
          </ul>
        {/each}
      {:else}
        {#each contents as element, index (element)}
          <figure class="relative h-screen w-full">
            <figcaption
              class="absolute {index % 2
                ? 'top-20  right-0'
                : 'top-2/4 right-0'} z-10 drop-shadow-2xl border-2 border-primary bg-primaryLight/90 text-black/60 text-pretty w-full md:w-[40%] p-5"
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
            {:else if element.type === "video"}
              <video
                class="max-w-none max-w-[50vw] w-[1024px] h-full"
                src={element.link}
                alt={element.caption}
                loading="lazy"
              />
            {:else if element.type === "text"}
              <div
                class="snap-center max-w-none p-20 object-cover w-[1024px] bg-primary overflow-y-hidden"
                bind:this={questionsDiv}
              >
                {#each element.text[0][0] as q}
                  <span class="text-sm py-5">
                    {q}
                  </span>
                {/each}
              </div>
            {/if}
          </figure>
        {/each}
        <button
          type="button"
          class="btn-icon absolute right-0 top-1/2 z-20 variant-filled bg-primary/90"
          on:click={carouselRight}
        >
        </button>
      {/if}
    </div>
  </div>
</section>

<style lang="postcss">
  ul > li {
    list-style-type: none;
    @apply pb-3;
    list-style-position: inside;
    padding-left: 1rem;
  }
</style>
