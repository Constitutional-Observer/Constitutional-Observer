<script>
  import { TableOfContents, tocCrawler } from "@skeletonlabs/skeleton";
  import { marked } from "marked";
  import source from "$lib/about.md?raw";
  import Footer from "$lib/components/Footer.svelte";
</script>

<svelte:head>
  <title>About</title>
</svelte:head>
<body>
  <div class="">
    <section class="relative">
      <div class="md:px-[15%] pt-[15vh] mb-20 text-black/70 w-5/6">
        <a href="/"
          ><h1 class="text-5xl">
            About: Constitutional Discourses Observer
          </h1></a
        >
        <div class="text-pretty text-xl">
          What did the members of the Constituent Assembly debate about? How
          does the Lok Sabha talk about it now? How have they affected the
          collective lives of the nation?
          <br />
          <a href="/" class="underline">Go back</a>
        </div>
      </div>
    </section>
    <main class="grid grid-cols-8">
      <div class="col-span-2">
        <TableOfContents />
      </div>
      <div
        id="content"
        class="col-span-6"
        use:tocCrawler={{ mode: "generate" }}
      >
        {@html marked.parse(source)}
      </div>
    </main>
  </div>
</body>
<Footer />

<style lang="postcss">
  main {
    @apply md:w-3/4 w-full mx-auto;
  }

  #content :global(p) {
    @apply p-2;
  }

  #content :global(h2) {
    @apply text-3xl pb-4 pt-6;
  }

  #content :global(h3) {
    @apply text-2xl pb-2;
  }

  #content :global(h4) {
    @apply text-xl pb-1;
  }

  body {
    @apply bg-primaryLight;
  }
</style>
