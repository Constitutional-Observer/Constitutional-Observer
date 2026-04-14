<script>
  import { query } from "$lib/stores";
  import MainSearch from "$lib/components/MainSearch.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import TitleWithNav from "../../lib/components/TitleWithNav.svelte";
  import { onMount } from "svelte";

  let { data } = $props();
  let form;
  let loading = $state(true);
  let currentQuery = $state("");

  async function loadQuery(q) {
    if (
      typeof q != "undefined" &&
      q != null &&
      typeof window !== "undefined"
    ) {
      loading = false;
      $query = q;
    } else {
      loading = true;
    }
  }

  onMount(() => {
    currentQuery = page.url.searchParams.get("query");
    loadQuery(currentQuery);
  });

  $effect(() => {
    currentQuery = page.url.searchParams.get("query");
    loadQuery(currentQuery);
  });

  async function handleSubmit() {
    page.url.searchParams.set("query", $query);
    data.debates = [];
    data.sabha = [];
    invalidateAll();
  }
</script>

<svelte:head>
  <title>Ask a question to the Constitutional Observer</title>
  <meta name="description" content="Search parliamentary debates" />
</svelte:head>

<div id="container">
  {#if loading}
    <div class="md:p-20 h-auto">
      <MainSearch />
    </div>
  {:else}
    <div class="md:grid gap-5 md:grid-cols-8 mx-10 text-sm md:h-[150vh] text-black">

      <!-- LEFT PANEL -->
      <section class="scroll-container my-10 col-span-2">
        <TitleWithNav title={$query}>
          <form
            class="opacity-80 mt-5 hover:opacity-100 transition-all"
            onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}
            bind:this={form}
          >
            <div class="flex">
              <input
                type="text"
                class="p-1 mr-2 w-full text-sm text-gray-300"
                bind:value={$query}
                disabled={loading}
              />
              <button
                type="submit"
                class="bg-primary text-white px-2 py-1 rounded-md"
                disabled={loading}
              >
                Search
              </button>
            </div>
          </form>
        </TitleWithNav>
      </section>

      <!-- DEBATES -->
      {#await data.debates}
        <p>Loading...</p>
      {:then debates}
        <section class="scroll-container col-span-3">
          <section class="title">
            <h2 class="title-bg">Constituent Assembly Debates</h2>
          </section>

          {#if debates.length === 0}
            <span class="text-xl">Loading...</span>
          {/if}

          {#each debates as debate}
            <details class="accordion">
              <summary>
                <div>
                  <h4>{debate.speaker_name || "Unknown speaker"}</h4>
                  <span>{new Date(debate.date).toDateString()}</span>
                </div>
              </summary>

              <blockquote class="mt-2">
                {debate.content}
              </blockquote>
            </details>
          {/each}
        </section>
      {:catch}
        <p>Error loading debates</p>
      {/await}

      <!-- LOK SABHA -->
      {#await data.sabha}
        <p>Loading...</p>
      {:then questions}
        <section class="scroll-container col-span-3">
          <section class="title">
            <h2 class="title-bg">Lok Sabha Debates</h2>
          </section>

          {#each questions as question}
            <details class="accordion">
              <summary>
                <span>
                  {new Date(question.index[0].Date).toDateString()}
                </span>
              </summary>

              <div class="mt-2">
                <p>{question.txt}</p>
                <a href={question.link} target="_blank">Read more</a>
              </div>
            </details>
          {/each}
        </section>
      {:catch}
        <p>Error loading questions</p>
      {/await}

    </div>
  {/if}
</div>

<Footer />

<style lang="postcss">
@reference "tailwindcss";

#container {
  @apply md:px-[5%];
  background-image: url("/Constitution_of_India_inside_4.webp");
  background-size: cover;
}

.title {
  @apply p-4 mb-6 bg-primaryDark border border-primary rounded;
}

.title-bg {
  @apply text-xl font-bold;
}

.scroll-container {
  @apply overflow-y-auto my-10 px-2;
}

/* Accordion styling */
.accordion {
  @apply bg-primaryLight rounded-lg p-3 mb-3 transition;
}

.accordion:hover {
  @apply bg-primary/40;
}

summary {
  @apply cursor-pointer font-semibold;
}

blockquote {
  @apply text-sm mt-2;
}
</style>
