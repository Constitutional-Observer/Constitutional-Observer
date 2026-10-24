import {
  searchIndices,
  groupHitsIntoDocs,
  parseSearchParams,
  resolveSearchUids,
} from "#lib/server/search.js";

// Paged search endpoint. The SSR load serves the first page; the client fetches
// subsequent pages here (with ?offset=).
export async function GET({ url, request }) {
  const query = url.searchParams.get("query");
  if (!query) return Response.json({ docs: [], hitCount: 0, totalEstimated: 0 });

  const params = parseSearchParams(url);
  const { hits, totalEstimated } = await searchIndices(resolveSearchUids(url), query, params, request.signal);
  const { docs, hitCount } = groupHitsIntoDocs(hits, params.scoreThreshold);

  return Response.json({ docs, hitCount, totalEstimated });
}
