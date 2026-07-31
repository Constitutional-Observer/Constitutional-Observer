<script>
  // @ts-nocheck
  import { onMount } from "svelte";
  import TitleWithNav from "$lib/components/general/TitleWithNav.svelte";

  let stateLegSource =
    "https://raw.githubusercontent.com/Constitutional-Observer/India-State-Legislature-Archives/refs/heads/main/assembly_mirror_tracker.csv";
  let miscSource =
    "https://raw.githubusercontent.com/Constitutional-Observer/India-State-Legislature-Archives/refs/heads/main/misc_mirror_tracker.csv";
  let data = [];
  let miscData = [];
  let loading = true;
  let error = null;

  function parseCSV(csvText) {
    const lines = csvText.split("\n").filter((line) => line.trim());
    const headers = lines[0].split(",").map((h) => h.trim());

    return lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });
      return row;
    });
  }

  function statusDotClass(status) {
    const s = (status || "").toLowerCase();
    if (s.includes("completed")) return "bg-green-500";
    if (s.includes("started") || s.includes("pending")) return "bg-yellow-500";
    return "bg-gray-400";
  }

  onMount(async () => {
    try {
      const [stateLegResponse, miscResponse] = await Promise.all([
        fetch(stateLegSource),
        fetch(miscSource),
      ]);

      const [stateLegText, miscText] = await Promise.all([
        stateLegResponse.text(),
        miscResponse.text(),
      ]);

      data = parseCSV(stateLegText);
      miscData = parseCSV(miscText);
      loading = false;
    } catch (err) {
      error = err.message;
      loading = false;
    }
  });
</script>

<main
  class="relative grid grid-cols-10 place-items-start pb-[30vh] gap-4 bg-primaryLight"
