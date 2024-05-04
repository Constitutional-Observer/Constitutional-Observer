<script>
  import { onMount } from "svelte";

  let dialog;

  onMount(() => {
    dialog.showModal();
  });
</script>

<dialog
  bind:this={dialog}
  on:close={() => (dialog = false)}
  class="bg-primary rounded-xl w-full md:w-1/4 shadow-2xl backdrop:bg-black/20 backdrop:backdrop-blur-sm"
>
  <h1 class="p-5 text-2xl">Disclaimer</h1>
  <div class="pl-5 pr-10 py-3">
    Alpha version disclaimer: You have probably received this link for review.
    As this is a work in progress, please note: layout and interactive features
    are subject to change. The search results may not be accurate.

    <br /><br />
    <i
      >This project is open to critical feedback and suggestions. Please email
      at adhavan.sivaraj16@gmail.com with "Constitutional-Observer" as the
      subject line</i
    >

    <div>
      <button
        class="p-3 my-5 bg-primaryLight rounded-lg"
        on:click={() => dialog.close()}>Close</button
      >
    </div>
  </div>
</dialog>
