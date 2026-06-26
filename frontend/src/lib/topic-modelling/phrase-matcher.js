/**
 * Lexicon-based phrase matcher.
 *
 * Greedy longest-match over a token stream against a trie of curated
 * multi-word phrases. Designed to compose with downstream statistical
 * bigram detection: the lexicon catches *known* domain phrases reliably,
 * the bigram detector then catches *emergent* ones not in the list.
 *
 * Use:
 *   import { compileTrie, applyPhrases } from "$lib/phrase-matcher.js";
 *   const trie = compileTrie(["right to information", "fundamental rights", …]);
 *   const out  = applyPhrases(tokens, trie);
 *   // out.tokens     — emitted stream (matched runs joined as "a_b_c")
 *   // out.fromPhrase — parallel: true if out.tokens[i] is a merged phrase
 *   // out.srcIdx     — parallel: original index in `tokens` (−1 for merges)
 *   // out.matched    — count of merges performed
 *
 * The caller decides whether to filter non-phrase tokens (POS, stopwords, …)
 * — `srcIdx` keeps the alignment back to the input so per-token drop flags
 * can be re-applied after matching.
 */

const END = Symbol("phrase_end");

/**
 * Build a trie from an array of phrase strings.
 * Phrases are lowercased, split on whitespace, normalised; entries with
 * fewer than two tokens are skipped (they'd match a single word — pointless).
 *
 * @param {string[]} phrases
 * @returns {{ root: Map, count: number }}  count = distinct phrases admitted
 */
export function compileTrie(phrases) {
  const root = new Map();
  let count = 0;
  for (const phrase of phrases) {
    const toks = phrase.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (toks.length < 2) continue;
    let node = root;
    for (const t of toks) {
      if (!node.has(t)) node.set(t, new Map());
      node = node.get(t);
    }
    node.set(END, toks.join("_"));
    count++;
  }
  return { root, count };
}

/**
 * Walk `tokens` left-to-right; at each position try to extend the trie as
 * far as possible, remember the longest terminal seen, and emit either the
 * matched merged token (skipping past the match) or the single raw token.
 *
 * @param {string[]} tokens
 * @param {Map} trie  the `root` field returned by compileTrie()
 */
export function applyPhrases(tokens, trie) {
  const out = [], fromPhrase = [], srcIdx = [];
  let matched = 0;
  let i = 0;
  while (i < tokens.length) {
    let node = trie;
    let longestEnd = -1, longestMerged = null;
    for (let j = i; j < tokens.length; j++) {
      const next = node.get(tokens[j]);
      if (!next) break;
      node = next;
      const merged = node.get(END);
      if (merged !== undefined) { longestEnd = j; longestMerged = merged; }
    }
    if (longestEnd >= 0) {
      out.push(longestMerged); fromPhrase.push(true); srcIdx.push(-1);
      matched++;
      i = longestEnd + 1;
    } else {
      out.push(tokens[i]); fromPhrase.push(false); srcIdx.push(i);
      i++;
    }
  }
  return { tokens: out, fromPhrase, srcIdx, matched };
}
