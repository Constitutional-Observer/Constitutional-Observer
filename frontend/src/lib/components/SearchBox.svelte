<script>
  import { query } from "$lib/stores";
</script>

<div class="w-full flex mt-3">
  <input
    type="text"
    name="query"
    class="p-2 mr-5 w-80 rounded"
    bind:value={$query}
  />
  <button type="submit" class="bg-primary text-white px-4 py-2 rounded-md"
    >Ask</button
  >
</div>
