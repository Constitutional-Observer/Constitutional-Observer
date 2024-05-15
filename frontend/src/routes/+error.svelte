<script>
  import { page } from "$app/stores";
  import Footer from "$lib/components/Footer.svelte";
</script>

<main class="md:h-[70vh] grid place-content-center md:px-[10%]">
  <div class="w-full pl-5 pr-10 md:w-2/6">
    <h1 class="text-3xl">
      Thank you for visiting the Constitutional Discourses Observer, but the <bold
        class="font-semibold"
        >site or this particular page appears to be unavailable</bold
      >
    </h1>
    <h2 class="text-2xl mt-2 p-1 bg-primary rounded">
      Please go back to the <a class="text-blue-700" href="/">home page</a> and try
      again.
    </h2>
  </div>
  <code class="preformatter pt-10 pl-5 pr-10 md:px-0 w-full md:w-1/2"
    >If this error persists, please contact at adhavan [dot] sivaraj16 [at]
    gmail [dot] com with "Constitutional-Observer-Error" as the subject line. <br
    />{$page.status}
    {$page.error.message}</code
  >
</main>

<Footer></Footer>
