<script>
  import { query } from "$lib/stores";
  import { Accordion, AccordionItem } from "@skeletonlabs/skeleton";
  import { onMount } from "svelte";

  export let form;
  let ready = false;
  onMount(() => {
    ready = true;
  });
</script>

<main class="relative">
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
              class="bg-primary text-white px-2 py-1 rounded-md">Search</button
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
<style lang="postcss">
  .scroll-container {
    @apply snap-y  overflow-y-auto overflow-x-hidden my-10 px-2;
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
  main {
    @apply md:w-3/4 max-h-screen w-full mx-auto;
  }
</style>
