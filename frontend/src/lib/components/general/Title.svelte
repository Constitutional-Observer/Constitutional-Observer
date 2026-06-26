<script>
  import { query } from "$lib/stores";
  import { goto } from "$app/navigation";

  let refreshIntervalId;

  let placeholderQuestion = $state("Who should the nation pray to?");

  function navigateTo() {
    clearInterval(refreshIntervalId);
    $query = placeholderQuestion;
    goto("/ask/");
  }
</script>

<section
  class="relative relative py-5 px-3 backdrop-opacity-50 bg-primaryLight/90 drop-shadow-xl border-4 border-primary  "
>
  <div class="text-left text-black/90 w-full px-2">
    Welcome to the
    <h1 class="text-2xl md:text-3xl lg:text-4xl font-bold py-2 pb-8">
      Constitutional <br /> Observer
    </h1>
    <div class="text-pretty md:text-sm lg:text-md text-black/80 w-full">
      What did the members of the Constituent Assembly debate about? How does
      the Lok Sabha talk about it now? How have they affected the collective
      lives of the nation? The Constitutional Observer collects materials from State Legislatures, Government Orders, Gazettes, Public Archives so that one can trace the lifecycle of the constitution's application in all walks of the nation's life.
      <br /><br />


      <!-- <form onsubmit={(e) => { e.preventDefault(); navigateTo(); }}>
        <section class="flex flex-row mt-5 bg-primary p-2 mb-1">
          <input
            type="text"
            class="form-input md:text-sm w-full px-3 py-2 resize-none"
            wrap="soft"
            name="query"
            bind:value={placeholderQuestion}
            autofocus
          />
          <button
            type="submit"
            class="btn bg-primary text-white px-2 rounded-md"
            onclick={navigateTo}>Explore</button
          >
        </section>
      </form> -->

      <button class="  pr-3 my-1 py-2 rounded">
        <a href="/about" class="underline"
          >About the observer</a
        >
      </button>

      <button class=" border pr-3 my-1 py-2 rounded">
        <a href="/collections" class="underline"
          >Archiving efforts</a
        >
      </button>

        <button class=" border pr-3 my-1 py-2 rounded">
        <a href="/collections" class="underline"
          >People and Contributors</a
        >
      </button>
    </div>
  </div>
</section>

<style>
  input {
    caret-shape: block;
  }
</style>
