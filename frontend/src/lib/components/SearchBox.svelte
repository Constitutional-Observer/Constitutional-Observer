<script>
  import { query } from "$lib/stores";
  import { onMount } from "svelte";

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

  let box6 = [
      "government",
      "state",
      "language",
      "union",
      "people",
      "constitution",
      "love",
      "poems",
    ],
    box6selected = [];

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
    box6selected = [];
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

<!-- <div class="grid grid-cols-8">
  <div class="w-80 col-span-2">
    <p class="text-xl text-left py-5">ask from these</p>
    {#each text1.slice(0, 4) as option}
      <button class="text-left text-xl" on:click={() => onchange(option)}>
        {option}</button
      >
    {/each}
  </div>
</div> -->
<div class="w-full grid mt-3 px-1">
  <section class="flex flex-row bg-primary p-2">
    <input
      type="text"
      class="form-input text-xl w-full p-3"
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
  </section>

  <section class="py-2 px-0 grid">
    <div class="col-span-5">
      <p class="text-xl text-center py-5">
        You can select from these options as well
      </p>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div class="q-opt-box">
          <h4>How can you begin the question?</h4>
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
        <div class="q-opt-box">
          <h4>Should it be suggestive?</h4>
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
        <!-- <div class="q-opt-box">
      <h4></h4>
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
    </div> -->
        <div class="q-opt-box">
          <h4>Who do you think it affects?</h4>
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
        <div class="q-opt-box">
          <h4>What can they do?</h4>
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
        <div class="q-opt-box">
          <h4>Who do you think can affect lives?</h4>
          {#each box6 as option}
            <input
              type="checkbox"
              id={option}
              bind:group={box6selected}
              value={option}
              on:change={() => onchange(option)}
            />
            <label for={option}>{option}</label>
          {/each}
        </div>
      </div>
    </div>
  </section>
</div>

<style lang="postcss">
  .q-opt-box h4 {
    @apply text-2xl pb-4 pt-2 text-center;
  }
  .q-opt-box {
    @apply bg-primary m-1 rounded-lg p-5;
  }
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
    @apply text-black/60 text-xl;
  }

  input[type="checkbox"]:checked + label {
    @apply text-black font-bold;
  }

  input[type="checkbox"]:focus + label {
    @apply text-black font-bold;
  }
</style>
