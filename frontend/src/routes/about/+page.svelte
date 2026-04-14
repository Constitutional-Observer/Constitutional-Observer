<script>
  import { marked } from "marked";
  import source from "$lib/about.md?raw";
  import TitleWithNav from "../../lib/components/TitleWithNav.svelte";
  import Footer from "$lib/components/Footer.svelte";
</script>

<svelte:head>
  <title>About: Constitutional Observer</title>
  <meta name="description" content="The Constitutional Observer provides a comparative interface to understand current and past parliamentry discourse in India. Search with a question, and get related discussions in the Lok Sabha and the Constituent Assembly">
  <meta name="keywords" content="Lok Sabha, Constituent Assembly, Indian Constitution, Politics, Contemporary, Comparative studies">
</svelte:head>

<main
  class="relative grid grid-cols-10 place-items-start pb-[30vh] gap-10 bg-primaryLight  "
>
  <section class="col-span-10 px-2 sticky lg:col-span-3 self-start lg:sticky lg:top-6">
    <TitleWithNav
      title="About: Constitutional Discourses Observer"
      subtitle="This is a guide to understanding the project, the vision forward, and serves as a quick overview."
    />
  </section>

  <div
    id="content"
    class=" col-span-10 lg:col-span-7 px-2 text-sm overflow-y-scroll text-justify"
  >
    {@html marked.parse(source)}
  </div>
</main>

<Footer />

<style lang="postcss">
  :global(ol) {
    @apply list-decimal pl-10;
  }

  :global(ul) {
    @apply list-disc pl-5;
  }
  main {
    @apply w-full md:w-3/4   md:mx-auto;
  }

  #content :global(p) {
    @apply p-2;
  }

  :global(.toc-list-item) {
    @apply border-2 border-primary w-fit rounded-md px-2;
  }
  #content :global(h2) {
    @apply text-3xl pb-1 mt-12;
  }

  #content :global(h3) {
    @apply text-2xl pt-5 pb-2;
  }

  #content :global(h4) {
    @apply text-xl pb-1;
  }
</style>
