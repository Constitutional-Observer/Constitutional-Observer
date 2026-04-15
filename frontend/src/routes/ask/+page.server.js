import { MEILI_HOST, MEILI_KEY } from "$env/static/private";

const COLLECTIONS = {
  "State Legislatures": [
    "state_legislature_debates_ap",
    "state_legislature_debates_as",
    "state_legislature_debates_ka",
    "state_legislature_debates_kl",
    "state_legislature_debates_rj",
    "state_legislature_debates_tg",
    "state_legislature_debates_tn",
    "state_legislature_debates_up",
    "state_legislature_debates_wb",
  ],
  // Add future non-state collections here, e.g.:
  // "Constituent Assembly": ["constituent_assembly_debates"],
  // "Lok Sabha": ["lok_sabha_debates"],
};

const ALL_INDEXES = Object.values(COLLECTIONS).flat();

const INDEX_TO_COLLECTION = {};
for (const [collection, indexes] of Object.entries(COLLECTIONS)) {
  for (const idx of indexes) {
    INDEX_TO_COLLECTION[idx] = collection;
  }
}

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

async function searchIndex(fetch, index, query, params = SEARCH_PARAMS) {
  try {
    const resp = await fetch(`${MEILI_HOST}/indexes/${index}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MEILI_KEY}`,
      },
      body: JSON.stringify({
        q: query,
        ...(params.hybrid ? { hybrid: { semanticRatio: params.semanticRatio, embedder: params.embedder } } : {}),
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
      _collection: INDEX_TO_COLLECTION[index] || "Other",
    }));
  } catch (err) {
    console.error(`Failed to search ${index}:`, err.message);
    return [];
  }
}

export const load = async ({ url, fetch }) => {
  const query = url.searchParams.get("query");
  console.log("[load] query:", query);

  const collections = Object.keys(COLLECTIONS);

  if (!query) {
    return { debates: [], sabha: [], collections, searchParams: SEARCH_PARAMS };
  }

  // Allow overriding params from URL
  const hybrid = url.searchParams.get("hybrid") === "true";
  const semanticRatio = parseFloat(url.searchParams.get("semanticRatio")) || SEARCH_PARAMS.semanticRatio;
  const limit = parseInt(url.searchParams.get("limit")) || SEARCH_PARAMS.limit;
  const scoreThreshold = parseFloat(url.searchParams.get("scoreThreshold")) || SEARCH_PARAMS.scoreThreshold;

  const activeParams = { ...SEARCH_PARAMS, hybrid, semanticRatio, limit, scoreThreshold };

  const results = await Promise.all(
    ALL_INDEXES.map((idx) => searchIndex(fetch, idx, query, activeParams))
  );

  const allHits = results.flat()
    .filter((h) => (h._rankingScore || 0) > activeParams.scoreThreshold)
    .sort((a, b) => (b._rankingScore || 0) - (a._rankingScore || 0));

  // Group chunks from the same document (file_name + state_code)
  const docMap = new Map();
  for (const hit of allHits) {
    const key = `${hit.state_code}:${hit.file_name}`;
    if (!docMap.has(key)) {
      docMap.set(key, {
        ...hit,
        // Store matched chunks inline
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
    searchParams: { ...activeParams, indexes: ALL_INDEXES.length, query },
  };
};
