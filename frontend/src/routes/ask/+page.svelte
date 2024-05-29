<script>
  import { query } from "$lib/stores";
  import { Accordion, AccordionItem } from "@skeletonlabs/skeleton";
  import MainSearch from "$lib/components/MainSearch.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/stores";

  import { goto } from "$app/navigation";
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
  <div class="md:p-20 h-auto">
    <MainSearch />
  </div>
{:else}
  <div class="md:grid gap-5 md:grid-cols-8 mx-10 h-auto md:h-screen text-black">
    <section class="md:relative scroll-container my-10 col-span-2">
      <div class="md:absolute top-[20%] left-1/7">
        <TitleWithNav
          title={$query}
          subtitle="Your question is used to meaningfully search a database of the Constitutent Assembly Debates and Lok Sabha Questions and Answers. The Observer hopes to provide you with a historical perspective on ideas that make the nation."
        >
          <form
            class="opacity-80 mt-5 hover:opacity-100 transition-all"
            on:submit={(event) => {
              loading = true;
              goto("/ask/?query=" + encodeURIComponent($query));
              $page.url.searchParams.set("query", $query);
              let loadState = invalidateAll();
              loadState.then(() => {
                loading = false;
              });
            }}
            autofocus
          >
            <div class="flex">
              <input
                type="text"
                name="query"
                class="p-1 mr-2 w-full text-gray-300"
                placeholder="Ask a question"
                bind:value={$query}
                disabled={loading}
                autofocus
              />
              <button
                type="submit"
                class="bg-primary text-white px-2 py-1 rounded-md"
                disabled={loading}>Search</button
              >
            </div>
          </form>

          {#if loading}
            <span class="text-xl text-center mx-auto"
              >loading<span class="loader">...</span></span
            >
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
            The Constituent Assembly met between 1947 and 1949 and ratified the
            Constitution of India on 26th January 1950. These arguments are
            crucial to undertanding to the origins of our democracy.
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
            The Lok Sabha represents the billion+ citizens of india. Its 543
            members have met 68 days every year on an average since the 2000s.
            These are responses to questions by MPs asked during question hour
            (the first 1 hour of each session).
          </p>
        </section>
        <Accordion>
          {#each questions as question, index (question)}
            <AccordionItem class="card">
              <svelte:fragment slot="lead">
                <h4 class="text-2xl pr-3 py-1 text-black/90">
                  {question.Title}
                </h4>

                <!-- {sabha.Name} from {sabha.Constituency} in  -->
              </svelte:fragment>

              <svelte:fragment slot="summary">
                by {question.Representative} to Ministry of {question[
                  "Ministry or Category"
                ]}
                Read the question and answer at this link:
                <a href={question.link} target="_blank">Link</a>
                <!-- {question.questionAnswer.substring(0, 100)} -->
              </svelte:fragment>

              <svelte:fragment slot="content">
                Read the question and answer at this link: <a
                  href={question.link}
                  target="_blank">Link</a
                >
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
    @apply p-4 pt-6 mb-10 bg-primaryDark border-2 border-primary;
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

  .loader {
    width: 180px; /* control the size */
    aspect-ratio: 8/5;
    --_g: no-repeat radial-gradient(#000 68%, #0000 71%);
    -webkit-mask: var(--_g), var(--_g), var(--_g);
    -webkit-mask-size: 50% 40%;
    @apply bg-primaryLight;
    animation: load 2s infinite;
  }

  @keyframes load {
    0% {
      -webkit-mask-position:
        0% 0%,
        50% 0%,
        100% 0%;
    }
    16.67% {
      -webkit-mask-position:
        0% 100%,
        50% 0%,
        100% 0%;
    }
    33.33% {
      -webkit-mask-position:
        0% 100%,
        50% 100%,
        100% 0%;
    }
    50% {
      -webkit-mask-position:
        0% 100%,
        50% 100%,
        100% 100%;
    }
    66.67% {
      -webkit-mask-position:
        0% 0%,
        50% 100%,
        100% 100%;
    }
    83.33% {
      -webkit-mask-position:
        0% 0%,
        50% 0%,
        100% 100%;
    }
    100% {
      -webkit-mask-position:
        0% 0%,
        50% 0%,
        100% 0%;
    }
  }
</style>
