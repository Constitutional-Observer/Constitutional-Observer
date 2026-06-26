// Shared text-highlighting for search results.
//
// Two overlaid highlight layers:
//  1. Query terms — Meilisearch wraps matches in <strong>…</strong>. We escape
//     all other HTML and restore only those tags (rendered amber via CSS).
//  2. Topic terms — the document's dominant LDA topic words. We wrap their
//     occurrences in <span class="topic-hl"> (rendered as a teal underline,
//     styled globally in app.css since the markup is injected via {@html}).

// Escape HTML, then restore the Meilisearch <strong> query-highlight tags.
export function escapeRestoreStrong(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;strong&gt;/g, "<strong>")
    .replace(/&lt;\/strong&gt;/g, "</strong>");
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// One case-insensitive regex matching any topic term. Merged phrases carry
// underscores ("right_to_information") which we turn back into spaces to match
// surface text. Longest terms first so phrases win over their component words.
function buildTopicRegex(terms) {
  const cleaned = [
    ...new Set(
      (terms || [])
        .map((t) => String(t).replace(/_/g, " ").trim().toLowerCase())
        .filter((t) => t.length >= 3),
    ),
  ].sort((a, b) => b.length - a.length);
  if (!cleaned.length) return null;
  return new RegExp(`\\b(${cleaned.map(escapeRegex).join("|")})\\b`, "gi");
}

// Wrap topic-term occurrences in already-built highlight HTML, leaving the
// <strong> query tags untouched (we only transform the text between tags).
export function applyTopicHighlight(html, terms) {
  const re = buildTopicRegex(terms);
  if (!re) return html;
  return html
    .split(/(<\/?strong>)/)
    .map((seg) =>
      seg === "<strong>" || seg === "</strong>"
        ? seg
        : seg.replace(re, '<span class="topic-hl">$1</span>'),
    )
    .join("");
}

// Combined: query-term highlight + topic-term highlight. `terms` is the list of
// the document's topic terms (may be empty/omitted to highlight queries only).
export function renderHighlight(text, terms) {
  return applyTopicHighlight(escapeRestoreStrong(text), terms);
}
