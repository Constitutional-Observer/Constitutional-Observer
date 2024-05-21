<script>
  import { query } from "$lib/stores";
  import SearchBox from "./SearchBox.svelte";
  import { ProgressRadial } from "@skeletonlabs/skeleton";
  import { goto } from "$app/navigation";
  import TitleWithNav from "./TitleWithNav.svelte";

  import Carousel from "./Carousel.svelte";
  import { questions, images } from "$lib/text.js";
  let loading = false;
</script>

<main class="landing lg:grid lg:grid-cols-10 gap-6 h-[80vh]">
  <section class=" md:col-span-6 lg:col-span-4 self-center">
    <TitleWithNav
      title="Ask a Question"
      subtitle="Imagine questions to the Constituent Assembly and the Lok Sabha that would give you a snapshot of the thinking of the times. Questions like:"
    >
      <Carousel
        contents={{
          type: "textCarousel",
          text: questions,
          caption: " ",
          title: "How do we ask questions that do not have singular answers?",
        }}
      ></Carousel>
    </TitleWithNav>
  </section>
  <section class=" col-span-6 lg:col-span-6 self-center">
    <!-- Central search-->
    <form
      class="text-left"
      method="post"
      on:submit={(event) => {
        event.preventDefault();
        loading = true;
        goto("/ask/?query=" + encodeURIComponent($query));
      }}
    >
      <SearchBox {loading}></SearchBox>
    </form>
  </section>
</main>

<!-- Central search-->

<style lang="postcss">
</style>
