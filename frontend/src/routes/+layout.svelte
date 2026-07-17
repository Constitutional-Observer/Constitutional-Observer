<script>
  import "../app.css";
  import { MetaTags } from 'svelte-meta-tags';
  import Nav from "$lib/components/general/Nav.svelte";
  import Footer from "$lib/components/general/Footer.svelte";
  let { children } = $props();
</script>

<Nav/>

{@render children()}

<svelte:head>
  <script
    defer
    src="https://analytics.eu.umami.is/script.js"
    data-website-id="77592837-b465-4a97-9c79-194f59cd9a52"
  ></script>
</svelte:head>
<Footer/>
<style lang="postcss">
  @reference "../app.css";

  .size-disclaimer {
    @apply text-left  z-50  px-5 py-2 bg-primary md:hidden;
  }
</style>
