<script>
  import { query } from "$lib/stores";
  import { Accordion, AccordionItem } from "@skeletonlabs/skeleton";

  export let form;
</script>

<main class="relative">
  <!-- Main content -->

  <div class="grid gap-20 grid-cols-5 h-screen text-black">
    <section class="relative scroll-container my-10">
      <div class="absolute top-1/3 left-1/7">
        <h1 class="text-6xl text-bold">
          {$query}
        </h1>
        <form
          class="opacity-50 hover:opacity-100 transition-all"
          method="post"
          action="?/query"
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
              class="bg-primary text-white px-2 py-1 rounded-md">Search</button
            >
          </div>
        </form>
        <a href="/" class="underline pt-5">Go back</a>
      </div>
    </section>

    {#await form.debates}
      Loading...
    {:then debates}
      <section class="scroll-container col-span-2">
        <h2 class="title-bg">Constituent Assembly Debates</h2>
        <p>The Constituent Assembly met between 1947 and 1949.</p>
        <Accordion>
          {#each debates as debate, index (debate)}
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
    {:catch}
      <p>Something went wrong</p>
    {/await}

    {#await form.sabha}
      Loading...
    {:then questions}
      <section class="scroll-container col-span-2">
        <h2 class="title-bg">Lok Sabha Questions</h2>
        <Accordion>
          {#each questions as question, index (question)}
            <AccordionItem class="card">
              <svelte:fragment slot="lead"
                >{@html question.Title}
                <!-- {@html sabha.Name} from {@html sabha.Constituency} in  -->
              </svelte:fragment>

              <svelte:fragment slot="summary">
                {@html question.questionAnswer.substring(0, 100)}
              </svelte:fragment>

              <svelte:fragment slot="content">
                {@html question.questionAnswer}
              </svelte:fragment>
            </AccordionItem>
          {/each}
        </Accordion>
      </section>
    {:catch}
      <p>Something went wrong</p>
    {/await}
    <!-- {#if form?.streamed?.courts?.length > 0}
      <section class="scroll-container">
        <h2 class="title-bg">SC and HC judgements</h2>

        <Accordion>
          {#each form.streamed.courts as judgement, index (judgement)}
            <AccordionItem class="card">
              <svelte:fragment slot="lead"
                >{@html judgement.title}
                {@html judgement.author}
               
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
    {/if} -->
  </div>
</main>

<!-- Main content -->
<style lang="postcss">
  .title-bg {
    @apply sticky top-2  w-80 pt-4 mb-10 rounded text-4xl text-black font-bold bg-primaryLight;
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
</style>
