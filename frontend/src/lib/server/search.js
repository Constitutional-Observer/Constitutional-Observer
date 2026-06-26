import { MEILI_HOST, MEILI_KEY } from "$env/static/private";
import { Meilisearch } from "meilisearch";

const client = new Meilisearch({ host: MEILI_HOST, apiKey: MEILI_KEY });

export const STATE_CODE_TO_NAME = {
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

export const DEFAULT_SEARCH_PARAMS = {
  hybrid: false,
  semanticRatio: 0.5,
  embedder: "LLAMA_PROVIDER",
  limit: 200,
  scoreThreshold: 0.1,
};

const COLLECTION_MAP = {
  state_legislature_debates: "State Legislatures",
  constituent_assembly_debates: "Constituent Assembly",
  lok_sabha_debates: "Lok Sabha",
  rajya_sabha_debates: "Rajya Sabha",
  court_judgements: "Court Judgements",
};

export function deriveCollection(uid) {
  for (const [prefix, name] of Object.entries(COLLECTION_MAP)) {
    if (uid.startsWith(prefix)) return name;
  }
  return uid.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export async function fetchIndicesWithDetails() {
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
            uid: idx.uid, primaryKey: idx.primaryKey, createdAt: idx.createdAt, updatedAt: idx.updatedAt,
            collection: deriveCollection(idx.uid), numberOfDocuments: 0, isIndexing: false, semanticSearch: false, embedders: [],
          };
        }
      })
    );
  } catch (err) {
    console.error("Failed to fetch indices:", err.message);
    return [];
  }
}

export async function searchIndices(indexUids, query, params = DEFAULT_SEARCH_PARAMS, indexMetaMap = {}) {
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
      // Only highlight the field we actually display. ["*"] makes Meilisearch
      // render a highlighted copy of every attribute of every hit, which (×200
      // hits × all indices) bloats the payload into megabytes.
      attributesToHighlight: ["__discussions"],
      highlightPreTag: "<strong>",
      highlightPostTag: "</strong>",
      facets: [],
    };
  });

  try {
    const { results } = await client.multiSearch({ queries });
    const totalEstimated = results.reduce((sum, r) => sum + (r.estimatedTotalHits || r.totalHits || r.nbHits || 0), 0);
    console.log(`multiSearch: ${results.length} indices, totalEstimated=${totalEstimated}, per-index: [${results.map(r => `${r.indexUid}:${r.estimatedTotalHits ?? r.totalHits ?? r.nbHits ?? '?'}`).join(', ')}]`);
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

/** Group raw hits into merged documents by index+file_name */
export function groupHitsIntoDocs(hits, scoreThreshold = 0.1) {
  const filtered = hits
    .filter((h) => (h._rankingScore || 0) > scoreThreshold)
    .sort((a, b) => (b._rankingScore || 0) - (a._rankingScore || 0));

  const docMap = new Map();
  for (const hit of filtered) {
    const key = `${hit._index}:${hit.file_name}`;
    // `text` is the raw chunk (used by the client-side NLP/topic pipeline);
    // `textHL` carries Meilisearch's <strong>-highlighted query terms for display.
    // Pull `_formatted` out of the spread so the heavy highlight blob is not
    // shipped to the client — we only keep the highlighted __discussions.
    const { _formatted, ...rest } = hit;
    const chunk = {
      chunk_id: hit.chunk_id,
      text: hit.__discussions || "",
      textHL: _formatted?.__discussions || hit.__discussions || "",
      score: hit._rankingScore,
    };
    if (!docMap.has(key)) {
      docMap.set(key, {
        ...rest,
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
