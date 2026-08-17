import { MEILI_HOST, MEILI_KEY } from "$env/static/private";
import { Meilisearch } from "meilisearch";
import SEARCH_INDICES from "$lib/data/indices.json";

const client = new Meilisearch({ host: MEILI_HOST, apiKey: MEILI_KEY });

export { SEARCH_INDICES };
export const INDEX_BY_UID = Object.fromEntries(SEARCH_INDICES.map((i) => [i.uid, i]));
export const SEARCH_INDEX_UIDS = SEARCH_INDICES.map((i) => i.uid);
export const COLLECTIONS = [...new Set(SEARCH_INDICES.map((i) => i.collection))].sort();

// A hit's display label: its state, or the body name for indices without one.
export function sourceLabel(uid) {
  const reg = INDEX_BY_UID[uid];
  return reg ? reg.state || reg.label : "Unknown";
}

const FIELD_FALLBACK = { searchField: "__discussions", titleField: "title_en" };
export const fieldsOf = (uid) => ({ ...FIELD_FALLBACK, ...(INDEX_BY_UID[uid] || {}) });
const searchFieldOf = (uid) => INDEX_BY_UID[uid]?.searchField || FIELD_FALLBACK.searchField;

// The document id is the chunk id with its trailing `_<chunk_id>` removed. It is
// unique across indices and is the id /api/document fetches a document by.
export const baseDocId = (idLike) => String(idLike ?? "").replace(/_\d+$/, "");

export const DEFAULT_SEARCH_PARAMS = {
  hybrid: false,
  semanticRatio: 0.5,
  embedder: "LLAMA_PROVIDER",
  limit: 100,
  scoreThreshold: 0.1,
};

// Read search parameters from the request URL, falling back to defaults. Uses
// Number.isFinite so an explicit 0 (e.g. semanticRatio=0, keyword-only) is kept
// rather than being replaced by the default.
export function parseSearchParams(url) {
  const num = (key, fallback) => {
    const v = parseFloat(url.searchParams.get(key));
    return Number.isFinite(v) ? v : fallback;
  };
  const limit = parseInt(url.searchParams.get("limit"), 10);
  return {
    ...DEFAULT_SEARCH_PARAMS,
    hybrid: url.searchParams.get("hybrid") === "true",
    semanticRatio: num("semanticRatio", DEFAULT_SEARCH_PARAMS.semanticRatio),
    scoreThreshold: num("scoreThreshold", DEFAULT_SEARCH_PARAMS.scoreThreshold),
    limit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_SEARCH_PARAMS.limit,
    offset: num("offset", 0),
  };
}

// The index uids to search: the `?indices=` subset restricted to registered
// indices, or all registered indices when absent or empty after filtering.
export function resolveSearchUids(url) {
  const selected = url.searchParams.get("indices");
  if (!selected) return SEARCH_INDEX_UIDS;
  const uids = selected.split(",").filter((uid) => INDEX_BY_UID[uid]);
  return uids.length ? uids : SEARCH_INDEX_UIDS;
}

// Doc counts and embedder info for every registry entry, cached for the TTL.
// The in-flight promise is cached, so concurrent callers share one fetch and a
// failure is not cached. An index that is missing or errors is returned flagged
// `missing` with zero documents rather than dropped.
const INDEX_DETAILS_TTL = 60_000;
let indexDetailsCache = null;

export function fetchIndicesWithDetails({ force = false } = {}) {
  const now = Date.now();
  if (!force && indexDetailsCache && now - indexDetailsCache.at < INDEX_DETAILS_TTL) {
    return indexDetailsCache.promise;
  }
  const promise = loadIndexDetails().catch((err) => {
    indexDetailsCache = null; // never cache a failure
    throw err;
  });
  indexDetailsCache = { at: now, promise };
  return promise;
}

async function loadIndexDetails() {
  return await Promise.all(
    SEARCH_INDICES.map(async (reg) => {
      const base = {
        ...reg,
        numberOfDocuments: 0,
        isIndexing: false,
        semanticSearch: false,
        embedders: [],
        missing: false,
      };
      try {
        const [embedders, stats] = await Promise.all([
          client.index(reg.uid).getEmbedders(),
          client.index(reg.uid).getStats(),
        ]);
        const embedderEntries = embedders && typeof embedders === "object" ? Object.keys(embedders) : [];
        return {
          ...base,
          numberOfDocuments: stats?.numberOfDocuments || 0,
          isIndexing: stats?.isIndexing || false,
          semanticSearch: embedderEntries.length > 0,
          embedders: embedderEntries,
        };
      } catch (err) {
        console.error(`Index ${reg.uid} unavailable:`, err.message);
        return { ...base, missing: true };
      }
    })
  );
}

