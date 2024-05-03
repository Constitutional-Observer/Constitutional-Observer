<script>
  import MainSearch from "$lib/components/MainSearch.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import WarningDialog from "$lib/components/WarningDialog.svelte";

  import { text } from "$lib/text.js";
  import Carousel from "$lib/components/Carousel.svelte";
  import Title from "$lib/components/Title.svelte";
</script>

<WarningDialog />

<main class="relative">
  <section
    id="landing"
    class="text-left tracking-wide overflow-hidden grid grid-cols-2 md:grid-cols-4 grid-flow-row-dense gap-x-2
   relative"
  >
    <section
      class="absolute top-[10%] md:top-[55%] left-1/2 translate-x-[-50%] translate-y-[-50%] mx-auto w-2/3 md:2/7 text-bold"
    >
      <div id="title">
        <Title />
      </div>
      <p class="relative text-center">Scroll down</p>
    </section>

    {#each text as section}
      <div
        class="text-2xl md:text-2.5xl block text-pretty text-bold text-black/40 self-start"
      >
        {#each section as p}
          <p class="py-1">
            {p}
          </p>
        {/each}
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
    @apply relative py-5 backdrop-opacity-50 bg-primaryLight/100;

    border-radius: 10px;
    box-shadow:
      0 0px 4vw 4vw #f0e9da,
      inset 0 0 5vw 5vw #f0e9da;
  }

  #landing {
    @apply md:mx-auto px-[4%] md:px-[11%] md:py-5;
  }
</style>
