<script>
  import { query } from "$lib/stores";
  import { onMount } from "svelte";
  import MainSearch from "./MainSearch.svelte";

  let box1 = ["Who", "What", "When", "Where", "Why", "How"],
    box1selected = [];

  let box2 = ["should", "must", "could", "can", "will", "shall", "ought to"],
    box2selected = [];

  let box3 = ["be", "have", "do", "the"],
    box3selected = [];

  let box4 = [
      "nation",
      "people",
      "cows",
      "group",
      "state",
      "community",
      "constitution",
    ],
    box4selected = [];

  let box5 = ["pray", "feed", "eat", "speak", "love", "know"],
    box5selected = [];

  function onchange(text) {
    $query = $query + " " + text;
    $query = $query;
  }

  function clearOptions(e) {
    e.preventDefault();
    $query = "";
    box1selected = [];
    box2selected = [];
    box3selected = [];
    box4selected = [];
    box5selected = [];
  }

  onMount(() => {
    if ($query) {
      // split into words and make list
      let words = $query.split(" ");

      // if word is in check list add it
      for (let i = 0; i < words.length; i++) {
        console.log(words[i]);
        switch (words[i]) {
          case box1.includes(words[i]):
            box1selected = [...box1selected, words[i]];
            break;
          case box2.includes(words[i]):
            box2selected = [...box2selected, words[i]];
            break;
          case box3.includes(words[i]):
            box3selected = [...box3selected, words[i]];
            break;
          case box4.includes(words[i]):
            box4selected = [...box4selected, words[i]];
            break;
          case box5.includes(words[i]):
            box5selected = [...box5selected, words[i]];
            break;
        }
      }
    }
  });
</script>

<div class="w-full grid mt-3 px-1">
  <div class="flex flex-row bg-primary p-2 text-black">
    <input
      type="text"
      class="form-input w-full"
      name="query"
      bind:value={$query}
    />
    <button
      type="submit"
      class="bg-primary w-20 text-white my-3 px-2 py-1 rounded-md">Ask</button
    >
    <button
      class="bg-primary w-20 text-white my-3 px-2 py-1 rounded-md"
      on:click={clearOptions}>Clear</button
    >
  </div>

  <div class="grid grid-cols-5">
    <div>
      {#each box1 as option}
        <input
          type="checkbox"
          id={option}
          bind:group={box1selected}
          value={option}
          on:change={() => onchange(option)}
        />
        <label for={option}>{option}</label>
      {/each}
    </div>
    <div>
      {#each box2 as option}
        <input
          type="checkbox"
          id={option}
          bind:group={box2selected}
          value={option}
          on:change={() => onchange(option)}
        />
        <label for={option}>{option}</label>
      {/each}
    </div>
    <div>
      {#each box3 as option}
        <input
          type="checkbox"
          id={option}
          bind:group={box3selected}
          value={option}
          on:change={() => onchange(option)}
        />
        <label for={option}>{option}</label>
      {/each}
    </div>
    <div>
      {#each box4 as option}
        <input
          type="checkbox"
          id={option}
          bind:group={box4selected}
          value={option}
          on:change={() => onchange(option)}
        />
        <label for={option}>{option}</label>
      {/each}
    </div>
    <div>
      {#each box5 as option}
        <input
          type="checkbox"
          id={option}
          bind:group={box5selected}
          value={option}
          on:change={() => onchange(option)}
        />
        <label for={option}>{option}</label>
      {/each}
    </div>
  </div>
</div>

<style lang="postcss">
  input[type="checkbox"] {
    border: 0;
    clip: rect(0 0 0 0);
    height: 1px;
    margin: -1px;
    overflow: hidden;
    padding: 0;
    position: absolute;
    width: 1px;
  }

  input[type="checkbox"] + label {
    @apply cursor-pointer;
    @apply text-center;
  }

  input[type="checkbox"]:checked + label {
    @apply text-primary font-bold;
  }

  input[type="checkbox"]:focus + label {
    @apply text-primary font-bold;
  }
</style>
