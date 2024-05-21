<script>
  import { query } from "$lib/stores";
  import { questions } from "$lib/text.js";
  import { getToastStore } from "@skeletonlabs/skeleton";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  let refreshIntervalId;

  let placeholderQuestion = "Who should the nation pray to?";

  function clearOptions(e) {
    placeholderQuestion = "";
    clearInterval(refreshIntervalId);
  }

  function periodicRefresh() {
    // random from text
    placeholderQuestion =
      questions[0][0][Math.floor(Math.random() * questions[0][0].length)];
  }

  function navigateTo() {
    clearInterval(refreshIntervalId);
    // document
    //   .getElementById("ask-a-question")
    //   .scrollIntoView({ behavior: "smooth", block: "start" });

    $query = placeholderQuestion;
    goto("/ask");
  }

  onMount(() => {
    refreshIntervalId = setInterval(periodicRefresh, 10000);
  });
</script>

<section
  class="relative relative py-7 px-5 backdrop-opacity-50 bg-primaryLight/90 drop-shadow-xl border-4 border-primary"
>
  <div class="text-left text-black/90 w-full px-2">
    Welcome to the
    <h1 class="text-3xl md:text-5xl font-bold py-2 pb-8">
      Constitutional <br />Discourses Observer
    </h1>
    <div class="text-pretty md:text-[1.2rem] text-black/80 w-full">
      What did the members of the Constituent Assembly debate about? How does
      the Lok Sabha talk about it now? How have they affected the collective
      lives of the nation?
      <br />
      <p class="underline py-3">Ask a question, a simple one.</p>
      <section class="flex flex-row mt-10 bg-primary p-2">
        <input
          type="text"
          class="form-input text-xl w-full px-3 py-2 resize-none"
          wrap="soft"
          name="query"
          bind:value={placeholderQuestion}
          on:mouseover={() => clearInterval(refreshIntervalId)}
          autofocus
        />
        <button
          type="submit"
          class="bg-primary text-white px-2 rounded-md"
          on:click={navigateTo}>Explore</button
        >
      </section>
      <button class="bg-primary text-xl px-3 my-1 py-2 rounded">
        <a href="/about" class="underline">About</a>
      </button>
    </div>
  </div>
</section>

<style>
  input {
    caret-shape: block;
  }
</style>
