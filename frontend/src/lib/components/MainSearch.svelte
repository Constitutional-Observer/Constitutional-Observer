<script>
  import { query } from "$lib/stores";
  import SearchBox from "./SearchBox.svelte";

  let i = 0;
  let currentDisplay;
  // changing text
  let text = [
    "Who should the nation pray to?",
    "Where do our leaders come from?",
    "Who must the economy feed?",
  ];

  // change every 3 seconds
  setInterval(() => {
    i = (i + 1) % 3;
  }, 4000);

  $: currentDisplay = text[i];
</script>

<main class="landing px-[15%]">
  <div class="">
    <div class="text-2xl text-pretty">{currentDisplay}</div>
    <section class="v-parent">
      <small class="text-sm"
        >What are the arguments that have made India a Secular Republic? There
        are thoughts and arguments that have allowed the creation of what is
        modern India: They have come from the visions of the leaders of the
        Freedom struggle, and those who opposed those visions; These have come
        from those who wrote the Constitution and those who fought to change it.
        These continue to come from the visions of our elected leaders and from
        dissidents who fight for rights denied.</small
      >
    </section>
    <section class="h-parent">
      <!-- Central search-->
      <!-- <div id="blur" class="blur-lg center-box w-full !w-2/6 h-1/4 !bg-primary"></div> -->
      <form class="text-left" method="post" action="query?/query">
        <SearchBox></SearchBox>
      </form>
    </section>
  </div>
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
    @apply overflow-hidden  md:px-[15%];
    /* background-image: url("/inner_border_2.webp"); */
    /* 
    background-repeat: no-repeat;
    background-position: center; */
  }
</style>
