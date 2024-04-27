<script>
  import "../app.css";
</script>

<div class="size-disclaimer">
  Please open this page in a larger window, preferrably in a horizontal
  orientation, in a desktop or laptop.
</div>

<slot />

<style>
  .size-disclaimer {
    @apply text-left  z-50 text-red-700 p-10 bg-primary md:hidden;
  }
</style>
