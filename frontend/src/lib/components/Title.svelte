<script>
  import { query } from "$lib/stores";
  import { questions } from "$lib/text.js";
  import { onMount } from "svelte";

  let refreshIntervalId;

  function clearOptions(e) {
    $query = "";
    clearInterval(refreshIntervalId);
  }

  function periodicRefresh() {
    // random from text
    $query = questions[0][Math.floor(Math.random() * questions[0].length)];
  }

  function scrollDown() {
    clearInterval(refreshIntervalId);
    document
      .getElementById("ask-a-question")
      .scrollIntoView({ behavior: "smooth", block: "start" });
  }

  onMount(() => {
    refreshIntervalId = setInterval(periodicRefresh, 10000);
  });
</script>

<section class="relative">
  <div class="text-center text-black/90 w-full">
    <h1 class="text-3xl md:text-5xl font-bold pb-8">
      Constitutional <br />Discourses Observer
    </h1>
    <div class="text-pretty md:text-2xl text-black/80 w-3/4 mx-auto">
      What did the members of the Constituent Assembly debate about? How does
      the Lok Sabha talk about it now? How have they affected the collective
      lives of the nation?
      <br />
      <p class="underline py-3">Ask a question, a simple one.</p>
      <section class="flex flex-row bg-primary p-2 m-3">
        <input
          type="text"
          class="form-input text-xl w-full px-3 py-2"
          name="query"
          bind:value={$query}
          on:mouseover={() => clearInterval(refreshIntervalId)}
          autofocus
        />
        <button
          type="submit"
          class="bg-primary text-white px-2 rounded-md"
          on:click={scrollDown}>Explore</button
        >
      </section>
      <!-- <button class="bg-primary px-3 my-10 py-2 rounded">
        <a href="/about" class="underline">Learn more.</a>
      </button> -->
    </div>
  </div>
</section>

<style>
  input {
    caret-shape: block;
  }
</style>
