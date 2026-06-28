<script>
import {headlines} from "$lib/data/text.js"
import {fade} from "svelte/transition"
import {onMount} from "svelte"

let index = $state(0);

onMount(() => {
  const id = setInterval(() => {
    index = (index + 1) % headlines.length;
  }, 4000);
  return () => clearInterval(id);
});
</script>

<section
  class="relative relative py-5 px-3 backdrop-opacity-50 bg-primaryLight/90 drop-shadow-xl border-4 border-primary  "
>
  <div class="text-left text-black/90 w-full px-2">
    <h1 class="relative text-4xl md:text-4xl lg:text-4xl font-bold py-2 pb-8">
      {#key index}
        <span in:fade={{ duration: 600 }}>{headlines[index]}</span>
      {/key}
    </h1>
    <div class="text-pretty md:text-sm lg:text-md text-black/80 w-full">
      The Constitutional Observer collects materials from State Legislatures, Government Orders, Gazettes, Public Archives so that one can trace the lifecycle of the constitution's application in all walks of the nation's life.
      <br /><br />

    </div>
  </div>
</section>

<style>
  input {
    caret-shape: block;
  }
</style>
