import { json } from "@sveltejs/kit";
import { MEILI_HOST, MEILI_KEY } from "$env/static/private";
import { fieldsOf, baseDocId, INDEX_BY_UID } from "$lib/server/search.js";

/**
 * GET /api/document?index=state_legislature_debates_ls&doc_id=LS_lsd_..._pdf&highlight_chunks=3,7
 * GET /api/document?index=state_legislature_debates_ls&id=LS_lsd_..._pdf_24   (a chunk id)
 *
 * Every chunk of a debate is a separate Meilisearch document whose primary key
 * is `<prefix>_<file>_<chunk_id>`. `file_name` is NOT filterable and a keyword
 * search by file_name is unreliable (it ranks by relevance and the exact file
 * rarely surfaces), so we fetch chunks by primary key instead:
 *   1. strip the trailing _<chunk_id> from the supplied id to get the doc's base
 *   2. fetch `${base}_0, ${base}_1, …` via the documents/fetch endpoint
 * Non-chunked indexes (id has no _<n> suffix) fall back to a single-document get.
 */

const BATCH = 500;        // chunk ids requested per documents/fetch call
const MAX_CHUNKS = 3000;  // hard ceiling so a bad id can't loop forever

export async function GET({ url, fetch }) {
  const index = url.searchParams.get("index");
  const rawId = url.searchParams.get("doc_id") || url.searchParams.get("id");
  const highlightChunks = new Set(
    (url.searchParams.get("highlight_chunks") || "")
      .split(",")
      .map(Number)
      .filter((n) => !Number.isNaN(n)),
  );

  if (!index) return json({ error: "index is required" }, { status: 400 });
  if (!rawId) return json({ error: "doc_id or id is required" }, { status: 400 });
  // Restrict `index` (from the query string) to registered indices.
  if (!INDEX_BY_UID[index]) return json({ error: "unknown index" }, { status: 400 });

  const { searchField, titleField } = fieldsOf(index);
  const FIELDS = ["id", "chunk_id", "file_name", titleField, searchField];

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${MEILI_KEY}`,
  };

  const baseId = baseDocId(rawId);

  // Fetch contiguous chunk ids in batches until a short batch signals the end.
  const results = [];
  for (let start = 0; start < MAX_CHUNKS; start += BATCH) {
    const ids = Array.from({ length: BATCH }, (_, i) => `${baseId}_${start + i}`);
    const resp = await fetch(`${MEILI_HOST}/indexes/${index}/documents/fetch`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ids, limit: BATCH, fields: FIELDS }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error("Meilisearch doc fetch error:", err);
      return json({ error: "Failed to fetch document" }, { status: 502 });
    }
    const data = await resp.json();
    const batch = data.results || [];
    results.push(...batch);
    if (batch.length < BATCH) break; // reached the last chunk
  }

  // Fallback for non-chunked indexes: fetch the single document by its id.
  if (results.length === 0) {
    const docResp = await fetch(
      `${MEILI_HOST}/indexes/${index}/documents/${encodeURIComponent(rawId)}`,
      { headers },
    );
    if (docResp.ok) results.push(await docResp.json());
  }

  const chunks = results
    .sort((a, b) => (a.chunk_id || 0) - (b.chunk_id || 0))
    .map((h) => ({
      chunk_id: h.chunk_id ?? 0,
      text: h[searchField] || "",
      title_en: h[titleField],
      isHighlighted: highlightChunks.has(h.chunk_id),
    }));

  const first = results[0] || {};
  return json({
    chunks,
    total: chunks.length,
    doc_id: baseId,
    file_name: first.file_name || null,
    title_en: first[titleField] || null,
  });
}
