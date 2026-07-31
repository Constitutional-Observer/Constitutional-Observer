<script>
  import { page } from "$app/state";

  let currentUrl = $derived(page.url.pathname.split("/").slice(1));

  let { title, subtitle, children } = $props();
</script>

<section
  class="relative m-5 p-5 backdrop-opacity-50 bg-primaryLight/90 drop-shadow-xl border-4 border-primary"
>
  <h1 class="text-md md:text-2xl font-bold py-2 pb-8">{title}</h1>

  {#if subtitle}
    <p class="md:text-[0.9em] prose text-black/60">
      {subtitle}
    </p>
  {/if}

  {#if children}
    {@render children()}
  {/if}
</section>

<style lang="postcss">
  @reference "../../../app.css";

  a {
    @apply underline;
  }
  input {
    caret-shape: block;
  }
</style>
