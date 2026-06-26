import { json } from "@sveltejs/kit";
import { MEILI_HOST, MEILI_KEY } from "$env/static/private";

/**
 * GET /api/document?index=state_legislature_debates_tn&file_name=xxx&highlight_chunks=3,7
 * GET /api/document?index=state_legislature_debates_tn&id=12345
 *
 * Fetches all chunks for a document. When `id` is given (e.g. opening a
 * bookmark) the exact Meilisearch document is fetched by primary key first to
 * resolve its file_name, then all sibling chunks are returned.
 */
export async function GET({ url, fetch }) {
  const index = url.searchParams.get("index");
  const id = url.searchParams.get("id");
  let fileName = url.searchParams.get("file_name");
  const highlightChunks = new Set(
    (url.searchParams.get("highlight_chunks") || "").split(",").map(Number).filter(Boolean)
  );

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${MEILI_KEY}`,
  };

  if (!index) {
    return json({ error: "index is required" }, { status: 400 });
  }

  // Resolve file_name from the exact document when only an id is supplied.
  if (!fileName && id) {
    const docResp = await fetch(
      `${MEILI_HOST}/indexes/${index}/documents/${encodeURIComponent(id)}`,
      { headers }
    );
    if (docResp.ok) {
      const doc = await docResp.json();
      fileName = doc?.file_name || null;
    }
  }

  if (!fileName) {
    return json({ error: "file_name or a resolvable id is required" }, { status: 400 });
  }

  // No filter/sort configured on these indexes, so search by file_name as keyword
  const resp = await fetch(`${MEILI_HOST}/indexes/${index}/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      q: fileName,
      limit: 500,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error("Meilisearch doc fetch error:", err);
    return json({ error: "Failed to fetch document" }, { status: 502 });
  }

  const data = await resp.json();

  // Filter to only chunks from this exact file, then sort by chunk_id
  const chunks = (data.hits || [])
    .filter((h) => h.file_name === fileName)
    .sort((a, b) => (a.chunk_id || 0) - (b.chunk_id || 0))
    .map((h) => ({
      chunk_id: h.chunk_id,
      text: h.__discussions || "",
      title_en: h.title_en,
      isHighlighted: highlightChunks.has(h.chunk_id),
    }));

  const first = chunks[0] || {};
  return json({
    chunks,
    total: chunks.length,
    file_name: fileName,
    title_en: first.title_en || null,
  });
}
