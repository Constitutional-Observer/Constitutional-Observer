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
    "What can we dream?",
    "What should we read?",
    "What may the government know?",
    "What may the government say?",
    "Who are our future leaders?",
    "Who must we read?",
    "Who should our children pray to?",
    "What must our children read?",
    "What must our children do?",
    "Who may educate our children?",
    "What will our children learn?",
    "Who wrote our history?",
    "What language should our children speak?",
    "Where do we come from?",
    "What language can our children speak?",
    "What must our leaders speak?",
    "Where must our leaders come from?",
    "What will history talk about?",
    "Who do our children learn about?",
    "Who is precious to our history?",
    "Why is history precious?",
    "Why is history important?",
    "What will our children learn?",
    "What have children learnt before?",
    "Which children have learnt?",
    "Who decides which children learn?",
    "Who decides who learns what?",
    "Who is our family?",
    "Who should I marry?",
    "Who should I have children with?",
    "What may take care of us?",
    "What may gift peace to us?",
    "What must be heard?",
    "What must we answer?",
    "What is precious to us?",
    "What is precious to the state?",
    "Who do our leaders pray to?",
    "What do our leaders pray for?",
    "What is precious to the nation?",
    "What is precious to our leaders?",
  ];

  // change every 3 seconds
  setInterval(() => {
    i = (i + 1) % 3;
  }, 4000);

  $: currentDisplay = text[i];
</script>

<main class="landing px-[15%]">
  <!-- <div class="text-2xl text-pretty">{currentDisplay}</div> -->
  <div class="text-pretty text-justify py-10 text-xl text-black/40">
    {#each text as text}
      <span>{text} </span>
    {/each}
  </div>
  <h2 class="text-3xl font-bold text-center py-5">Ask a question</h2>
  <div class="v-parent">
    <small class="text-lg text-black/40"
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
    <form class="text-left" method="post" action="query?/query">
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
    @apply overflow-hidden  md:px-[15%];
    /* background-image: url("/inner_border_2.webp"); */
    /* 
    background-repeat: no-repeat;
    background-position: center; */
  }
</style>
