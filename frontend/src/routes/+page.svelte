<script>
  import { fly } from "svelte/transition";
  import { fade } from "svelte/transition";
  import { text1, text2 } from "$lib/text.js";

  import MainSearch from "$lib/components/MainSearch.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { onMount } from "svelte";

  // for lyrical divs
  let idx1 = 0;
  let idx2 = 0;

  let dialog;

  setInterval(() => {
    idx1 = (idx1 + 10) % text1.length;
    idx2 = (idx2 + 10) % text2.length;
  }, 5000);

  onMount(() => {
    dialog.showModal();
  });
</script>

<dialog
  bind:this={dialog}
  on:close={() => (dialog = false)}
  class="bg-primary rounded-xl w-full md:w-1/4 shadow-2xl backdrop:bg-black/20 backdrop:backdrop-blur-sm"
>
  <h1 class="p-5 text-2xl">Disclaimer</h1>
  <div class="pl-5 pr-10 py-3">
    Alpha version disclaimer: You have probably received this link for review.
    As this is a work in progress, please note: layout and interactive features
    are subject to change. The search results may not be accurate.

    <br /><br />
    <i
      >This project is open to critical feedback and suggestions. Please email
      at adhavan.sivaraj16@gmail.com with "Constitutional-Observer" as the
      subject line</i
    >

    <div>
      <button
        class="p-3 my-5 bg-primaryLight rounded-lg"
        on:click={() => dialog.close()}>Close</button
      >
    </div>
  </div>
</dialog>

<main class="relative">
  <section class="relative">
    <div class="px-10 md:px-[10%] pt-[15vh] mb-20 text-black/70 w-5/6">
      <p class="text-2xl">Welcome to the</p>

      <h1 class="text-7xl pb-8">Constitutional <br />Discourses Observer</h1>
      <div class="text-pretty text-2xl">
        What did the members of the Constituent Assembly debate about? How does
        the Lok Sabha talk about it now? How have they affected the collective
        lives of the nation?
        <br />
        <a href="/#ask-a-question" class="underline">Ask a question.</a>
        <a href="/about" class="underline">Learn more.</a>
      </div>
    </div>
  </section>

  <section
    class="px-10 text-left tracking-wide py-20 md:px-[20%] max-h-screen overflow-hidden text-2xl md:text-4xl"
  >
    <div class="pb-20 max-h-[50vh]">
      {#each text1.slice(idx1, idx1 + 5) as text (text)}
        <div
          class="text-black/50 py-5"
          in:fly|global={{ y: 10, duration: 1000 }}
          out:fade|global
        >
          {text}
        </div>
      {/each}
    </div>

    <div class="max-h-[50vh]">
      {#each text2.slice(idx2, idx2 + 5) as text (text)}
        <div
          class="text-black/50 py-5"
          in:fly|global={{ y: 10, duration: 1000 }}
          out:fade|global
        >
          {text}
        </div>
      {/each}
    </div>
  </section>

  <section class="py-40">
    <MainSearch />
  </section>
</main>

<Footer />

<style lang="postcss">
  @import url("https://fonts.googleapis.com/css2?family=IM+Fell+English&display=swap");

  main {
    @apply md:w-3/4 w-full md:px-[15%];
    background-image: url("/Constitution_of_India_preamble_3.webp");
    @apply w-screen bg-fixed md:bg-cover;
    background-position: center;
    background-repeat: repeat-y;
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
</style>
