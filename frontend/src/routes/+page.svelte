<script>
  import { fade } from "svelte/transition";
  import { onMount } from "svelte";

  import MainSearch from "../lib/components/MainSearch.svelte";
</script>

<main>
  <div class="relative h-screen">
    <div class="center-box">
      <h1 class="text-4xl pb-8">
        Welcome to the <br />Constitutional Discourses Observer
      </h1>
      <div class="text-pretty">
        What did the members of the Constituent Assembly debates think about
        something? How does the Lok Sabha talk about it now? How have they
        affected the nation? <p class="underline">Ask a question.</p>
      </div>
    </div>
  </div>
  <MainSearch />
</main>
<footer class="grid grid-cols-2">
  <div>
    This project is open source and will be made available publicly in the near
    future.
  </div>
  <div>
    This was co-created and inspired during the course of my undergraduate
    thesis project at Srishti Manipal, with the guidance of Abhishek Hazra.
  </div>
</footer>

<style lang="postcss">
  @import url("https://fonts.googleapis.com/css2?family=EB+Garamond&display=swap");

  main {
    @apply md:w-3/4 w-full mx-auto;
  }
  .title-bg {
    @apply sticky top-2  w-80 pt-4 mb-3 rounded text-2xl text-black font-bold bg-primaryLight;
  }

  .card {
    @apply rounded-md px-4 py-5 snap-y snap-center max-h-60 overflow-y-hidden my-5 text-sm;
  }

  .card-header {
    @apply text-lg font-bold pb-2;
  }

  .center-box {
    @apply absolute top-2/4 md:px-[15%] px-20  text-center;

    font-weight: 600;
    font-style: normal;
  }

  /* impor ta background image*/
  :global(body) {
    font-family: "EB Garamond", serif;
    background-image: url("/Constitution_of_India_preamble_2.webp");
    @apply bg-primaryLight md:bg-cover;
    background-position: center;
  }

  footer {
    @apply md:px-[10%] px-10 py-20 mt-20 text-black  backdrop-blur-3xl backdrop-opacity-50;
  }
</style>
