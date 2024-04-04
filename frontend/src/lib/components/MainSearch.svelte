<script>
  import { query } from "$lib/stores";
  import SearchBox from "./SearchBox.svelte";
</script>

<!-- Central search-->
<!-- <div id="blur" class="blur-lg center-box w-full !w-2/6 h-1/4 !bg-primary"></div> -->
<form class="center-box text-left py-20" method="post" action="?/query">
  <div class=" text-3xl">
    Who should the nation pray to? <br />
    Where do our leaders come from? <br />
    Who must the economy feed?
  </div>
  What are the arguments that have made India a Secular Republic? There are thoughts
  and arguments that have allowed the creation of what is modern India: They have
  come from the visions of the leaders of the Freedom struggle, and those who opposed
  those visions; These have come from those who wrote the Constitution and those
  who fought to change it. These continue to come from the visions of our elected
  leaders and from dissidents who fight for rights denied.
  <!-- <h1 class="text-4xl pb-8">
    Welcome to the Constitutional Discourses Observer
  </h1>
  <div class="text-pretty">
    What did the members of the Constituent Assembly debates think about
    something? How does the Lok Sabha talk about it now? How have they affected
    the nation? <p class="underline">Ask a question.</p>
  </div> -->
  <SearchBox></SearchBox>
</form>

<!-- Central search-->

<style lang="postcss">
  .center-box {
    @apply fixed top-2/4 left-1/2 -translate-x-1/2 -translate-y-1/4  rounded p-4 w-2/4;
  }
</style>
