<script>
  import { page } from "$app/state";

  const links = [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
    { href: "/collections", label: "Collections" },
    { href: "/ask", label: "Ask" },
  ];

  let currentPath = $derived(page.url.pathname);
</script>

<nav class="flex flex-row flex-wrap items-center justify-between gap-4">
  <a href="/" class="font-bold text-black/90 no-underline">
    Constitutional Observer
  </a>

  <ul class="flex flex-row flex-wrap items-center gap-4">
    {#each links as { href, label }}
      <li>
        <a
          {href}
          class="hover:underline"
          class:active={currentPath === href}
          aria-current={currentPath === href ? "page" : undefined}
        >
          {label}
        </a>
      </li>
    {/each}
  </ul>
</nav>

<style lang="postcss">
  @reference "../../../app.css";

  nav {
    @apply absolute top-0 sticky md:px-[10%] px-10 py-4 z-20 bg-primaryLight text-sm text-black/70 border-b-4 border-primary;
  }
  .active {
    @apply font-bold text-black/90 underline;
  }
  a{
    @apply text-[1em]
  }
</style>
