<script>
  /** @type {{ hits: any[], yearMin: string, yearMax: string }} */
  let { hits = [], yearMin = $bindable(""), yearMax = $bindable("") } = $props();

  // filter(Boolean) passes year=1 (truthy but invalid). Guard with a
  // minimum of 1800 so stray default values don't collapse the slider range.
  let allYears = $derived(hits.map(h => h.year).filter(y => y >= 1800));
  let globalMin = $derived(allYears.length ? Math.min(...allYears) : 1947);
  let globalMax = $derived(allYears.length ? Math.max(...allYears) : 2024);
  let yearSpan = $derived(Math.max(globalMax - globalMin, 1));

  let activeMin = $derived(yearMin !== "" ? Number(yearMin) : globalMin);
  let activeMax = $derived(yearMax !== "" ? Number(yearMax) : globalMax);

  let histogram = $derived.by(() => {
    if (!allYears.length) return [];
    const counts = {};
    for (const y of allYears) counts[y] = (counts[y] || 0) + 1;
    const result = [];
    for (let y = globalMin; y <= globalMax; y++) {
      result.push({ year: y, count: counts[y] || 0 });
    }
    return result;
  });

  // sqrt scale so sparse years are still visible
  let maxCount = $derived(Math.max(...histogram.map(b => b.count), 1));
  let sqrtMax = $derived(Math.sqrt(maxCount));

  function barHeight(count) {
    return count === 0 ? 0 : Math.max((Math.sqrt(count) / sqrtMax) * 28, 1);
  }

  function pct(year) {
    return ((year - globalMin) / yearSpan) * 100;
  }

  function handleMinInput(e) {
    const v = Math.min(Number(e.target.value), activeMax - 1);
    yearMin = v <= globalMin ? "" : String(v);
  }

  function handleMaxInput(e) {
    const v = Math.max(Number(e.target.value), activeMin + 1);
    yearMax = v >= globalMax ? "" : String(v);
  }

  function handleMinYearCommit(e) {
    const v = Number(e.target.value);
    if (!isNaN(v) && v >= globalMin && v < activeMax) {
      yearMin = v === globalMin ? "" : String(v);
    } else {
      // reset to current
      e.target.value = activeMin;
    }
  }

  function handleMaxYearCommit(e) {
    const v = Number(e.target.value);
    if (!isNaN(v) && v <= globalMax && v > activeMin) {
      yearMax = v === globalMax ? "" : String(v);
    } else {
      e.target.value = activeMax;
    }
  }

  let isFiltered = $derived(yearMin !== "" || yearMax !== "");

  // For highlighting, count documents in the active range for display
  let inRangeCount = $derived(
    isFiltered ? hits.filter(h => h.year != null && h.year >= activeMin && h.year <= activeMax).length : hits.length
  );
</script>

