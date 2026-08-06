// Shared text-highlighting for search results.
//
// Two overlaid highlight layers:
//  1. Query terms — Meilisearch wraps matches in <strong>…</strong>. We escape
//     all other HTML and restore only those tags (rendered amber via CSS).
//  2. Topic terms — the document's dominant LDA topic words. We wrap their
//     occurrences in <span class="topic-hl"> (rendered as a teal underline,
//     styled globally in app.css since the markup is injected via {@html}).

export const stripHighlight = (html) => String(html || "").replace(/<\/?strong>/g, "");
export const chunkText = (chunk) => chunk?.text ?? stripHighlight(chunk?.textHL);

export const SNIPPET_WORDS = 20;

export function cropHighlight(html, words = SNIPPET_WORDS) {
  const src = String(html || "");
  if (!src) return "";

  const toks = [];
  let ws = false;
  for (const part of src.split(/(<\/?strong>)/)) {
    if (part === "<strong>" || part === "</strong>") {
      toks.push({ tag: part, ws });
      ws = false;
      continue;
    }
    for (const piece of part.split(/(\s+)/)) {
      if (!piece) continue;
      if (/^\s+$/.test(piece)) ws = true;
      else {
        toks.push({ word: piece, ws });
        ws = false;
      }
    }
  }

  const total = toks.reduce((n, t) => n + (t.word ? 1 : 0), 0);
  if (total <= words) return src;

  let before = 0;
  for (const t of toks) {
    if (t.tag === "<strong>") break;
    if (t.word) before++;
  }
  const start = Math.max(0, Math.min(before - Math.floor(words / 3), total - words));
  const end = start + words;

  let out = "";
  let seen = 0;
  let openBefore = false;
  let open = false;
  for (const t of toks) {
    const inWindow = seen >= start && seen < end;
    if (t.tag) {
      if (inWindow) {
        if (t.ws && out) out += " ";
        out += t.tag;
        open = t.tag === "<strong>";
      } else if (seen < start) {
        openBefore = t.tag === "<strong>";
      }
      continue;
    }
    if (inWindow) {
      if (t.ws && out) out += " ";
      out += t.word;
    }
    seen++;
    if (seen >= end) break;
  }

  if (openBefore) out = "<strong>" + out;
  if (open) out += "</strong>";
  return (start > 0 ? "…" : "") + out + (end < total ? "…" : "");
}

export const chunkSnippet = (chunk, words = SNIPPET_WORDS) =>
  cropHighlight(chunk?.textHL ?? chunk?.text, words);

export function markQuery(text, query) {
  const src = String(text || "");
  const terms = [
    ...new Set(
      String(query || "")
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 3),
    ),
  ].sort((a, b) => b.length - a.length);
  if (!src || !terms.length) return src;
  const re = new RegExp(`\\b(${terms.map(escapeRegex).join("|")})`, "gi");
  return src.replace(re, "<strong>$1</strong>");
}

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
export function applyTopicHighlight(html, terms, clickable) {
  const re = buildTopicRegex(terms);
  if (!re) return html;
  const open = clickable ? '<button type="button" class="hl-btn topic-hl">' : '<span class="topic-hl">';
  const close = clickable ? "</button>" : "</span>";
  return html
    .split(/(<\/?strong>)/)
    .map((seg) =>
      seg === "<strong>" || seg === "</strong>"
        ? seg
        : seg.replace(re, `${open}$1${close}`),
    )
    .join("");
}

// Combined: query-term highlight + topic-term highlight. `terms` is the list of
// the document's topic terms (may be empty/omitted to highlight queries only).
export function renderHighlight(text, terms, clickable = false) {
  const html = applyTopicHighlight(escapeRestoreStrong(text), terms, clickable);
  return clickable
    ? html
        .replace(/<strong>/g, '<button type="button" class="hl-btn query-hl">')
        .replace(/<\/strong>/g, "</button>")
    : html
        .replace(/<strong>/g, '<span class="query-hl">')
        .replace(/<\/strong>/g, "</span>");
}
