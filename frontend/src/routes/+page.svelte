<script>
  import { fade } from "svelte/transition";
  import { onMount } from "svelte";
  import { query } from "$lib/stores";
  import { Accordion, AccordionItem } from "@skeletonlabs/skeleton";

  import MainSearch from "../lib/components/MainSearch.svelte";
  export let form;

  let ready = false;

  onMount(() => {
    ready = true;
  });
</script>

{#if form?.debates?.length > 0 && ready}
  <main transition:fade class="relative">
    <!-- Main content -->

    <div class="grid gap-2 grid-cols-4 h-screen bg-primaryLight text-black">
      <section class="relative scroll-container my-10">
        <div class="absolute top-1/3 left-1/7">
          <h1 id="central-text">
            {$query}
          </h1>
          <form
            class="opacity-50 hover:opacity-100 transition-all"
            method="post"
            action="?/query"
          >
            <div class="w-3/4">
              <input
                type="text"
                name="query"
                class="p-1 w-full text-gray-200"
                bind:value={$query}
              />
              <button
                type="submit"
                class="bg-primary text-white px-2 py-1 rounded-md"
                >Search</button
              >
            </div>
          </form>
        </div>
      </section>
      {#if form?.debates?.length > 0}
        <section class="scroll-container">
          <h2 class="title-bg">Constituent Assembly Debates</h2>
          <Accordion>
            {#each form.debates as debate, index (debate)}
              <AccordionItem class="card">
                <svelte:fragment slot="lead">
                  {@html debate.speaker_name} on {@html new Date(
                    debate.date
                  ).toDateString()}
                </svelte:fragment>
                <svelte:fragment slot="summary"
                  >{@html debate.content.substring(0, 100)}</svelte:fragment
                >
                <svelte:fragment slot="content"
                  >{@html debate.content}</svelte:fragment
                >
              </AccordionItem>
            {/each}
          </Accordion>
        </section>
      {/if}

      {#if form?.sabha?.length > 0}
        <section class="scroll-container">
          <h2 class="title-bg">Lok Sabha Questions</h2>
          <Accordion>
            {#each form.sabha as sabha, index (sabha)}
              <AccordionItem class="card">
                <svelte:fragment slot="lead"
                  >{@html sabha.Title}
                  <!-- {@html sabha.Name} from {@html sabha.Constituency} in  -->
                </svelte:fragment>

                <svelte:fragment slot="summary">
                  {@html sabha.questionAnswer.substring(0, 100)}
                </svelte:fragment>

                <svelte:fragment slot="content">
                  {@html sabha.questionAnswer}
                </svelte:fragment>
              </AccordionItem>
            {/each}
          </Accordion>
        </section>
      {/if}
      {#if form?.courts?.length > 0}
        <section class="scroll-container">
          <h2 class="title-bg">SC and HC judgements</h2>

          <Accordion>
            {#each form.courts as judgement, index (judgement)}
              <AccordionItem class="card">
                <svelte:fragment slot="lead"
                  >{@html judgement.title}
                  {@html judgement.author}
                  <!-- {@html sabha.Name} from {@html sabha.Constituency} in  -->
                </svelte:fragment>

                <svelte:fragment slot="summary">
                  {@html judgement.cleaned_paras.substring(0, 100)}
                </svelte:fragment>

                <svelte:fragment slot="content"
                  >{@html judgement.cleaned_paras}</svelte:fragment
                >
              </AccordionItem>
            {/each}
          </Accordion>
        </section>
      {/if}
    </div>
  </main>
  <!-- Main content -->
{:else}
  <MainSearch />
{/if}

<style lang="postcss">
  @import url("https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Gilda+Display&family=Yeseva+One&display=swap");

  main {
    @apply w-3/4 mx-auto;
  }
  .title-bg {
    @apply sticky top-2  w-80 pt-4 mb-3 rounded text-2xl text-black font-bold bg-primaryLight;
  }

  .scroll-container {
    @apply snap-y  overflow-y-auto overflow-x-hidden my-10 px-2;
  }

  .card {
    @apply rounded-md px-4 py-5 snap-y snap-center max-h-60 overflow-y-hidden my-5 text-sm;
  }

  .card-header {
    @apply text-lg font-bold pb-2;
  }

  :global(.accordion-lead) {
    @apply font-bold pb-2;
  }

  :global(.accordion-summary) {
    @apply text-sm p-0;
  }
  :global(.accordion-control) {
    @apply flex-wrap;
  }

  #central-text {
    font-family: "DM Serif Display", serif;
    font-weight: 400;
    font-style: normal;
    @apply text-left text-5xl text-pretty pb-10;
  }
  /* impor ta background image*/
  :global(body) {
    background-image: url("/Constitution_of_India_preamble.webp");
    background-repeat: no-repeat;
    background-size: cover;
    @apply bg-primaryLight;
  }
</style>
