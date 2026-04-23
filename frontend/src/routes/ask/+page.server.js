import { MEILI_HOST, MEILI_KEY } from "$env/static/private";
import { Meilisearch } from "meilisearch";

const client = new Meilisearch({ host: MEILI_HOST, apiKey: MEILI_KEY });

const STATE_CODE_TO_NAME = {
  AP: "Andhra Pradesh",
  AS: "Assam",
  KA: "Karnataka",
  KL: "Kerala",
  RJ: "Rajasthan",
  TG: "Telangana",
  TN: "Tamil Nadu",
  UP: "Uttar Pradesh",
  WB: "West Bengal",
};

const SEARCH_PARAMS = {
  hybrid: false,
  semanticRatio: 0.5,
  embedder: "LLAMA_PROVIDER",
  limit: 50,
  scoreThreshold: 0.1,
};

/** Derive a human-readable collection name from an index uid */
const COLLECTION_MAP = {
  state_legislature_debates: "State Legislatures",
  constituent_assembly_debates: "Constituent Assembly",
  lok_sabha_debates: "Lok Sabha",
  rajya_sabha_debates: "Rajya Sabha",
  court_judgements: "Court Judgements",
};

function deriveCollection(uid) {
  for (const [prefix, name] of Object.entries(COLLECTION_MAP)) {
    if (uid.startsWith(prefix)) return name;
  }
  return uid.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Fetch all indices and their details */
async function fetchIndicesWithDetails() {
  try {
    const { results: rawIndices } = await client.getIndexes({ limit: 100 });

    return await Promise.all(
      rawIndices.map(async (idx) => {
        try {
          const [embedders, stats] = await Promise.all([
            client.index(idx.uid).getEmbedders(),
            client.index(idx.uid).getStats(),
          ]);
          const embedderEntries = embedders && typeof embedders === "object" ? Object.keys(embedders) : [];
          return {
            uid: idx.uid,
            primaryKey: idx.primaryKey,
            createdAt: idx.createdAt,
            updatedAt: idx.updatedAt,
            collection: deriveCollection(idx.uid),
            numberOfDocuments: stats?.numberOfDocuments || 0,
            isIndexing: stats?.isIndexing || false,
            semanticSearch: embedderEntries.length > 0,
            embedders: embedderEntries,
          };
        } catch (err) {
          console.error(`Failed to fetch details for index ${idx.uid}:`, err.message);
          return {
            uid: idx.uid,
            primaryKey: idx.primaryKey,
            createdAt: idx.createdAt,
            updatedAt: idx.updatedAt,
            collection: deriveCollection(idx.uid),
            numberOfDocuments: 0,
            isIndexing: false,
            semanticSearch: false,
            embedders: [],
          };
        }
      })
    );
  } catch (err) {
    console.error("Failed to fetch indices:", err.message);
    return [];
  }
}

async function searchIndices(indexUids, query, params = SEARCH_PARAMS, indexMetaMap = {}) {
  const queries = indexUids.map((uid) => {
    const meta = indexMetaMap[uid];
    const canHybrid = params.hybrid && meta?.semanticSearch && meta.embedders?.includes(params.embedder);
    return {
      indexUid: uid,
      q: query,
      ...(canHybrid ? { hybrid: { semanticRatio: params.semanticRatio, embedder: params.embedder } } : {}),
      showRankingScore: true,
      limit: params.limit,
      offset: params.offset || 0,
      attributesToHighlight: ["*"],
      hitsPerPage: 800,
      highlightPreTag: "<strong>",
      highlightPostTag: "</strong>",
      facets: [],
    };
  });

  try {
    const { results } = await client.multiSearch({ queries });
    const totalEstimated = results.reduce((sum, r) => sum + (r.estimatedTotalHits || 0), 0);
    const hits = results.flatMap((r) =>
      (r.hits || []).map((hit) => ({
        ...hit,
        state: STATE_CODE_TO_NAME[hit.state_code] || hit.state_code || "Unknown",
        _collection: deriveCollection(r.indexUid),
        _index: r.indexUid,
      }))
    );
    return { hits, totalEstimated };
  } catch (err) {
    console.error("Multi-search failed:", err.message);
    return { hits: [], totalEstimated: 0 };
  }
}

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
      sabha: [],
      collections,
      indices: indicesWithDetails,
      searchParams: SEARCH_PARAMS,
    };
  }

  const hybrid = url.searchParams.get("hybrid") === "true";
  const semanticRatio = parseFloat(url.searchParams.get("semanticRatio")) || SEARCH_PARAMS.semanticRatio;
  const limit = parseInt(url.searchParams.get("limit")) || SEARCH_PARAMS.limit;
  const scoreThreshold = parseFloat(url.searchParams.get("scoreThreshold")) || SEARCH_PARAMS.scoreThreshold;
  const offset = parseInt(url.searchParams.get("offset")) || 0;

  const activeParams = { ...SEARCH_PARAMS, hybrid, semanticRatio, limit, scoreThreshold, offset };

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
  const { hits: rawHits, totalEstimated } = await searchIndices(searchUids, query, activeParams, indexMetaMap);
  console.log(`Search completed in ${Date.now() - searchStart}ms`);

  const allHits = rawHits
    .filter((h) => (h._rankingScore || 0) > activeParams.scoreThreshold)
    .sort((a, b) => (b._rankingScore || 0) - (a._rankingScore || 0));
  console.log(`Hits: ${totalEstimated} estimated, ${rawHits.length} returned, ${allHits.length} above threshold (${activeParams.scoreThreshold})`);

  const docMap = new Map();
  for (const hit of allHits) {
    const key = `${hit._index}:${hit.file_name}`;
    if (!docMap.has(key)) {
      docMap.set(key, {
        ...hit,
        _matchedChunks: [{ chunk_id: hit.chunk_id, text: hit.__discussions || "", score: hit._rankingScore }],
        _bestScore: hit._rankingScore || 0,
      });
    } else {
      const doc = docMap.get(key);
      doc._matchedChunks.push({ chunk_id: hit.chunk_id, text: hit.__discussions || "", score: hit._rankingScore });
      if ((hit._rankingScore || 0) > doc._bestScore) {
        doc._bestScore = hit._rankingScore;
        doc._rankingScore = hit._rankingScore;
      }
    }
  }

  const debates = [...docMap.values()]
    .sort((a, b) => (b._bestScore || 0) - (a._bestScore || 0))
    .map((d) => {
      d._matchedChunks.sort((a, b) => (a.chunk_id || 0) - (b.chunk_id || 0));
      return d;
    });

  return {
    debates: structuredClone(debates),
    hitCount: allHits.length,
    totalEstimated,
    collections,
    indices: indicesWithDetails,
    searchParams: { ...activeParams, indexes: allIndexUids.length, query },
  };
};
