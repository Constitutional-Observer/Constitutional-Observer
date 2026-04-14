<script>
  import { onMount } from "svelte";

  let dialog = $state();

  onMount(() => {
    dialog.showModal();
  });
</script>

<dialog
  bind:this={dialog}
  onclose={() => (dialog = false)}
  class="bg-primary rounded-xl w-full md:w-1/4 shadow-2xl backdrop:bg-black/20 backdrop:backdrop-blur-sm"
>
  <h1 class="p-5 text-2xl">Disclaimer</h1>
  <div class="pl-5 pr-10 py-3">
    Beta version disclaimer: Features are subject to change. The search results
    may not be accurate.

    <br /><br />
    <i
      >This project is open to feedback. Please email at
      adhavan.sivaraj16@gmail.com
    </i>

    <div>
      <button
        class="p-3 my-5 bg-primaryLight rounded-lg"
        onclick={() => dialog.close()}>Close</button
      >
    </div>
  </div>
</dialog>
