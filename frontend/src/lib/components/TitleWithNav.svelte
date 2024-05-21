<script>
  export let title;
  export let subtitle;
</script>

<section
  class="relative py-7 px-5 backdrop-opacity-50 bg-primaryLight/90 drop-shadow-xl border-4 border-primary"
>
  <div class="text-left text-black/90 w-full px-2">
    <a href="/" class="underline"
      ><h2
        id="ask-a-question"
        class="text-2xl text-black/50 md:text-xl font-bold text-left py-5"
      >
        Constitutional Observer
      </h2></a
    >
    <h1 class="text-3xl md:text-5xl font-bold py-2 pb-8">{title}</h1>

    {#if subtitle}
      <p class="md:text-2xl text-justify text-black/40">
        {subtitle}
      </p>
    {/if}

    <slot></slot>
  </div>
</section>

<style>
  input {
    caret-shape: block;
  }
</style>
