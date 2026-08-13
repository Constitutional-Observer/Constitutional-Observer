// TopicPipeline — NLP → phrase-merge → seeded-sequential LDA → display clusters.
//
// model(hits, query, tag) tokenizes, detects phrases, runs LDA, buckets documents
// by multi-topic membership and builds `rawClusters` (terms + counts + member
// hits).
//
// radviz(topicId) then lays one topic's documents out in 2-D against the OTHER
// topics as named anchors on a circle: the opened topic is the origin, so how far
// a document sits from the centre is the share of it that is about something else,
// and which way it leans says what. It is a weighted sum, not an optimisation —
// deterministic, O(M·K), and bounded by the unit disc. A topic holds ~20-30
// documents, far too few for t-SNE to say anything the data supports.
//
//   • Preprocessing     — hits → cleaned token docs (NLP, tokenize, phrases).
//   • TopicSequentialLDA — token docs → chosen-K sequential-LDA fit.
//   • TopicLDAViz       — LDA fit → display clusters + LDAvis term ranking.
import { browser } from "$app/environment";
import { TOPIC_STOPWORDS } from "$lib/topic-modelling/topic-stopwords.js";
import { TOPIC_PHRASES, SEED_GROUPS } from "$lib/topic-modelling/topic-phrases.js";
import { applyPhrases } from "$lib/topic-modelling/phrase-matcher.js";
import { chunkText } from "$lib/highlight.js";

// Multi-topic membership floor. A document belongs to every topic it is more than
// this composed of (θ > floor) — no forced dominant topic — so it can sit in
// several clusters.
//
// The floor has to fall with K. θ is smoothed by α = 50/K spread over all topics
// (see TopicSequentialLDA.#ldaOpts), so it sits close to uniform 1/K; a fixed 0.2
// therefore demands an ever-larger multiple of a topic's fair share as K grows,
// and past K ≈ 8 documents start clearing no topic at all and vanish from every
// bucket. Measured on synthetic corpora with 8 known themes, 120 docs, 3 seeds:
//
//   K       fixed 0.2                  min(0.2, 1.5/K)
//   8       0-1 orphan docs            0 orphans
//   12      6-8 orphan docs            0 orphans
//   14      15-20 orphans, 0-2 empty   0 orphans, 0-0.3 empty
//   16      20-34 orphans, 1-3 empty   0 orphans, 0 empty
//
// 1.5/K only bites at K ≥ 8, so the common small-K case is unchanged. Lower
// constants (1.0, 1.25) also clear the orphans but push memberships to 4-5 topics
// per document, well past the 1-3 the corpora actually contain.
const topicMin = (K) => Math.min(0.2, 1.5 / K);

// ── Preprocessing ──────────────────────────────────────────────────────────
// Pure "hits → cleaned token documents" work: winkNLP load, tokenization, and
// the repeated bigram-merge passes. Holds no reactive state; progress is
// surfaced through an injected async `onProgress(msg)` callback (which the
// caller also uses to yield to the UI).
class Preprocessing {
  static #MAX_DOCS           = 1000;
  static #MAX_TOKENS_PER_DOC = 1900;
  static #MAX_TOTAL_TOKENS   = 800_000;
  static #KEEP_POS  = new Set(["NOUN", "PROPN"]);
  static #NON_LATIN = /[^ -ɏ]/;

  // winkNLP instance + lemmatized seed groups are shared across all pipeline
  // instances (the model load is the expensive part).
  static #nlp = null;
  static #seedGroups = null;
  static get seedGroups() { return Preprocessing.#seedGroups; }

  static #hitText(hit) {
    return (hit._matchedChunks || []).map(chunkText).filter(Boolean).join(" ");
  }

