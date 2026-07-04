// Shared topic-map state, produced by GeoClusterMap and read by the result
// cards, the detail panel and the pager. A reactive singleton avoids drilling
// these through `bind:` across the whole search subtree (the pager is a plain
// class, so context wouldn't reach it anyway).
//
// Only ever written in the browser (topic modelling is client-only), so it
// stays at its defaults during SSR — no cross-request state leak.
export const topicHighlight = $state({
  // docKey → union of every above-threshold topic's terms for that document
  // (a doc can belong to several topics; highlighting overlays them all)
  termsByDoc: {},
  // docKey → [{ topic, prob, terms }] every topic the document belongs to,
  // strongest-first (drives the detail panel's topic list)
  topicsByDoc: {},
  // Set of docKeys for the cluster opened in the map (null = none selected)
  docKeys: null,
});
