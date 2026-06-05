<script>
  import Footer from "$lib/components/Footer.svelte";
  import WarningDialog from "$lib/components/WarningDialog.svelte";
  import Title from "$lib/components/Title.svelte";
  import { tick } from "svelte";

  let firstLoad = false;

  const themes = [
    {
      title: "Environmental impact of infrastructure",
      terms: ["environment impact assessment", "EIA", "पर्यावरण", "forest clearance", "biodiversity"],
      image: "stage1-1.jpeg",
      query: "environment impact assessment infrastructure",
    },
    {
      title: "Electoral reform and voting systems",
      terms: ["first past the post", "proportional representation", "मतदान", "electoral reform", "election commission"],
      image: "stage1-1.jpeg",
      query: "electoral reform voting first past the post",
    },
    {
      title: "Panchayat and local governance",
      terms: ["panchayati raj", "gram sabha", "पंचायत", "local self-government", "municipal elections"],
      image: "stage1-1.jpeg",
      query: "panchayat gram sabha local government",
    },
    {
      title: "Public healthcare spending",
      terms: ["health budget", "स्वास्थ्य", "AYUSHMAN", "hospital funding", "public health"],
      image: "stage1-1.jpeg",
      query: "healthcare spending budget public health",
    },
    {
      title: "The powers of a Governor",
      terms: ["राज्यपाल", "governor powers", "President's Rule", "Article 356", "constitutional role"],
      image: "stage1-1.jpeg",
      query: "governor powers constitutional President rule",
    },
    {
      title: "Caste in census and enumeration",
      terms: ["जाति जनगणना", "OBC enumeration", "backward classes", "social classification", "caste census"],
      image: "stage1-1.jpeg",
      query: "caste census enumeration backward classes",
    },
    {
      title: "Urban cycling and mobility",
      terms: ["cycle lanes", "non-motorised transport", "साइकिल", "urban mobility", "green transport"],
      image: "stage1-1.jpeg",
      query: "cycling infrastructure urban non-motorised transport",
    },
    {
      title: "Urbanisation across states",
      terms: ["urban growth", "नगरीकरण", "migration", "smart cities", "municipal governance"],
      image: "stage1-1.jpeg",
      query: "urbanisation cities states migration",
    },
    {
      title: "Investment in education",
      terms: ["शिक्षा", "NEP", "education budget", "school funding", "higher education"],
      image: "stage1-1.jpeg",
      query: "education investment budget NEP",
    },
    {
      title: "Loss of wildlife and habitat",
      terms: ["वन्यजीव", "tiger reserve", "endangered species", "habitat loss", "wildlife protection"],
      image: "stage1-1.jpeg",
      query: "wildlife loss endangered species habitat",
    },
    {
      title: "Subsidised and free education",
      terms: ["RTE", "छात्रवृत्ति", "free schooling", "scholarship", "education subsidy"],
      image: "stage1-1.jpeg",
      query: "subsidised free education scholarship RTE",
    },
    {
      title: "Right to information",
      terms: ["RTI", "सूचना का अधिकार", "transparency", "public disclosure", "whistleblower"],
      image: "stage1-1.jpeg",
      query: "right to information RTI transparency",
    },
    {
      title: "Rural employment guarantee",
      terms: ["MGNREGA", "मनरेगा", "NREGA", "rural wages", "employment guarantee"],
      image: "stage1-1.jpeg",
      query: "MGNREGA rural employment guarantee wages",
    },
    {
      title: "Taxation of the wealthy",
      terms: ["wealth tax", "कर", "income tax", "capital gains", "super rich levy"],
      image: "stage1-1.jpeg",
      query: "taxation wealth income inequality",
    },
    {
      title: "Railway infrastructure and budget",
      terms: ["रेलवे", "rail budget", "passenger services", "freight", "station modernisation"],
      image: "stage1-1.jpeg",
      query: "railway infrastructure budget spending",
    },
    {
      title: "Land redistribution and reform",
      terms: ["भूमि सुधार", "land ceiling", "zamindari abolition", "land acquisition", "tenancy reform"],
      image: "stage1-1.jpeg",
      query: "land redistribution reform ceiling zamindari",
    },
    {
      title: "Censorship and press freedom",
      terms: ["सेंसरशिप", "Article 19", "sedition", "media freedom", "press freedom"],
      image: "stage1-1.jpeg",
      query: "censorship press freedom Article 19 media",
    },
    {
      title: "Youth radicalisation",
      terms: ["extremism", "युवा", "terror financing", "community harmony", "deradicalisation"],
      image: "stage1-1.jpeg",
      query: "radicalisation youth extremism",
    },
  ];

  const explorations = [
    { title: "Environment Impact Assessments and their history", description: "", image: "", author: "an unknown author" },
    { title: "The various tragedies of land acquisition in our cities", description: "", image: "", author: "an unknown author" },
    { title: "The backbone of the National Health Mission", description: "", image: "", author: "an unknown author" },
  ];

  let placeholderQuestion = $state("MGNREGA women");
  let askUrl = $derived(`/ask?query=${encodeURIComponent(placeholderQuestion)}`);

  function slowScrollTo(el, duration = 3000) {
    const start    = window.scrollY;
    const target   = el.getBoundingClientRect().top + window.scrollY;
    const distance = target - start;
    let   t0       = null;

    // ease-in-out cubic
    const ease = p => p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;

    function step(ts) {
      if (!t0) t0 = ts;
      const progress = Math.min((ts - t0) / duration, 1);
      window.scrollTo(0, start + distance * ease(progress));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  async function searchTheme(theme) {
    placeholderQuestion = theme.query;
    await tick();
    const el = document.getElementById("ask-section");
    if (el) slowScrollTo(el, 1800);
  }
</script>

<svelte:head>
  <title>Constitutional Observer</title>
  <meta
    name="description"
    content="The Constitutional Observer provides a comparative interface to understand current and past parliamentry discourse in India. Search with a question, and get related discussions in the Lok Sabha and the Constituent Assembly"
  />
  <meta
    name="keywords"
    content="Lok Sabha, Constituent Assembly, Indian Constitution, Politics, Contemporary, Comparative studies"
  />
</svelte:head>

{#if firstLoad}
  <WarningDialog />
{/if}
<main class="">
  <!-- Theme cards tile the whole page -->
  <section class="theme-grid h-screen">
    {#each themes as theme}
      <button class="theme-card" style="background-image: url(/{theme.image})" onclick={() => searchTheme(theme)}>
        <div class="theme-card-overlay">
          <div class="theme-card-terms">
            {#each theme.terms as term}
              <span class="theme-term">{term}</span>
            {/each}
          </div>
          <h3 class="theme-card-title">{theme.title}</h3>
        </div>
      </button>
    {/each}
  </section>

  <section class="relative p-2 h-screen w-screen">
    <h2 class="text-2xl">From the community</h2>
    {#each explorations as exploration}
      <article
        class="exploration-card"
        style="background-image: url(/{exploration.image})"
      >
        <div class="exploration-card-overlay">
          <h3 class="">{exploration.title}</h3>
          <p class="text-xs">{exploration.author}</p>
          <p class="">{exploration.description}</p>
        </div>
      </article>
    {/each}
  </section>
  <section id="ask-section" class="relative h-screen flex flex-col">
    <iframe
      src={askUrl}
      title="Constitutional Observer search results"
      class="ask-frame"
    ></iframe>
  </section>

  <!-- Floating search bar, centered over the grid -->
  <section class="title-box">
    <Title />
  </section>
</main>

<Footer />

<style lang="postcss">
  .theme-grid {
    @apply grid gap-0;
    /* Tile the whole viewport: columns fill in, rows share the height. */
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    grid-template-rows: repeat(3, 1fr);
  }

  .title-box {
    @apply absolute z-20 flex items-center justify-center p-4;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(90vw, 640px);
  }

  .theme-card {
    @apply relative bg-cover bg-center overflow-hidden cursor-pointer border-0 p-0 text-left;
    background-repeat: no-repeat;
    transition: filter 0.2s;
  }
  .theme-card:hover { filter: brightness(1.12); }
  .theme-card:hover .theme-card-overlay {
    background: linear-gradient(to top, rgba(0,0,0,0.88), rgba(0,0,0,0.2));
  }
  .theme-card:hover .theme-term { opacity: 1; }

  .theme-card-overlay,
  .exploration-card-overlay {
    @apply absolute inset-0 flex flex-col justify-end gap-1 p-4 text-white;
    background: linear-gradient(
      to top,
      rgba(0, 0, 0, 0.75),
      rgba(0, 0, 0, 0.1)
    );
  }

  .exploration-card {
    @apply relative w-full my-2 h-[200px] overflow-hidden border-4 border-solid border-primary;
    @apply bg-cover bg-center bg-no-repeat;
  }

  .theme-card-title {
    @apply text-sm font-bold leading-tight capitalize mt-1.5;
  }

  .theme-card-terms {
    @apply flex flex-wrap gap-1;
  }

  .theme-term {
    @apply text-[9px] px-1.5 py-0.5 rounded-full bg-white/20 text-white/80 font-mono backdrop-blur-sm;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .ask-frame {
    @apply flex-1 w-full border-0;
    min-height: 0;
  }

  :global(input[type="text"]) {
    @apply selection:bg-primary selection:text-black selection:font-bold;
  }
</style>
