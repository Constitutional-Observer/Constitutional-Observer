import { json } from "@sveltejs/kit";
import {
  searchIndices,
  groupHitsIntoDocs,
  parseSearchParams,
  resolveSearchUids,
} from "$lib/server/search.js";

// Paged search endpoint. The SSR load serves the first page; the client fetches
// subsequent pages here (with ?offset=).
export async function GET({ url }) {
  const query = url.searchParams.get("query");
  if (!query) return json({ docs: [], hitCount: 0, totalEstimated: 0 });

  const params = parseSearchParams(url);
  const { hits, totalEstimated } = await searchIndices(resolveSearchUids(url), query, params);
  const { docs, hitCount } = groupHitsIntoDocs(hits, params.scoreThreshold);

  return json({ docs, hitCount, totalEstimated });
}
