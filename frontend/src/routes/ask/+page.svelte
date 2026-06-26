<script>
  import SearchApp from "$lib/components/search/SearchApp.svelte";

  let { data } = $props();
</script>

<svelte:head>
  <title>Ask a question to the Constitutional Observer</title>
  <meta
    name="description"
    content="The Constitutional Observer provides a comparative interface to understand current and past parliamentary discourse in India."
  />
</svelte:head>

<SearchApp {data} basePath="/ask" />
