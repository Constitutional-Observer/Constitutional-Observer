import { json } from "@sveltejs/kit";
import { fetchIndicesWithDetails, searchIndices, groupHitsIntoDocs, deriveCollection, DEFAULT_SEARCH_PARAMS } from "$lib/server/search.js";

export async function GET({ url }) {
  const query = url.searchParams.get("query");
  if (!query) return json({ docs: [], hitCount: 0, totalEstimated: 0 });

  const hybrid = url.searchParams.get("hybrid") === "true";
  const semanticRatio = parseFloat(url.searchParams.get("semanticRatio")) || DEFAULT_SEARCH_PARAMS.semanticRatio;
  const limit = parseInt(url.searchParams.get("limit")) || DEFAULT_SEARCH_PARAMS.limit;
  const scoreThreshold = parseFloat(url.searchParams.get("scoreThreshold")) || DEFAULT_SEARCH_PARAMS.scoreThreshold;
  const offset = parseInt(url.searchParams.get("offset")) || 0;

  const params = { ...DEFAULT_SEARCH_PARAMS, hybrid, semanticRatio, limit, scoreThreshold, offset };

  const indicesWithDetails = await fetchIndicesWithDetails();
  const allIndexUids = indicesWithDetails.map((idx) => idx.uid);

  const selectedParam = url.searchParams.get("indices");
  const searchUids = selectedParam
    ? selectedParam.split(",").filter((uid) => allIndexUids.includes(uid))
    : allIndexUids;

  const indexMetaMap = {};
  for (const idx of indicesWithDetails) {
    indexMetaMap[idx.uid] = idx;
  }

  const { hits, totalEstimated } = await searchIndices(searchUids, query, params, indexMetaMap);
  const { docs, hitCount } = groupHitsIntoDocs(hits, scoreThreshold);

  return json({ docs, hitCount, totalEstimated });
}
