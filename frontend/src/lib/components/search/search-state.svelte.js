// Every piece of state the search page shares across components, in one module.
// A reactive singleton avoids drilling these through `bind:` across the whole
// subtree — the pager and the view models are plain classes, so context would not
// reach them anyway.
//
//   searchBox / searchParams / ui   the query and how it is run
//   docFormat                       how a hit is named, keyed and dated
//   topicHighlight                  what the topic model found, per document
//   viewNav                         which view of the results is open
//
// Only ever written in the browser (topic modelling and navigation are both
// client-only), so these stay at their defaults during SSR — no cross-request leak.

import { chunkText, chunkSnippet } from "$lib/highlight.js";

export const searchBox = $state({ query: "" });
export const ui = $state({ showBookmarks: false });
class SearchParams {
  hybrid = $state(false);
  semanticRatio = $state(0.5);
  limit = $state(200);
  scoreThreshold = $state(0.45);
  indexIds = $state(new Set());

  build(query) {
    const params = new URLSearchParams({
      query,
      hybrid: String(this.hybrid),
      semanticRatio: String(this.semanticRatio),
      limit: String(this.limit),
      scoreThreshold: String(this.scoreThreshold),
    });
    if (this.indexIds.size > 0)
      params.set("indices", [...this.indexIds].join(","));
    return params;
  }
}

export const searchParams = new SearchParams();

// ---------------------------------------------------------------------------
// docFormat — how a hit is named, keyed and dated. Shared by every search view
// and the result/detail panels, so the grid, the topic plot, the timeline and a
// bookmark can never disagree about which document they are pointing at.
// ---------------------------------------------------------------------------

const PREVIEW_CHARS = 150;
const isYear = (y) => Number.isFinite(y) && y >= 1800;
const isMonth = (m) => Number.isFinite(m) && m >= 1 && m <= 12;
const isDay = (d) => Number.isFinite(d) && d >= 1 && d <= 31;


const docKey = (hit) =>
  hit?._docId || String(hit?.id ?? hit?.docId ?? "").replace(/_\d+$/, "");

// UTC midnight for a hit's date, or null when it carries no usable year. Month
// is 1-based in the index. A missing month or day falls back to 1 January, so
// hitDateLabel must not print the parts that were guessed.
const hitTime = (hit) => {
  const y = Number(hit?.year);
  if (!isYear(y)) return null;
  const m = Number(hit.month);
  const d = Number(hit.day);
  return Date.UTC(y, isMonth(m) ? m - 1 : 0, isDay(d) ? d : 1);
};

/** @type {Intl.DateTimeFormatOptions} */
const YEAR_OPTS = { timeZone: "UTC", year: "numeric" };
/** @type {Intl.DateTimeFormatOptions} */
const MONTH_OPTS = { ...YEAR_OPTS, month: "long" };
/** @type {Intl.DateTimeFormatOptions} */
const DAY_OPTS = { ...MONTH_OPTS, weekday: "long", day: "numeric" };

const hitDateLabel = (hit) => {
  const t = hitTime(hit);
  if (t === null) return null;
  const m = isMonth(Number(hit.month));
  const opts = m && isDay(Number(hit.day)) ? DAY_OPTS : m ? MONTH_OPTS : YEAR_OPTS;
  return new Date(t).toLocaleDateString("en-GB", opts);
};

export const docFormat = {
  docKey,
  hitTime,
  hitDateLabel,

  humanTerm(term) {
    const s = String(term).replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  },

  hitExcerpt(hit) {
    return chunkSnippet(hit?._matchedChunks?.[0]);
  },

  hitPreview(hit) {
    const text = chunkText(hit?._matchedChunks?.[0]);
    return text.length > PREVIEW_CHARS ? text.slice(0, PREVIEW_CHARS) + "..." : text;
  },

  // Sortable YYYY-MM-DD, or null. What bookmarks persist.
  hitDate(hit) {
    if (!isYear(Number(hit?.year))) return null;
    const m = String(hit.month || 1).padStart(2, "0");
    const d = String(hit.day || 1).padStart(2, "0");
    return `${hit.year}-${m}-${d}`;
  },

  hitTitle(hit, i = 0) {
    const title = hit?._title ? String(hit._title).toLowerCase() : `document ${i + 1}`;
    const date = hitDateLabel(hit);
    return date ? `On ${date} · ${title}` : title;
  },
};

// ---------------------------------------------------------------------------
// topicHighlight — what the topic model found, published by the view shell and
// read by the result cards, the detail panel and the pager.
// ---------------------------------------------------------------------------

export const topicHighlight = $state({
  // docKey → union of every above-threshold topic's terms for that document
  // (a doc can belong to several topics; highlighting overlays them all)
  termsByDoc: {},
  // docKey → [{ topic, prob, terms }] every topic the document belongs to,
  // strongest-first (drives the detail panel's topic list)
  topicsByDoc: {},
  // Set of docKeys for the cluster opened in the map (null = none selected)
  docKeys: null,
});

// ---------------------------------------------------------------------------
// topicTerms — every topic's terms pooled across all sources, ranked by how many
// documents carry them. Published by the view shell (the only place that holds
// the per-source pipelines) and read by the suggestion rail.
// ---------------------------------------------------------------------------

export const topicTerms = $state({
  /** @type {{ term: string, label: string, docs: number, topics: number, sources: string[] }[]} */
  ranked: [],
  topics: 0,
  sources: 0,
});

// ---------------------------------------------------------------------------
// viewNav — which view of the results is open, and how deep. Two levels, the
// second the child of the first:
//
//   sources   the grid of source indices          "All results for …"
//   topic     one topic's RadViz projection       "Land acquisition · compensation"
//
// When a topic is open, the band under its projection is what says when it was
// discussed, so time is a layer of that view rather than a level of its own.
// ---------------------------------------------------------------------------

const LEVELS = ["sources", "topic"];

class ViewNav {
  level = $state("sources");
  /** @type {{ groupKey: string, idx: number } | null} */
  topic = $state(null); // idx indexes into that group's clusters

  // The rendered trail, published by the view shell — it is the only place that can
  // name a topic, since the wording comes from the pipeline's λ-ranked terms. Held
  // here so the crumbs can be drawn anywhere on the page, not only above the map.
  /** @type {{ key: string, label: string, sub?: string, current?: boolean, disabled?: boolean }[]} */
  trail = $state([]);

  get depth() {
    return LEVELS.indexOf(this.level);
  }
  get atRoot() {
    return this.level === "sources";
  }

  isTopic(groupKey, idx) {
    return this.topic?.groupKey === groupKey && this.topic?.idx === idx;
  }

  // Clicking the open topic again closes it, as the grid has always done.
  openTopic(groupKey, idx) {
    if (this.level === "topic" && this.isTopic(groupKey, idx)) {
      this.clear();
      return;
    }
    this.topic = { groupKey, idx };
    this.level = "topic";
  }

  to(level) {
    if (level === "sources") this.clear();
    else if (this.topic && LEVELS.includes(level)) this.level = level;
  }

  pop() {
    this.to(LEVELS[Math.max(0, this.depth - 1)]);
  }

  clear() {
    this.topic = null;
    this.level = "sources";
  }
}

export const viewNav = new ViewNav();
