import { json } from "@sveltejs/kit";
import { MEILI_HOST, MEILI_KEY } from "$env/static/private";

/**
 * GET /api/document?index=state_legislature_debates_tn&file_name=xxx&highlight_chunks=3,7
 * Fetches all chunks for a given file_name from the index.
 */
export async function GET({ url, fetch }) {
  const index = url.searchParams.get("index");
  const fileName = url.searchParams.get("file_name");
  const highlightChunks = new Set(
    (url.searchParams.get("highlight_chunks") || "").split(",").map(Number).filter(Boolean)
  );

  if (!index || !fileName) {
    return json({ error: "index and file_name are required" }, { status: 400 });
  }

  // No filter/sort configured on these indexes, so search by file_name as keyword
  const resp = await fetch(`${MEILI_HOST}/indexes/${index}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MEILI_KEY}`,
    },
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

  return json({ chunks, total: chunks.length });
}
