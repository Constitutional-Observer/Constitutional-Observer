import { fetchIndicesWithDetails, searchIndices, groupHitsIntoDocs, DEFAULT_SEARCH_PARAMS } from "$lib/server/search.js";

export const load = async ({ url }) => {
  const query = url.searchParams.get("query");

  const startTime = Date.now();
  const indicesWithDetails = await fetchIndicesWithDetails();
  console.log(`Loaded ${indicesWithDetails.length} indices in ${Date.now() - startTime}ms`);

  const collectionSet = new Set();
  for (const idx of indicesWithDetails) {
    collectionSet.add(idx.collection);
  }
  const collections = [...collectionSet].sort();
  const allIndexUids = indicesWithDetails.map((idx) => idx.uid);

  if (!query) {
    return {
      debates: [],
      hitCount: 0,
      totalEstimated: 0,
      collections,
      indices: indicesWithDetails,
      searchParams: DEFAULT_SEARCH_PARAMS,
    };
  }

  const hybrid = url.searchParams.get("hybrid") === "true";
  const semanticRatio = parseFloat(url.searchParams.get("semanticRatio")) || DEFAULT_SEARCH_PARAMS.semanticRatio;
  const limit = parseInt(url.searchParams.get("limit")) || DEFAULT_SEARCH_PARAMS.limit;
  const scoreThreshold = parseFloat(url.searchParams.get("scoreThreshold")) || DEFAULT_SEARCH_PARAMS.scoreThreshold;

  const activeParams = { ...DEFAULT_SEARCH_PARAMS, hybrid, semanticRatio, limit, scoreThreshold, offset: 0 };

  const selectedParam = url.searchParams.get("indices");
  const searchUids = selectedParam
    ? selectedParam.split(",").filter((uid) => allIndexUids.includes(uid))
    : allIndexUids;

  const indexMetaMap = {};
  for (const idx of indicesWithDetails) {
    indexMetaMap[idx.uid] = idx;
  }

  console.log(`Search: query="${query}" indices=[${searchUids.join(",")}] hybrid=${activeParams.hybrid} limit=${activeParams.limit}`);
  const searchStart = Date.now();
  const { hits, totalEstimated } = await searchIndices(searchUids, query, activeParams, indexMetaMap);
  console.log(`Search completed in ${Date.now() - searchStart}ms`);

  const { docs, hitCount } = groupHitsIntoDocs(hits, scoreThreshold);
  console.log(`Hits: ${totalEstimated} estimated, ${hits.length} returned, ${hitCount} above threshold (${scoreThreshold})`);

  return {
    debates: structuredClone(docs),
    hitCount,
    totalEstimated,
    collections,
    indices: indicesWithDetails,
    searchParams: { ...activeParams, indexes: allIndexUids.length, query },
  };
};
