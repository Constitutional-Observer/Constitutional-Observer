<script>
  import { query } from "$lib/stores";
  import SearchBox from "./SearchBox.svelte";
</script>

<main class="landing px-[15%]">
  <h2 id="ask-a-question" class="text-5xl font-bold text-center py-5">
    Ask a question
  </h2>
  <div class="v-parent">
    <small class="text-2xl text-black/40"
      >What are the arguments that have made India a Secular Republic? There are
      thoughts and arguments that have allowed the creation of what is modern
      India: They have come from the visions of the leaders of the Freedom
      struggle, and those who opposed those visions; These have come from those
      who wrote the Constitution and those who fought to change it. These
      continue to come from the visions of our elected leaders and from
      dissidents who fight for rights denied.</small
    >
  </div>
  <section class="h-parent">
    <!-- Central search-->
    <!-- <div id="blur" class="blur-lg center-box w-full !w-2/6 h-1/4 !bg-primary"></div> -->
    <form class="text-left" method="post" action="ask/?/query">
      <SearchBox></SearchBox>
    </form>
  </section>
</main>

<!-- Central search-->

<style lang="postcss">
  .landing {
    @apply mx-auto md:justify-self-end text-center;
  }
  .v-parent {
    @apply overflow-hidden px-10 md:px-[15%] md:bg-contain text-justify;
    /* background-image: url("/inner_border_2.webp"); */

    background-repeat: no-repeat;
    background-position: center;
  }
  .h-parent {
    @apply overflow-hidden py-20;
    /* background-image: url("/inner_border_2.webp"); */
    /* 
    background-repeat: no-repeat;
    background-position: center; */
  }
</style>
