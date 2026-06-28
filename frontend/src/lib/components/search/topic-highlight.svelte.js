// Shared topic-map state, produced by GeoClusterMap and read by the result
// cards, the detail panel and the pager. A reactive singleton avoids drilling
// these through `bind:` across the whole search subtree (the pager is a plain
// class, so context wouldn't reach it anyway).
//
// Only ever written in the browser (topic modelling is client-only), so it
// stays at its defaults during SSR — no cross-request state leak.
export const topicHighlight = $state({
  // docKey → that document's dominant-topic terms (for highlighting)
  termsByDoc: {},
  // Set of docKeys for the cluster opened in the map (null = none selected)
  docKeys: null,
});