{#if allYears.length > 0}
  <div class="tl-root">
    <div class="tl-header">
      <span class="tl-label">Time period</span>
      <span class="tl-count">{inRangeCount.toLocaleString()} docs</span>
      {#if isFiltered}
        <button class="tl-clear" onclick={() => { yearMin = ""; yearMax = ""; }}>Clear</button>
      {/if}
    </div>

    <!-- Histogram + slider, full width -->
    <div class="tl-widget">
      <svg class="tl-histogram" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
        {#each histogram as bar, i}
          {@const x = (i / histogram.length) * 100}
          {@const w = 100 / histogram.length}
          {@const h = barHeight(bar.count)}
          {@const inRange = bar.year >= activeMin && bar.year <= activeMax}
          <rect
            x={x + 0.05}
            y={32 - h}
            width={Math.max(w - 0.1, 0.2)}
            height={h}
            class={inRange ? "bar-in" : "bar-out"}
          />
        {/each}
        <rect
          x={pct(activeMin)}
          y={30.5}
          width={Math.max(pct(activeMax) - pct(activeMin), 0.1)}
          height={1.5}
          class="range-line"
        />
      </svg>

      <div
        class="tl-track-fill"
        style="left: {pct(activeMin)}%; right: {100 - pct(activeMax)}%;"
      ></div>

      <div class="tl-slider-wrap">
        <input
          type="range"
          class="tl-range tl-range-min"
          min={globalMin}
          max={globalMax}
          value={activeMin}
          oninput={handleMinInput}
          aria-label="Start year"
        />
        <input
          type="range"
          class="tl-range tl-range-max"
          min={globalMin}
          max={globalMax}
          value={activeMax}
          oninput={handleMaxInput}
          aria-label="End year"
        />
      </div>
    </div>

    <!-- Year inputs at the bottom ends, aligned to the slider edges -->
    <div class="tl-ends">
      <input
        type="number"
        class="tl-year-box"
        value={activeMin}
        min={globalMin}
        max={activeMax - 1}
        onchange={handleMinYearCommit}
        aria-label="Start year"
      />
      <input
        type="number"
        class="tl-year-box"
        value={activeMax}
        min={activeMin + 1}
        max={globalMax}
        onchange={handleMaxYearCommit}
        aria-label="End year"
      />
    </div>
  </div>
{/if}

<style lang="postcss">
  @reference "../../../app.css";

  .tl-root {
    @apply space-y-1.5;
  }

  .tl-header {
    @apply flex items-center gap-2;
  }

  .tl-label {
    @apply text-[10px] font-bold text-black/50 uppercase tracking-wider;
  }

  .tl-count {
    @apply text-[9px] font-mono text-black/40 ml-auto;
  }

  .tl-clear {
    @apply text-[9px] text-blue-700 underline leading-none;
  }

  .tl-clear::after { content: ""; }

  .tl-widget {
    @apply relative;
    height: 48px;
  }

  /* Histogram SVG fills the full widget height */
  .tl-histogram {
    @apply absolute inset-0 w-full h-full;
  }

  .bar-out {
    fill: rgb(0 0 0 / 0.12);
  }

  .bar-in {
    fill: rgb(5 150 105 / 0.55); /* emerald-600 */
  }

  .range-line {
    fill: rgb(5 150 105 / 0.8);
  }

  /* Shaded fill between the two handles */
  .tl-track-fill {
    @apply absolute bottom-0;
    height: 4px;
    background: rgb(5 150 105 / 0.25);
    border-radius: 2px;
  }

  /* Slider wrapper — sits at the bottom of the widget */
  .tl-slider-wrap {
    @apply absolute inset-x-0 bottom-0;
    height: 20px;
  }

  /* Both range inputs stacked absolutely */
  .tl-range {
    -webkit-appearance: none;
    appearance: none;
    position: absolute;
    width: 100%;
    height: 4px;
    bottom: 8px;
    background: transparent;
    pointer-events: none;
    outline: none;
  }

  /* Transparent track for both */
  .tl-range::-webkit-slider-runnable-track {
    background: transparent;
    height: 4px;
    border-radius: 2px;
  }

  .tl-range::-moz-range-track {
    background: transparent;
    height: 4px;
    border-radius: 2px;
  }

  /* Thumb styling */
  .tl-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    pointer-events: all;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    border: 2px solid rgb(5 150 105);
    cursor: grab;
    box-shadow: 0 1px 4px rgba(0,0,0,0.25);
    transition: border-color 0.1s, transform 0.1s;
    margin-top: -5px;
  }

  .tl-range::-moz-range-thumb {
    pointer-events: all;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    border: 2px solid rgb(5 150 105);
    cursor: grab;
    box-shadow: 0 1px 4px rgba(0,0,0,0.25);
  }

  .tl-range:active::-webkit-slider-thumb {
    cursor: grabbing;
    transform: scale(1.2);
    border-color: rgb(4 120 87);
  }

  .tl-range:active::-moz-range-thumb {
    cursor: grabbing;
    border-color: rgb(4 120 87);
  }

  /* Max slider on top so its thumb is clickable when handles overlap */
  .tl-range-max {
    z-index: 2;
  }

  .tl-range-min {
    z-index: 1;
  }

  /* When handles overlap near the left, min should win */
  .tl-range-min::-webkit-slider-thumb {
    z-index: 3;
  }

  /* Inputs pinned to left and right at the bottom of the histogram */
  .tl-ends {
    @apply flex justify-between;
  }

  .tl-year-box {
    @apply w-14 text-[11px] px-1 py-1 rounded border border-primary/30 bg-white/80 font-mono text-center;
    -moz-appearance: textfield;
  }

  .tl-year-box::-webkit-inner-spin-button,
  .tl-year-box::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
</style>