  static async #loadNLP() {
    if (Preprocessing.#nlp) return;
    const [winkNLPmod, modelMod] = await Promise.all([
      import("wink-nlp"), import("wink-eng-lite-web-model"),
    ]);
    Preprocessing.#nlp = winkNLPmod.default(modelMod.default);
    const _nlp = Preprocessing.#nlp, _its = _nlp.its;
    Preprocessing.#seedGroups = SEED_GROUPS.map(group =>
      group.map(phrase => {
        const trimmed = phrase.trim().toLowerCase();
        if (trimmed.includes(" ")) return trimmed;
        const tok = _nlp.readDoc(trimmed).tokens().itemAt(0);
        const lemma = tok ? tok.out(_its.lemma) : null;
        return (lemma || trimmed).toLowerCase().replace(/[^\p{L}\p{M}]/gu, "");
      })
    );
  }

  // hits → { tokenized, meta, cappedCount, stoppedCount, keptTokens, phrasesMatched }
  static async tokenize(hits, onProgress) {
    await Preprocessing.#loadNLP();
    const nlp = Preprocessing.#nlp, its = nlp.its;

    const cappedHits = hits.slice(0, Preprocessing.#MAX_DOCS);
    await onProgress(`Tokenizing ${cappedHits.length} documents...`);

    const tokenized = [], meta = [];
    let stoppedCount = 0, keptTokens = 0, phrasesMatched = 0;
    for (let i = 0; i < cappedHits.length; i++) {
      if (keptTokens >= Preprocessing.#MAX_TOTAL_TOKENS) break;
      const hit  = cappedHits[i];
      const text = Preprocessing.#hitText(hit);
      if (!text || text.length < 40) continue;

      const rawLemmas = [], dropFlag = [];
      nlp.readDoc(text).tokens().each((t) => {
        if (rawLemmas.length >= Preprocessing.#MAX_TOKENS_PER_DOC) return;
        const normal = t.out(its.normal);
        if (!normal) return;

        if (Preprocessing.#NON_LATIN.test(normal)) {
          for (const piece of normal.toLowerCase().split(/\s+/)) {
            const term = piece.replace(/[^\p{L}\p{M}]/gu, "");
            if (term.length < 2) continue;
            let drop = false;
            if (term.length < 3) drop = true;
            else if (TOPIC_STOPWORDS.has(term)) { drop = true; stoppedCount++; }
            rawLemmas.push(term);
            dropFlag.push(drop);
          }
          return;
        }

        if (t.out(its.type) !== "word") return;
        const rawLemma = t.out(its.lemma) || normal;
        const lemma = rawLemma.toLowerCase().replace(/[^\p{L}]/gu, "");
        if (lemma.length < 2) return;
        if (/[À-ɏ]/.test(lemma)) return;
        let drop = false;
        if (lemma.length < 3) drop = true;
        else if (t.out(its.stopWordFlag)) { drop = true; stoppedCount++; }
        else if (!Preprocessing.#KEEP_POS.has(t.out(its.pos))) drop = true;
        else if (TOPIC_STOPWORDS.has(lemma)) { drop = true; stoppedCount++; }
        rawLemmas.push(lemma);
        dropFlag.push(drop);
      });

      const m = applyPhrases(rawLemmas, TOPIC_PHRASES.root);
      phrasesMatched += m.matched;
      const lemmas = [];
      for (let k = 0; k < m.tokens.length; k++) {
        if (m.fromPhrase[k]) lemmas.push(m.tokens[k]);
        else if (!dropFlag[m.srcIdx[k]]) lemmas.push(m.tokens[k]);
      }
      if (lemmas.length < 8) continue;
      keptTokens += lemmas.length;
      tokenized.push(lemmas);
      meta.push({ idx: i, hit });
    }

    return { tokenized, meta, cappedCount: cappedHits.length, stoppedCount, keptTokens, phrasesMatched };
  }

  // tokenized docs → repeated bigram-merge passes →
  // { phrased, bigramsKept, bigramsMerged, phrasesPerPass, phraseExamples }
  static async detectPhrases(tokenized, onProgress) {
    const { default: detectAndMergeBigrams } = await import("$lib/topic-modelling/bigrams.js");
    const NPASSES = 5;
    let phrased = tokenized;
    let bigramsKept = 0, bigramsMerged = 0;
    const phraseExamples = [], phrasesPerPass = [];
    for (let pass = 0; pass < NPASSES; pass++) {
      await onProgress(`Detecting phrases (pass ${pass + 1}/${NPASSES})...`);
      const out = detectAndMergeBigrams(phrased, { minCount: 3, threshold: 5 });
      phrasesPerPass.push(out.kept);
      if (out.kept === 0) break;
      phrased = out.docs;
      bigramsKept += out.kept;
      bigramsMerged += out.merged;
      phraseExamples.push(...out.examples);
    }
    return { phrased, bigramsKept, bigramsMerged, phrasesPerPass, phraseExamples };
  }
}

// ── TopicSequentialLDA ─────────────────────────────────────────────────────
// Model selection + fitting: sweeps K with the Deveaud RD score, then runs the
// full seeded sequential-LDA at the chosen K. Pure over its inputs.
class TopicSequentialLDA {
  // δ controls topic granularity in the Deveaud RD score: higher → prefer
  // fewer, coarser topics. Tested on real per-group result-set corpora,
  // 0.01 over-fragmented (K≈13-16 with many near-duplicate "land ceiling"
  // topics); 0.04 lands K≈6-8 with distinct topics on the same data.
  static #DELTA = 0.04;

  static #ldaOpts(k, quick, cfg) {
    return {
      iterations: quick ? 50 : 300, burnIn: quick ? 15 : 50,
      thinInterval: quick ? 10 : 20, sampleLag: quick ? 5 : 10,
      // α — kept high (Griffiths 50/K). These documents are long, multi-topic
      // debates, so letting each doc express many topics yields finer, cleaner
      // topics; forcing them peaky would manufacture thin topics.
      docTopicPrior: 50 / k,
      wordTopicPrior: 0.03,
      minDocFreq: cfg.minDocFreq, maxDocFreq: cfg.maxDocFreq,
      seedGroups: cfg.seedGroups,
      seedStrength: cfg.seedStrength,
      sequentialSmoothing: 0.7,
    };
  }

  static #rdForRun(phiK, thetaK, k) {
    const DELTA = TopicSequentialLDA.#DELTA;
    const p = new Array(k).fill(0);
    for (const t of thetaK) for (let i = 0; i < k; i++) p[i] += t[i];
    const pSum = p.reduce((a, b) => a + b, 0);
    for (let i = 0; i < k; i++) p[i] /= (pSum || 1);
    let rd = DELTA * DELTA;
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        const w = p[i] * p[j] - DELTA * DELTA;
        if (w > 0) rd += TopicLDAViz.jsdPair(phiK[i], phiK[j]) * w;
      }
    }
    return rd;
  }

  // phrased docs → { K, ldaTopics, theta, vocab, prunedByMax, phi,
  //                  seedMatched, seedTotal, bestRD }
  static async run(phrased, seedGroups, onProgress) {
    const { default: lda } = await import("$lib/topic-modelling/lda.js");

    // Per-group corpora are an order of magnitude smaller than the full
    // result set these defaults were tuned for, so the vocabulary band, topic
    // count, α prior and seed strength all scale with N. Without this, a
    // 0.3 max-doc-freq + min-doc-freq=2 band collapses the shared vocabulary
    // and topics come out incoherent.
    const N = phrased.length;
    const minDocFreq = N < 120 ? 2 : Math.max(2, Math.floor(N * 0.007));
    // Keep common-but-meaningful terms on small corpora (0.3 drops anything in
    // >30% of docs — far too aggressive when there are only ~15 docs).
    const maxDocFreq = N < 60 ? 0.85 : N < 150 ? 0.6 : 0.3;
    // Seeding is kept deliberately light. Tested on real result-set corpora,
    // the old strength (≈15–30) over-powered the data — it conjured caste/
    // reservation seed themes everywhere and scattered natural topics like
    // education (e.g. "student/school/scholarship" only cohered once seeding
    // was cut to ~4). This gives gentle guidance without distorting topics.
    const seedStrength = Math.min(8, Math.max(2, Math.round(N / 40)));
    const cfg = { minDocFreq, maxDocFreq, seedGroups, seedStrength };

    // Topic count: the RD sweep is free to choose fine granularity (up to
    // ~1 topic per 6 docs — these multi-topic debates support it), with an
    // adaptive floor so tiny groups aren't forced to 4. For N<20 the old
    // K_MAX<K_MIN left K stuck at 4 with no sweep.
    const K_MIN = Math.max(2, Math.min(4, Math.round(N / 14)));
    const K_MAX = Math.max(K_MIN, Math.min(SEED_GROUPS.length + 20, Math.floor(N / 6)));
    let bestK = K_MIN, bestRD = -Infinity;
    for (let kc = K_MIN; kc <= K_MAX; kc += 2) {
      await onProgress(`Finding K · scanning ${kc}/${K_MAX}...`);
      const { phi: phiK, theta: thetaK } = lda(phrased, kc, 5, TopicSequentialLDA.#ldaOpts(kc, true, cfg));
      if (!phiK || !phiK.length) continue;
      const rd = TopicSequentialLDA.#rdForRun(phiK, thetaK, kc);
      if (rd > bestRD) { bestRD = rd; bestK = kc; }
    }

    await onProgress(`K=${bestK} · Running full model (${phrased.length} docs)...`);
    const K = bestK;
    const { topics: ldaTopics, theta, modeled, vocab, prunedByMax, phi, seedMatched, seedTotal } =
      lda(phrased, K, 100, TopicSequentialLDA.#ldaOpts(K, false, cfg));

    return { K, ldaTopics, theta, modeled, vocab, prunedByMax, phi, seedMatched, seedTotal, bestRD };
  }
}

// ── TopicLDAViz ────────────────────────────────────────────────────────────
// Visualization-facing math over a fitted LDA model: LDAvis relevance ranking,
// Jensen–Shannon divergence, and building the display clusters (distinctiveness
// ordering + P(w) lift denominator + multi-topic doc bucketing).
class TopicLDAViz {
  static #EPS = 1e-12;

  static rankTerms(allTerms, lambda) {
    const EPS = TopicLDAViz.#EPS;
    return allTerms.map(t => ({
      term: t.term, probability: t.probability,
      relevance: lambda * Math.log(t.probability + EPS)
               + (1 - lambda) * Math.log((t.probability + EPS) / (t.pw + EPS)),
    })).sort((a, b) => b.relevance - a.relevance);
  }

  static jsdPair(pi, pj) {
    const EPS = TopicLDAViz.#EPS;
    let s = 0;
    for (let v = 0; v < pi.length; v++) {
      const m = (pi[v] + pj[v]) * 0.5;
      if (pi[v] > EPS) s += pi[v] * Math.log(pi[v] / (m + EPS));
      if (pj[v] > EPS) s += pj[v] * Math.log(pj[v] / (m + EPS));
    }
    return s * 0.5;
  }

  // Walks the K×K divergence matrix greedily — most distinctive topic first, then
  // always the nearest topic not yet placed — to order topics around the RadViz
  // ring. Similar topics end up adjacent, which is what defuses RadViz's central
  // ambiguity: a document splitting its weight across two anchors lands between
  // them, and the two anchors it is likely to split across are now neighbours
  // rather than opposite sides of the circle (where it would land back at the
  // origin and read as "about nothing else").
  static ringOrder(jsd, seed, K) {
    const ring = [seed];
    const placed = new Set(ring);
    while (ring.length < K) {
      const last = ring[ring.length - 1];
      let next = -1, bestD = Infinity;
      for (let k = 0; k < K; k++) {
        if (placed.has(k) || jsd[last][k] >= bestD) continue;
        next = k; bestD = jsd[last][k];
      }
      if (next < 0) { for (let k = 0; k < K; k++) if (!placed.has(k)) { next = k; break; } }
      ring.push(next); placed.add(next);
    }
    return ring;
  }

  // LDA fit + corpus → { clusters, ring }. Clusters are
  //   {topic, allTerms:[{term,probability,pw}], coherence, count, items}[]
  // ordered strongest-distinctiveness first; `ring` is the topic order RadViz
  // places around its circle, computed once here so it stays stable as the reader
  // moves between topics.
  static buildClusters({ ldaTopics, theta, modeled, phi, K }, phrased, meta) {
    // P(Z=k) and per-topic distinctiveness for display ordering. The full pairwise
    // matrix is kept for the ring; the aggregate is the per-topic coherence.
    const pK = new Array(K).fill(0);
    for (const t of theta) for (let k = 0; k < K; k++) pK[k] += t[k];
    const pKSum = pK.reduce((a, b) => a + b, 0);
    for (let k = 0; k < K; k++) pK[k] /= (pKSum || 1);
    const jsd = Array.from({ length: K }, () => new Array(K).fill(0));
    for (let i = 0; i < K; i++)
      for (let j = i + 1; j < K; j++)
        jsd[i][j] = jsd[j][i] = TopicLDAViz.jsdPair(phi[i], phi[j]);
    const topicJSD = new Array(K).fill(0);
    for (let i = 0; i < K; i++) {
      let wSum = 0;
      for (let j = 0; j < K; j++) {
        if (i === j) continue;
        topicJSD[i] += jsd[i][j] * pK[j];
        wSum += pK[j];
      }
      if (wSum > 0) topicJSD[i] /= wSum;
    }
    const order = ldaTopics.map((_, k) => k).sort((a, b) => topicJSD[b] - topicJSD[a]);

    // P(w) for the LDAvis lift denominator.
    let totalTokens = 0;
    const tokenFreq = new Map();
    for (const doc of phrased) {
      totalTokens += doc.length;
      for (const w of doc) tokenFreq.set(w, (tokenFreq.get(w) || 0) + 1);
    }

    // Multi-topic bucketing (see topicMin): a doc lands in every topic it clears
    // (θ > floor), carrying that topic's own weight as `prob`. Documents with no
    // vocabulary left after pruning are skipped — their θ row is a uniform
    // placeholder, not a measurement.
    //
    // `second` is the doc's strongest OTHER topic, null when this is the only one
    // it clears. Relative to the bucket: the same doc carries a different `second`
    // in each topic it belongs to. Names the pull in the plot's hover card.
    const floor   = topicMin(K);
    const counts  = new Array(K).fill(0);
    const buckets = Array.from({ length: K }, () => []);
    for (let j = 0; j < theta.length; j++) {
      if (modeled && !modeled[j]) continue;
      const t = theta[j];
      for (let k = 0; k < K; k++) {
        if (t[k] <= floor) continue;
        let best = -1, bestP = 0;
        for (let k2 = 0; k2 < K; k2++) {
          if (k2 === k || t[k2] <= bestP) continue;
          best = k2; bestP = t[k2];
        }
        const second = bestP > floor ? best : null;
        counts[k]++;
        buckets[k].push({
          j, prob: t[k], hit: meta[j].hit, idx: meta[j].idx,
          second, secondProb: second === null ? 0 : bestP,
        });
      }
    }

    const clusters = order.map((k) => {
      const items = buckets[k].slice().sort((a, b) => b.prob - a.prob);
      const allTerms = (ldaTopics[k] || []).map(t => ({
        term: t.term, probability: t.probability,
        pw: (tokenFreq.get(t.term) || 0) / (totalTokens || 1),
      }));
      return { topic: k, allTerms, coherence: topicJSD[k], count: counts[k], items };
    });
    return { clusters, ring: TopicLDAViz.ringOrder(jsd, order[0], K) };
  }
}

export class TopicPipeline {
  lambda      = $state(0.6);
  processing  = $state(false);
  progress    = $state("");
  stats       = $state(null);
  rawClusters = $state([]); // {topic, allTerms:[{term,probability,pw}], coherence, count, items}[]

  #lastSig = "";
  #theta   = null;          // retained for docTopics and radviz
  #ring    = null;          // topic ids in RadViz ring order

  get clusters() {
    const lam = this.lambda;
    return this.rawClusters.map(c => ({
      ...c, terms: TopicLDAViz.rankTerms(c.allTerms, lam).slice(0, 10),
    }));
  }

  // Per-document topic membership: for each modeled doc, every topic it clears
  // (θ > topicMin), strongest-first, with that topic's λ-ranked terms. Returns
  // [{ hit, topics: [{ topic, prob, terms }] }] keyed by hit (callers form the
  // docKey). Feeds the detail panel's topic list and union highlighting.
  get docTopics() {
    // Read rawClusters ($state) BEFORE the #theta guard: #theta isn't reactive,
    // so short-circuiting on it would leave an effect unsubscribed from
    // rawClusters and never re-run once the model finishes.
    const clusters = this.rawClusters;
    const theta = this.#theta;
    if (!theta || !clusters.length) return [];
    const lam = this.lambda;
    // One cluster per topic, so clusters.length is K.
    const floor = topicMin(clusters.length);
    const termsByTopic = new Map();
    for (const c of clusters) {
      termsByTopic.set(
        c.topic,
        TopicLDAViz.rankTerms(c.allTerms, lam).slice(0, 10).map(t => t.term),
      );
    }
    // A doc can sit in several buckets; emit each once (by θ-row index).
    const out = [];
    const seen = new Set();
    for (const c of clusters) {
      for (const it of c.items) {
        if (seen.has(it.j)) continue;
        seen.add(it.j);
        const row = theta[it.j];
        const topics = [];
        for (const c2 of clusters) {
          const k = c2.topic;
          if (row[k] > floor)
            topics.push({ topic: k, prob: row[k], terms: termsByTopic.get(k) || [] });
        }
        topics.sort((a, b) => b.prob - a.prob);
        out.push({ hit: it.hit, topics });
      }
    }
    return out;
  }

  // Cheap topic count — avoids building/ranking the full `clusters` array just
  // to read a length (hot path: card sizing + grid layout).
  get topicCount() { return this.rawClusters.length; }

  // RadViz layout for one topic's documents, in unit-disc coordinates.
  //
  // Every other topic is an anchor, evenly spaced around the circle in `#ring`
  // order. A document is the θ-weighted sum of those anchors; topicId has no
  // anchor, so it pulls toward the origin. θ rows sum to 1, so there is no
  // renormalisation and |r| ≤ 1 − θ[j][topicId] falls out — r is the share of the
  // document that is about something else, and the direction is which topic.
  //
  // Null before the model finishes, or at K = 1 (no anchors); caller falls back
  // to a list. Independent of `lambda` — λ re-ranks anchor wording only, so the
  // caller resolves terms from `clusters` and the slider never re-runs the layout.
  radviz(topicId) {
    const clusters = this.rawClusters;
    const theta = this.#theta, ring = this.#ring;
    if (!theta || !ring || !clusters.length) return null;

    const cluster = clusters.find((c) => c.topic === topicId);
    const ids = ring.filter((k) => k !== topicId);
    if (!cluster || !ids.length) return null;

    const anchors = ids.map((k, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / ids.length;
      return { topic: k, angle, ux: Math.cos(angle), uy: Math.sin(angle) };
    });

    let rMax = 0;
    const points = cluster.items.map((it) => {
      const row = theta[it.j];
      let ux = 0, uy = 0;
      for (const a of anchors) { ux += row[a.topic] * a.ux; uy += row[a.topic] * a.uy; }
      const r = Math.hypot(ux, uy);
      if (r > rMax) rMax = r;
      return { j: it.j, hit: it.hit, idx: it.idx, prob: it.prob, second: it.second, ux, uy, r };
    });

    return { anchors, points, rMax };
  }

  reset() {
    this.rawClusters = []; this.stats = null; this.processing = false;
    this.#theta = null; this.#ring = null;
  }
  remodel(hits, query = "", tag = "") { this.#lastSig = ""; return this.model(hits, query, tag); }

  async model(hits, query = "", tag = "") {
    if (!browser) return;
    const sig = `${tag}:${hits?.length ?? 0}:${query}`;
    if (sig === this.#lastSig) return;
    this.#lastSig = sig;

    if (!hits || hits.length < 4) {
      this.progress = "Need at least 4 results to model topics.";
      this.reset();
      return;
    }

    this.processing = true;
    this.#theta = null; this.#ring = null;
    const t0 = performance.now();
    this.progress = "Loading NLP model...";

    // Set progress and yield to the UI in one step; passed into the stateless
    // helpers so they can report without touching reactive state directly.
    const onProgress = async (msg) => {
      this.progress = msg;
      await new Promise(r => setTimeout(r, 0));
    };

    try {
      const { tokenized, meta, cappedCount, stoppedCount, keptTokens, phrasesMatched } =
        await Preprocessing.tokenize(hits, onProgress);

      if (tokenized.length < 4) {
        this.progress = "Not enough text in current results to model topics.";
        this.reset();
        return;
      }
      const tNlp = performance.now();

      const { phrased, bigramsKept, bigramsMerged, phrasesPerPass, phraseExamples } =
        await Preprocessing.detectPhrases(tokenized, onProgress);
      const tBigram = performance.now();

      const { K, ldaTopics, theta, modeled, vocab, prunedByMax, phi, seedMatched, seedTotal, bestRD } =
        await TopicSequentialLDA.run(phrased, Preprocessing.seedGroups, onProgress);

      if (theta.length < 4 || vocab.length === 0) {
        this.progress = "Topic model collapsed (vocabulary too small).";
        this.reset();
        return;
      }
      const tLda = performance.now();

      const built = TopicLDAViz.buildClusters({ ldaTopics, theta, modeled, phi, K }, phrased, meta);
      this.rawClusters = built.clusters;
      this.#ring = built.ring;
      this.#theta = theta;
      this.stats = {
        hits: cappedCount, modeledDocs: tokenized.length, vocab: vocab.length,
        keptTokens, stoppedCount, phrasesMatched,
        prunedByMax: prunedByMax || 0, maxDocFreqPct: 30,
        bigramsKept, bigramsMerged, phrasesPerPass,
        bigramExamples: phraseExamples.slice(0, 12),
        K, rdScore: bestRD.toFixed(4), seedMatched, seedTotal,
        nlpMs:    Math.round(tNlp - t0),
        bigramMs: Math.round(tBigram - tNlp),
        ldaMs:    Math.round(tLda - tBigram),
      };
      this.progress = "";
    } catch (err) {
      console.error("TopicPipeline.model failed:", err);
      this.progress = "Error: " + (err.message || err);
    } finally {
      this.processing = false;
    }
  }
}