>
  <section
    class="col-span-10 px-2 sticky lg:col-span-3 self-start lg:sticky lg:top-6"
  >
    <TitleWithNav
      title="Archiving collections"
      subtitle="The working of our institutions, the legislature, the courts and the executive should not be measured solely by their formal interaction with the constitution: making laws, passing bills, their judgments and in the decisions that the executive makes. There are discussions, opposition, debate, statements, orders, notices, circulars that are both formal and informal in nature that make up a significant part of how India functions, from the roots to the top of the branches. The Constitutional Observer seeks to bring together a collection of these records as archives that document the making of our political present and future. This particular repository will track the archiving of Official State Legislature Documents in various forms."
    >
      <img
        src="https://raw.githubusercontent.com/Constitutional-Observer/India-State-Legislature-Archives/refs/heads/main/scripts/map_visualisation/status_map.png"
      />
    </TitleWithNav>
  </section>

  <div id="content" class="col-span-10 lg:col-span-7 px-2 text-sm">
    {#if loading}
      <div class="flex items-center justify-center p-8">
        <div
          class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"
        ></div>
      </div>
    {:else if error}
      <div
        class="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800"
      >
        <svg
          class="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>Error loading data: {error}</span>
      </div>
    {:else}
      {#if miscData.length}
        <h2 class="section-heading">Other Sources</h2>
        <div class="source-grid mb-6">
          {#each miscData as row}
            {@const name = row.name || ""}
            {@const status = row.status || ""}
            {@const notes = row.notes || ""}
            {@const archiveLink = row["archive.org link"] || ""}
            {@const hasArchive = !!archiveLink}

            {#if name}
              <div class="source-card bg-white border-blue-300">
                <div class="flex-grow space-y-2">
                  <span class="text-lg text-gray-900 font-bold">{name}</span>

                  {#if status}
                    <div class="flex flex-col">
                      <span
                        class="text-xs font-semibold text-gray-500 tracking-wide"
                        >Status</span
                      >
                      <div class="flex items-center gap-2 mt-1">
                        <span
                          class="w-3 h-3 rounded-full {statusDotClass(status)}"
                        ></span>
                        <span class="text-sm text-gray-800 font-medium"
                          >{status}</span
                        >
                      </div>
                    </div>
                  {/if}

                  {#if notes}
                    <div class="flex flex-col">
                      <span
                        class="text-xs font-semibold text-gray-500 uppercase tracking-wide"
                        >Notes</span
                      >
                      <span class="text-xs text-gray-700 mt-1">{notes}</span>
                    </div>
                  {/if}
                </div>

                {#if hasArchive}
                  <a
                    href={archiveLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="block mt-4"
                  >
                    <button class="archive-button"
                      >Open Internet Archive Collection</button
                    >
                  </a>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      {/if}

      <h2 class="section-heading">State Legislatures and UTs</h2>
      <div class="source-grid overflow-y-scroll">
        {#each data as row}
          {@const state = row["State / UT"] || ""}
          {@const assemblyWebsite = row["Assembly website"] || ""}
          {@const councilWebsite = row["Council Website"] || ""}
          {@const assemblyRecords = row["Assembly Records"] || ""}
          {@const councilRecords = row["Council Records"] || ""}
          {@const assemblyMirrorStatus = row["Assembly Mirror Status"] || ""}
          {@const councilMirrorStatus = row["Council Mirror Status"] || ""}
          {@const archiveLink = row["Archive.org link"] || ""}
          {@const notes = row.Notes || ""}
          {@const hasArchive = !!archiveLink}

          <div
            class="source-card {hasArchive
              ? 'bg-white border-blue-300'
              : 'bg-neutral-100'}"
          >
            <div class="flex-grow space-y-2">
              {#if state}
                <span class="text-lg text-gray-900 font-bold">{state}</span>
              {/if}

              <div class="grid grid-cols-2 gap-2">
                {#if assemblyMirrorStatus}
                  <div class="flex flex-col">
                    <span
                      class="text-xs font-semibold text-gray-500 tracking-wide"
                      >Assembly Status</span
                    >
                    <div class="flex items-center gap-2 mt-1">
                      <span
                        class="w-3 h-3 rounded-full {statusDotClass(
                          assemblyMirrorStatus,
                        )}"
                      ></span>
                      <span class="text-sm text-gray-800 font-medium"
                        >{assemblyMirrorStatus}</span
                      >
                    </div>
                  </div>
                {/if}

                {#if councilMirrorStatus && councilMirrorStatus !== "No sitting council"}
                  <div class="flex flex-col">
                    <span
                      class="text-xs font-semibold text-gray-500 tracking-wide"
                      >Council Status</span
                    >
                    <div class="flex items-center gap-2 mt-1">
                      <span
                        class="w-3 h-3 rounded-full {statusDotClass(
                          councilMirrorStatus,
                        )}"
                      ></span>
                      <span class="text-sm text-gray-800 font-medium"
                        >{councilMirrorStatus}</span
                      >
                    </div>
                  </div>
                {/if}
              </div>

              {#if notes}
                <div class="flex flex-col">
                  <span
                    class="text-xs font-semibold text-gray-500 uppercase tracking-wide"
                    >Notes</span
                  >
                  <span class="text-xs text-gray-700 mt-1">{notes}</span>
                </div>
              {/if}

              {#if !assemblyMirrorStatus && !councilMirrorStatus && !notes}
                <span class="text-md text-gray-700 mt-1">
                 Collection has not begun yet</span
                >
              {/if}
            </div>
            {#if hasArchive}
              <a
                href={archiveLink}
                target="_blank"
                rel="noopener noreferrer"
                class="block mt-4"
              >
                <button class="archive-button"
                  >Open Internet Archive Collection</button
                >
              </a>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</main>

<style>
  @reference "../../app.css";

  main {
    @apply md:w-3/4 w-full md:mx-auto;
  }

  #content :global(p) {
    @apply p-2;
  }

  .section-heading {
    @apply text-lg text-gray-900 font-bold mb-2;
  }

  .source-grid {
    @apply grid grid-cols-1 lg:grid-cols-3 gap-4;
  }

  .source-card {
    @apply min-h-[20vh] shadow-md p-4 hover:shadow-lg transition-shadow border relative border-primaryDark flex flex-col;
  }

  .archive-button {
    @apply bg-primary text-white px-2 py-1 hover:bg-primaryLight hover:text-black w-full;
  }
</style>
