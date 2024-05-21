<script>
  import { query } from "$lib/stores";
  import { Accordion, AccordionItem } from "@skeletonlabs/skeleton";
  import MainSearch from "$lib/components/MainSearch.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/stores";
  import TitleWithNav from "../../lib/components/TitleWithNav.svelte";

  export let data;
  let form;
  $: form = data;

  // check if there is a query
  let currentQuery = $page.url.searchParams.get("query");

  $: currentQuery = $page.url.searchParams.get("query");

  let loading = false;
</script>

<svelte:head>
  <title>Ask a question: Constitutional Observer</title>
</svelte:head>

<!-- Main content -->
{#if !currentQuery}
  <div class="md:p-20 h-full">
    <MainSearch />
  </div>
{:else}
  <div class="md:grid gap-5 md:grid-cols-8 mx-10 h-screen text-black">
    <section class="md:relative scroll-container my-10 col-span-2">
      <div class="md:absolute top-[20%] left-1/7">
        <TitleWithNav
          title={$query}
          subtitle="These responses are collected from an archive of Constituent Assembly Debates and Lok Sabha Questions and Answers."
        >
          <form
            class="opacity-80 mt-5 hover:opacity-100 transition-all"
            on:submit={(event) => {
              $page.url.searchParams.set("query", $query);
              invalidateAll();
            }}
            autofocus
          >
            <div class="w-3/4 flex">
              <input
                type="text"
                name="query"
                class="p-1 mr-2 w-full text-gray-300"
                bind:value={$query}
              />
              <button
                type="submit"
                class="bg-primary text-white px-2 py-1 rounded-md"
                >Search</button
              >
            </div>
          </form>
          <a href="/ask" class="underline pt-5">Go back</a>
          {#if loading}
            <span>Loading...</span>
          {/if}
        </TitleWithNav>
      </div>
    </section>

    {#await form.debates}
      Loading...
    {:then debates}
      <section class="scroll-container col-span-1 md:col-span-3">
        <section class="title">
          <h2 class="title-bg">Constituent Assembly Debates</h2>
          <p>
            The Constituent Assembly met between 1947 and 1949. Lorem ipsum
            dolor sit amet. Lorem, ipsum dolor sit amet consectetur adipisicing
            elit. Sint cumque similique aliquid necessitatibus ducimus labore
            quidem optio fugit nihil ut commodi reiciendis dolores ad ab quod,
            error consequuntur dolorum iure! Lorem ipsum
          </p>
        </section>

        <Accordion>
          {#each debates as debate, index (debate)}
            <AccordionItem class="card">
              <svelte:fragment slot="lead">
                <blockquote
                  class="text-2xl px-3 py-1 blockquote !font-semibold !border-l-[3px] !non-italic text-black/90"
                >
                  {debate.content.substring(0, 200) + " ..."}
                </blockquote></svelte:fragment
              >
              <svelte:fragment slot="summary">
                <h4>
                  {#if debate.speaker_name}
                    {debate.speaker_name}
                  {:else}
                    Unknown speaker
                  {/if}
                </h4>
                <span>on {new Date(debate.date).toDateString()}</span>
              </svelte:fragment>
              <svelte:fragment slot="content">{debate.content}</svelte:fragment>
            </AccordionItem>
          {/each}
        </Accordion>
      </section>
    {:catch}
      <p>Something went wrong</p>
    {/await}

    {#await form.sabha}
      Loading...
    {:then questions}
      <section class="scroll-container col-span-1 md:col-span-3">
        <section class="title">
          <h2 class="title-bg">Lok Sabha Questions</h2>
          <p>
            The combined question and answers of the last 15 years has dolor sit
            amet. Lorem, ipsum dolor sit amet consectetur adipisicing elit. Sint
            cumque similique aliquid necessitatibus ducimus labore quidem optio
            fugit nihil ut commodi reiciendis dolores ad ab quod, error
            consequuntur dolorum iure! Lorem ipsum
          </p>
        </section>
        <Accordion>
          {#each questions as question, index (question)}
            <AccordionItem class="card">
              <svelte:fragment slot="lead">
                <h4 class="text-2xl pr-3 py-1 text-black/90">
                  {question.Title}
                </h4>
                <small>
                  by {question.Representative} to Ministry of {question[
                    "Ministry or Category"
                  ]}</small
                >

                <!-- {sabha.Name} from {sabha.Constituency} in  -->
              </svelte:fragment>

              <svelte:fragment slot="summary">
                Read the question and answer at this link: <a
                  href={question.link}
                  target="_blank">Link</a
                >
                <!-- {question.questionAnswer.substring(0, 100)} -->
              </svelte:fragment>

              <svelte:fragment slot="content">
                {question.questionAnswer}
              </svelte:fragment>
            </AccordionItem>
          {/each}
        </Accordion>
      </section>
    {:catch}
      <p>Something went wrong</p>
    {/await}
  </div>
{/if}

<Footer />

<!-- Main content -->
<style lang="postcss">
  .title,
  .title-bg {
    @apply sticky top-0 w-full rounded;
  }

  .title {
    @apply p-4 pt-6 mb-10 bg-primary;
  }
  .title-bg {
    @apply text-4xl text-black pb-4 font-bold;
  }

  .scroll-container {
    @apply snap-y  overflow-y-auto overflow-x-hidden my-10 px-2;
  }
  :global(.accordion-lead) {
    @apply font-bold text-xl pb-2 w-full;
  }

  :global(.accordion-summary) {
    @apply text-sm p-0;
  }
  :global(.accordion-control) {
    @apply flex-wrap;
  }
  :global(.accordion-panel) {
    @apply text-balance;
  }
  main {
    @apply md:mx-auto max-h-screen w-[90%] mx-auto;
  }

  :global(input[type="text"]) {
    @apply selection:bg-primary selection:text-black;
  }

  a::after {
    content: "↗";
  }
  a {
    @apply text-blue-800;
  }
  :global(.accordion-item, .accordion-item > button) {
    @apply rounded-lg;
  }

  :global(.accordion-control[aria-expanded="true"]) {
    @apply bg-primary/80;
  }

  :global(.accordion-control[aria-expanded="true"]:hover) {
    @apply bg-primary/40;
  }

  :global(.accordion-item) {
    @apply bg-primary/10;
  }
  :global(.accordion-item:hover) {
    @apply bg-primary/40;
  }
  :global(.accordion-panel[aria-hidden="false"]) {
    @apply bg-primary/40;
  }
</style>
