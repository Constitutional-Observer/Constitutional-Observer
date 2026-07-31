<script>
  import { page } from "$app/state";

  const links = [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
    { href: "/collections", label: "Collections" },
    { href: "/ask", label: "Ask" },
  ];

  let currentPath = $derived(page.url.pathname);
  let menuOpen = $state(false);

  $effect(() => {
    // close the mobile menu on navigation
    currentPath;
    menuOpen = false;
  });
</script>

<nav class="flex flex-row flex-wrap items-center justify-between gap-4">
  <a href="/" class="!text-[1.2em] font-bold text-black/90 no-underline">
    Constitutional Observer
  </a>

  <button
    class="hamburger"
    aria-label="Toggle menu"
    aria-expanded={menuOpen}
    onclick={() => (menuOpen = !menuOpen)}
  >
    <span></span>
    <span></span>
    <span></span>
  </button>

  <ul class="nav-links" class:open={menuOpen}>
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
ul{
  list-style-type: none;
}
  nav {
    @apply relative sticky top-0 md:px-[10%] px-10 py-1 z-20 bg-primaryLight text-sm text-black/70 border-b-4 border-primary;
  }
  .active {
    @apply font-bold text-black/90 underline;
  }
  a{
    @apply text-[1em]
  }

  .hamburger {
    @apply hidden flex-col justify-center items-center gap-1.5 w-8 h-8 cursor-pointer;
  }
  .hamburger span {
    @apply block w-6 h-0.5 bg-black/70 rounded transition-all;
  }

  .nav-links {
    @apply flex flex-row flex-wrap items-center gap-4;
  }

  @media (max-width: 768px) {
    .hamburger {
      @apply flex;
    }
    .nav-links {
      @apply hidden flex-col items-start w-full gap-2 pt-2;
    }
    .nav-links.open {
      @apply flex;
    }
  }
</style>