// Run one multi-search across the given indices and return flattened, annotated
// hits. Per-index details decide hybrid eligibility, so they are fetched only
// for a hybrid search — on a cold cache that is 2 requests per index, and a
// keyword search would otherwise wait for all of them before querying.
export async function searchIndices(indexUids, query, params = DEFAULT_SEARCH_PARAMS) {
  const metaByUid = params.hybrid
    ? Object.fromEntries((await fetchIndicesWithDetails()).map((d) => [d.uid, d]))
    : {};

  const queries = indexUids.map((uid) => {
    const meta = metaByUid[uid];
    const canHybrid = params.hybrid && meta?.semanticSearch && meta.embedders?.includes(params.embedder);
    const { searchField, titleField, metaFields } = fieldsOf(uid);
    return {
      indexUid: uid,
      q: query,
      ...(canHybrid ? { hybrid: { semanticRatio: params.semanticRatio, embedder: params.embedder } } : {}),
      showRankingScore: true,
      limit: params.limit,
      offset: params.offset || 0,
      attributesToRetrieve: [...new Set([...metaFields, titleField])],
      attributesToHighlight: [searchField],
      highlightPreTag: "<strong>",
      highlightPostTag: "</strong>",
      facets: [],
    };
  });

  try {
    const { results } = await client.multiSearch({ queries });
    const totalOf = (r) => r.estimatedTotalHits ?? r.totalHits ?? 0;
    const totalEstimated = results.reduce((sum, r) => sum + totalOf(r), 0);
    console.log(`multiSearch: ${results.length} indices, totalEstimated=${totalEstimated}, per-index: [${results.map((r) => `${r.indexUid}:${totalOf(r)}`).join(", ")}]`);

    // Labels are per index, so resolve them once per index rather than per hit.
    const hits = results.flatMap((r) => {
      const state = sourceLabel(r.indexUid);
      const collection = INDEX_BY_UID[r.indexUid]?.collection || "Other";
      const { titleField } = fieldsOf(r.indexUid);
      return (r.hits || []).map((hit) => ({
        ...hit,
        state,
        _title: hit[titleField] || "",
        _collection: collection,
        _index: r.indexUid,
      }));
    });
    return { hits, totalEstimated };
  } catch (err) {
    console.error("Multi-search failed:", err.message);
    return { hits: [], totalEstimated: 0 };
  }
}

// Runs the actual index-details fetch + search for the search UI. Shared by
// the blocking load (below) and the streamed load, which calls this without
// awaiting it so the page can render before the search resolves.
async function runSearchLoad({ url }, defaultQuery) {
  const query = url.searchParams.get("query") || defaultQuery;

  // Not awaited here: the index list feeds the filter UI, not the query, so it
  // resolves alongside the search rather than gating it.
  const indicesPromise = fetchIndicesWithDetails();

  if (!query) {
    return {
      debates: [],
      hitCount: 0,
      totalEstimated: 0,
      collections: COLLECTIONS,
      indices: await indicesPromise,
      searchParams: DEFAULT_SEARCH_PARAMS,
    };
  }

  // Serves the first page only; the client pages through the rest via
  // /api/search, so this always starts at offset 0.
  const activeParams = { ...parseSearchParams(url), offset: 0 };
  const searchUids = resolveSearchUids(url);

  console.log(`Search: query="${query}" indices=[${searchUids.join(",")}] hybrid=${activeParams.hybrid} limit=${activeParams.limit}`);
  const searchStart = Date.now();
  const [indicesWithDetails, { hits, totalEstimated }] = await Promise.all([
    indicesPromise,
    searchIndices(searchUids, query, activeParams),
  ]);
  console.log(`Search completed in ${Date.now() - searchStart}ms`);

  const { docs, hitCount } = groupHitsIntoDocs(hits, activeParams.scoreThreshold);
  console.log(`Hits: ${totalEstimated} estimated, ${hits.length} returned, ${hitCount} above threshold (${activeParams.scoreThreshold})`);

  return {
    debates: docs,
    hitCount,
    totalEstimated,
    collections: COLLECTIONS,
    indices: indicesWithDetails,
    searchParams: { ...activeParams, indexes: SEARCH_INDEX_UIDS.length, query },
  };
}

// SSR load for the search UI, shared by the home page and /ask. 
export function makeSearchLoad(defaultQuery = null) {
  return (event) => runSearchLoad(event, defaultQuery);
}

// Same search, but returned as an unawaited promise under `streamed` so
export function makeStreamedSearchLoad(defaultQuery = null) {
  return (event) => ({ streamed: runSearchLoad(event, defaultQuery) });
}

/** Merge the chunk-level hits of a document into one result, keyed by doc id. */
export function groupHitsIntoDocs(hits, scoreThreshold = 0.1) {
  const filtered = hits
    .filter((h) => (h._rankingScore || 0) > scoreThreshold)
    .sort((a, b) => (b._rankingScore || 0) - (a._rankingScore || 0));

  const docMap = new Map();
  for (const hit of filtered) {
    const searchField = searchFieldOf(hit._index);
    const key = baseDocId(hit.id);
    const { _formatted, ...rest } = hit;
    delete rest[searchField];
    const chunk = {
      chunk_id: hit.chunk_id,
      textHL: _formatted?.[searchField] || hit[searchField] || "",
      score: hit._rankingScore,
    };
    if (!docMap.has(key)) {
      docMap.set(key, {
        ...rest,
        // Sent to the client so it and /api/document key the document alike.
        _docId: key,
        _matchedChunks: [chunk],
        _bestScore: hit._rankingScore || 0,
      });
    } else {
      const doc = docMap.get(key);
      doc._matchedChunks.push(chunk);
      if ((hit._rankingScore || 0) > doc._bestScore) {
        doc._bestScore = hit._rankingScore;
        doc._rankingScore = hit._rankingScore;
      }
    }
  }

  const docs = [...docMap.values()]
    .sort((a, b) => (b._bestScore || 0) - (a._bestScore || 0))
    .map((d) => {
      d._matchedChunks.sort((a, b) => (a.chunk_id || 0) - (b.chunk_id || 0));
      return d;
    });

  return { docs, hitCount: filtered.length };
}
