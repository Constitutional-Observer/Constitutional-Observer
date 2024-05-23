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

<main class="landing lg:grid lg:grid-cols-10 gap-6 h-auto mx-10">
  <section class="lg:col-span-4 self-center">
    <TitleWithNav
      title="Ask a Question"
      subtitle="Ask a question to the people that made our laws (the constitution) and continue to make our laws in the present (the Lok Sabha). Questions like:"
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
  <section class="col-span-6 lg:col-span-6 self-center">
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
