<script>
  import { TableOfContents, tocCrawler } from "@skeletonlabs/skeleton";
  import { marked } from "marked";
  import source from "$lib/about.md?raw";
  import Footer from "$lib/components/Footer.svelte";
  let toc;
</script>

<svelte:head>
  <title>About</title>
</svelte:head>

<section class="bg-primaryLight mx-5">
  <div class="md:px-[15%] pt-[15vh] mb-20 text-black/70 w-5/6">
    <a href="/"
      ><h1 class="text-5xl">About: Constitutional Discourses Observer</h1></a
    >
    <div class="text-pretty text-xl">
      This is a guide to understanding the project, the vision forward, and
      serves as a quick overview.
      <br />
      <a href="/" class="underline">Go back</a>
    </div>
  </div>
</section>
<main class="grid grid-cols-10 place-items-start pb-[30vh] gap-10">
  <TableOfContents
    class="md:sticky top-20 col-span-8 sm:col-span-6 md:col-span-2 self-start"
  />
  <div
    id="content"
    class="col-span-8 sm:col-span-6 md:col-span-5 overflow-y-scroll text-justify"
    use:tocCrawler={{ mode: "generate", scrollTarget: toc }}
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
