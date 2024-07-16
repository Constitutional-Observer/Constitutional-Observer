<script>
  import { page } from "$app/stores";

  // get current url
  let currentUrl = $page.url.pathname.split("/").slice(1);

  export let title;
  export let subtitle;
</script>

<div class=" top-0 text-left text-black/90 w-full px-2">
  <h2
    id="ask-a-question"
    class="text-2xl text-black/50 md:text-xl font-bold text-left py-5"
  >
    <a href="/">Constitutional Observer </a> /
    <a href={currentUrl}>{currentUrl}</a>
  </h2>
</div>
<section
  class="relative py-7 px-5 backdrop-opacity-50 bg-primaryLight/90 drop-shadow-xl border-4 border-primary"
>
  <h1 class="text-2xl md:text-4xl font-bold py-2 pb-8">{title}</h1>

  {#if subtitle}
    <p class="md:text-[1rem] text-justify text-black/60">
      {subtitle}
    </p>
  {/if}

  <slot></slot>
</section>

<style lang="postcss">
  a {
    @apply underline;
  }
  input {
    caret-shape: block;
  }
</style>
