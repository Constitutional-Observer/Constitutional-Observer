<script>
  import { TableOfContents, tocCrawler } from "@skeletonlabs/skeleton";
  import { marked } from "marked";
  import source from "$lib/about.md?raw";
  import TitleWithNav from "../../lib/components/TitleWithNav.svelte";
  import Footer from "$lib/components/Footer.svelte";
  let toc;
</script>

<svelte:head>
  <title>About</title>
</svelte:head>
<main
  class="relative lg:grid lg:grid-cols-10 lg:place-items-start pb-[30vh] gap-10 bg-primaryLight mx-20 w-auto"
>
  <section class="lg:col-span-4 self-start lg:sticky lg:top-6">
    <TitleWithNav
      title="About: Constitutional Discourses Observer"
      subtitle="This is a guide to understanding the project, the vision forward, and serves as a quick overview."
    >
      <TableOfContents
        class="pt-4"
        active="bg-primary "
        regionListItem="border-8 border-primary"
      /></TitleWithNav
    >
  </section>

  <div
    id="content"
    class=" lg:col-span-6 overflow-y-scroll text-justify"
    use:tocCrawler={{ mode: "generate", scrollTarget: "#content" }}
    bind:this={toc}
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
    @apply md:w-3/4 w-full mx-5 md:mx-auto;
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
