<script>
  import "../app.css";
</script>

<div class="size-disclaimer">
  Please open this page in a larger window, preferrably in a horizontal
  orientation, in a desktop or laptop.
</div>

<slot />

<svelte:head>
  <script
    defer
    src="https://analytics.eu.umami.is/script.js"
    data-website-id="77592837-b465-4a97-9c79-194f59cd9a52"
  ></script>
</svelte:head>

<style lang="postcss">
  .size-disclaimer {
    @apply text-left  z-50  p-10 bg-primary md:hidden;
  }
</style>
