<script>
  import Footer from "$lib/components/Footer.svelte";
  import WarningDialog from "$lib/components/WarningDialog.svelte";

  import Title from "$lib/components/Title.svelte";

  let firstLoad = false;
</script>

<svelte:head>
  <title>Constitutional Observer</title>
</svelte:head>

{#if firstLoad}
  <WarningDialog />
{/if}
<main class="relative">
  <section class="relative z-20">
    <div class="relative md:absolute top-0 md:h-full md:top-[10%] z-20">
      <div
        class="md:sticky md:top-1/6 w-full md:w-1/2 lg:w-2/6 h-screen md:h-auto"
      >
        <Title />
      </div>
    </div>
    <figure class="relative md:absolute top-0 md:relative md:mx-[9%]">
      <figcaption
        class="absolute bottom-10 mr-2 right-0 text-black/60
z-10 drop-shadow-2xl border-2 border-primary bg-primaryLight/90 text-pretty w-full md:w-[40%] lg:w-[30%] p-5"
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
  </section>
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
    @apply p-5 text-black/60;
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
