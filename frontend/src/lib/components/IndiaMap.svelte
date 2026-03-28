<script>
  import { getStatePositions } from "$lib/india-states.js";
  import { createEventDispatcher } from "svelte";

  export let resultsByState = {}; // { "Tamil Nadu": [...], "Karnataka": [...] }
  export let activeState = null;

  const dispatch = createEventDispatcher();
  const statePositions = getStatePositions();

  // Edge point for drawing arrows (right side of SVG)
  const ARROW_EXIT_X = 350;

  function getRadius(stateName) {
    const count = resultsByState[stateName]?.length || 0;
    if (count === 0) return 4;
    return Math.min(4 + count * 2, 16);
  }

  function handleClick(stateName) {
    dispatch("stateclick", { state: stateName });
  }

  $: activeStates = Object.keys(resultsByState).filter(
    (s) => resultsByState[s]?.length > 0
  );
</script>

<svg
  viewBox="0 0 360 390"
  class="india-map"
  xmlns="http://www.w3.org/2000/svg"
>
  <defs>
    <marker
      id="arrowhead"
      markerWidth="8"
      markerHeight="6"
      refX="8"
      refY="3"
      orient="auto"
    >
      <polygon points="0 0, 8 3, 0 6" fill="#c3b091" />
    </marker>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <!-- Arrow lines from active states to right edge -->
  {#each statePositions as state}
    {#if activeStates.includes(state.name)}
      <line
        x1={state.x}
        y1={state.y}
        x2={ARROW_EXIT_X}
        y2={state.y}
        stroke={activeState === state.name ? "#b8860b" : "#c3b091"}
        stroke-width={activeState === state.name ? 2 : 1}
        stroke-dasharray={activeState === state.name ? "none" : "4 3"}
        opacity={activeState === state.name ? 0.9 : 0.5}
        marker-end="url(#arrowhead)"
        class="arrow-line"
      />
    {/if}
  {/each}

  <!-- State markers -->
  {#each statePositions as state}
    {@const hasResults = activeStates.includes(state.name)}
    {@const isActive = activeState === state.name}
    <g
      class="state-marker"
      class:has-results={hasResults}
      class:is-active={isActive}
      on:click={() => hasResults && handleClick(state.name)}
      on:keydown={(e) => e.key === "Enter" && hasResults && handleClick(state.name)}
      role={hasResults ? "button" : "presentation"}
      tabindex={hasResults ? 0 : -1}
    >
      {#if isActive}
        <circle
          cx={state.x}
          cy={state.y}
          r={getRadius(state.name) + 4}
          fill="none"
          stroke="#b8860b"
          stroke-width="2"
          opacity="0.5"
          class="pulse-ring"
        />
      {/if}
      <circle
        cx={state.x}
        cy={state.y}
        r={getRadius(state.name)}
        fill={isActive ? "#b8860b" : hasResults ? "#c3b091" : "#ddd"}
        stroke={hasResults ? "#8b7355" : "#ccc"}
        stroke-width={hasResults ? 1.5 : 0.5}
        opacity={hasResults ? 1 : 0.4}
        filter={isActive ? "url(#glow)" : "none"}
      />
      <text
        x={state.x}
        y={state.y - getRadius(state.name) - 4}
        text-anchor="middle"
        class="state-label"
        class:label-active={hasResults}
      >
        {state.code}
      </text>
    </g>
  {/each}
</svg>

<style>
  .india-map {
    width: 100%;
    max-width: 360px;
    height: auto;
  }

  .state-marker {
    cursor: default;
    transition: opacity 0.2s;
  }

  .state-marker.has-results {
    cursor: pointer;
  }

  .state-marker.has-results:hover circle {
    filter: url(#glow);
  }

  .state-label {
    font-size: 7px;
    fill: #999;
    font-family: inherit;
    pointer-events: none;
  }

  .label-active {
    fill: #333;
    font-weight: 600;
    font-size: 8px;
  }

  .arrow-line {
    transition: all 0.3s ease;
  }

  .pulse-ring {
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 0.2; }
  }
</style>
