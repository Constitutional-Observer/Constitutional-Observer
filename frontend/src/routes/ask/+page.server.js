import { MEILI_HOST, MEILI_KEY } from "$env/static/private";

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
  scoreThreshold: 0.58,
};

function meiliHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${MEILI_KEY}`,
  };
}

/** Fetch all indices from Meilisearch */
async function fetchAllIndices(fetch) {
  try {
    const resp = await fetch(`${MEILI_HOST}/indexes?limit=100`, {
      headers: meiliHeaders(),
    });
    if (!resp.ok) {
      console.error("Failed to fetch indices:", resp.status);
      return [];
    }
    const data = await resp.json();
    return data.results || [];
  } catch (err) {
    console.error("Failed to fetch indices:", err.message);
    return [];
  }
}

/** Fetch embedder config and stats for an index */
async function fetchIndexDetails(fetch, uid) {
  try {
    const [embResp, statsResp] = await Promise.all([
      fetch(`${MEILI_HOST}/indexes/${uid}/settings/embedders`, { headers: meiliHeaders() }),
      fetch(`${MEILI_HOST}/indexes/${uid}/stats`, { headers: meiliHeaders() }),
    ]);

    const embedders = embResp.ok ? await embResp.json() : null;
    const stats = statsResp.ok ? await statsResp.json() : null;
    const embedderEntries = embedders && typeof embedders === "object" ? Object.keys(embedders) : [];

    return {
      numberOfDocuments: stats?.numberOfDocuments || 0,
      isIndexing: stats?.isIndexing || false,
      semanticSearch: embedderEntries.length > 0,
      embedders: embedderEntries,
    };
  } catch {
    return { numberOfDocuments: 0, isIndexing: false, semanticSearch: false, embedders: [] };
  }
}

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
  // Fallback: humanize the uid
  return uid.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

async function searchIndex(fetch, index, query, params = SEARCH_PARAMS, indexMeta = null) {
  // Only send hybrid if this index actually has the embedder configured
  const canHybrid = params.hybrid && indexMeta?.semanticSearch && indexMeta.embedders?.includes(params.embedder);

  try {
    const resp = await fetch(`${MEILI_HOST}/indexes/${index}/search`, {
      method: "POST",
      headers: meiliHeaders(),
      body: JSON.stringify({
        q: query,
        ...(canHybrid ? { hybrid: { semanticRatio: params.semanticRatio, embedder: params.embedder } } : {}),
        showRankingScore: true,
        limit: params.limit,
      }),
    });

    if (!resp.ok) {
      console.error(`Meilisearch error for ${index}:`, resp.status);
      return [];
    }

    const data = await resp.json();
    return (data.hits || []).map((hit) => ({
      ...hit,
      state: STATE_CODE_TO_NAME[hit.state_code] || hit.state_code || "Unknown",
      _collection: deriveCollection(index),
      _index: index,
    }));
  } catch (err) {
    console.error(`Failed to search ${index}:`, err.message);
    return [];
  }
}

export const load = async ({ url, fetch }) => {
  const query = url.searchParams.get("query");

  // Fetch all indices and their details from Meilisearch in parallel
  const rawIndices = await fetchAllIndices(fetch);
  const indicesWithDetails = await Promise.all(
    rawIndices.map(async (idx) => {
      const details = await fetchIndexDetails(fetch, idx.uid);
      return {
        uid: idx.uid,
        primaryKey: idx.primaryKey,
        createdAt: idx.createdAt,
        updatedAt: idx.updatedAt,
        collection: deriveCollection(idx.uid),
        ...details,
      };
    })
  );

  // Build dynamic collections from discovered indices
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

  // Allow overriding params from URL
  const hybrid = url.searchParams.get("hybrid") === "true";
  const semanticRatio = parseFloat(url.searchParams.get("semanticRatio")) || SEARCH_PARAMS.semanticRatio;
  const limit = parseInt(url.searchParams.get("limit")) || SEARCH_PARAMS.limit;
  const scoreThreshold = parseFloat(url.searchParams.get("scoreThreshold")) || SEARCH_PARAMS.scoreThreshold;

  const activeParams = { ...SEARCH_PARAMS, hybrid, semanticRatio, limit, scoreThreshold };

  // Only search selected indices (if specified), otherwise all
  const selectedParam = url.searchParams.get("indices");
  const searchUids = selectedParam
    ? selectedParam.split(",").filter((uid) => allIndexUids.includes(uid))
    : allIndexUids;

  // Build lookup for index metadata so searchIndex can check embedder support
  const indexMetaMap = {};
  for (const idx of indicesWithDetails) {
    indexMetaMap[idx.uid] = idx;
  }

  const results = await Promise.all(
    searchUids.map((uid) => searchIndex(fetch, uid, query, activeParams, indexMetaMap[uid]))
  );

  const allHits = results
    .flat()
    .filter((h) => (h._rankingScore || 0) > activeParams.scoreThreshold)
    .sort((a, b) => (b._rankingScore || 0) - (a._rankingScore || 0));

  // Group chunks from the same document (index + file_name)
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

  // Sort merged docs by best score, sort chunks within each doc by chunk_id
  const debates = [...docMap.values()]
    .sort((a, b) => (b._bestScore || 0) - (a._bestScore || 0))
    .map((d) => {
      d._matchedChunks.sort((a, b) => (a.chunk_id || 0) - (b.chunk_id || 0));
      return d;
    });

  return {
    debates: structuredClone(debates),
    sabha: [],
    collections,
    indices: indicesWithDetails,
    searchParams: { ...activeParams, indexes: allIndexUids.length, query },
  };
};
