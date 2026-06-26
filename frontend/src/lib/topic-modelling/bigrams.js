/**
 * Bigram phrase detection — gensim Phrases-style.
 *
 * What this does
 * --------------
 * Given a corpus of already-tokenized documents, finds pairs of words that
 * occur together more often than chance and merges each such pair into a
 * single underscore-joined token. The output is suitable for any downstream
 * bag-of-words model (LDA, TF-IDF, …) that benefits from phrasal vocab.
 *
 * Algorithm
 * ---------
 * One full pass to count, one full pass to rewrite — O(total tokens).
 *
 *   1. Count every unigram and every adjacent bigram across the corpus.
 *      `unigram[w]` = how many times w appears.
 *      `bigram["a b"]` = how many times "a b" appears adjacently.
 *
 *   2. For each bigram (a, b) score it:
 *
 *          score(a,b) = (count(a,b) − minCount) · N
 *                       ─────────────────────────────
 *                          count(a) · count(b)
 *
 *      Numerator says "they co-occur a lot, relative to corpus size".
 *      Denominator discounts bigrams whose components are themselves
 *      everywhere (e.g. "the X" would always score high without it).
 *      Bigrams scoring ≥ `threshold` are accepted.
 *
 *   3. Walk each document left-to-right. Whenever the next two tokens form
 *      an accepted bigram, emit a single merged token "a_b" and skip ahead
 *      by 2; otherwise emit the current token and advance by 1.
 *
 * Language-agnostic
 * -----------------
 * Bigram counting just looks at adjacent tokens — it doesn't care about
 * script. The catch for languages without lemmatization (Tamil here) is
 * that inflected forms fragment the bigram counts, so meaningful phrases
 * may not clear the threshold. Lowering `minCount` helps a bit.
 *
 * Not related to LDA
 * ------------------
 * This runs BEFORE LDA. LDA stays pure bag-of-words; the only change it
 * sees is that some of its "words" happen to be two-word phrases.
 *
 * @param {string[][]} docs  Tokenized documents (each = array of lemmas).
 * @param {object} [opts]
 * @param {number} [opts.minCount=3]    Minimum bigram occurrences to consider.
 * @param {number} [opts.threshold=10]  Collocation score cutoff.
 * @param {number} [opts.maxExamples=12] How many merged bigrams to surface as samples.
 * @returns {{ docs: string[][], merged: number, kept: number, examples: string[] }}
 *   docs:     rewritten token streams with bigrams merged
 *   merged:   total number of in-doc merges performed
 *   kept:     number of distinct bigrams that cleared the threshold
 *   examples: a sample of the merged forms (for the stats UI)
 */
export function detectAndMergeBigrams(docs, opts = {}) {
  const minCount = opts.minCount ?? 3;
  const threshold = opts.threshold ?? 10;
  const maxExamples = opts.maxExamples ?? 12;

  // ── Pass 1: count unigrams and adjacent bigrams ──
  const unigram = new Map();
  const bigram = new Map();
  let N = 0;
  for (const doc of docs) {
    N += doc.length;
    for (let i = 0; i < doc.length; i++) {
      unigram.set(doc[i], (unigram.get(doc[i]) || 0) + 1);
      if (i + 1 < doc.length) {
        const key = doc[i] + " " + doc[i + 1];
        bigram.set(key, (bigram.get(key) || 0) + 1);
      }
    }
  }

  // ── Score and select bigrams above threshold ──
  // (Could also score by PMI; this matches gensim's default formula.)
  const keep = new Set();
  const scored = [];
  for (const [key, count] of bigram) {
    if (count < minCount) continue;
    const sp = key.indexOf(" ");
    const a = key.slice(0, sp);
    const b = key.slice(sp + 1);
    const ca = unigram.get(a) || 0;
    const cb = unigram.get(b) || 0;
    if (ca === 0 || cb === 0) continue;
    const score = ((count - minCount) * N) / (ca * cb);
    if (score >= threshold) {
      keep.add(key);
      scored.push({ key, score });
    }
  }

  if (keep.size === 0) {
    return { docs, merged: 0, kept: 0, examples: [] };
  }

  // Build the sample list from the highest-scoring bigrams.
  scored.sort((a, b) => b.score - a.score);
  const examples = scored.slice(0, maxExamples).map(s => s.key.replace(" ", "_"));

  // ── Pass 2: rewrite token streams, greedy left-to-right ──
  let mergedTotal = 0;
  const rewritten = docs.map((doc) => {
    const out = [];
    let i = 0;
    while (i < doc.length) {
      if (i + 1 < doc.length) {
        const key = doc[i] + " " + doc[i + 1];
        if (keep.has(key)) {
          out.push(doc[i] + "_" + doc[i + 1]);
          mergedTotal++;
          i += 2;
          continue;
        }
      }
      out.push(doc[i]);
      i++;
    }
    return out;
  });

  return { docs: rewritten, merged: mergedTotal, kept: keep.size, examples };
}

export default detectAndMergeBigrams;
