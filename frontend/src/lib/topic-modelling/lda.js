// Vendored from the `lda` npm package (by Kory Becker; Apache-2.0).
// https://github.com/primaryobjects/lda
// Originally based on jsLDA (https://github.com/awaisathar/lda.js) and the
// Java implementation at http://www.arbylon.net/projects/LdaGibbsSampler.java.
//
// Changes from upstream:
//   * removed `require('stem-porter')` and the Porter stemmer step
//     (callers feed already-lemmatized text from winkNLP)
//   * removed dynamic `require('./stopwords_' + lang + '.js')` (same reason)
//   * ESM default export instead of `module.exports`
//   * Seeded LDA: seed pseudo-count (ω) prior on topic-word distributions
//     — Lu et al. (2011) "Exploring Models and Data for Remote Sensing
//       Image Caption Generation" §3.2
//     — Reused in Watanabe & Baturo (2024) "seqsLDA" §2.1
//   * Sequential LDA: temporal carry-over factor (γ) multiplying the previous
//     document's topic distribution into the Gibbs conditional
//     — Watanabe & Baturo (2024) "Sequence-aware Topic Models" Eq. 7
//   * Performance: reusable Float64Array buffers hoisted out of hot inner loops

// Returns { topics, theta, modeled, vocab, phi } where:
//   topics:  array of K topics, each an array of {term, probability}
//   theta:   M × K matrix — document-topic distributions  (θ, Blei et al. 2003)
//   modeled: M booleans — false where the doc had no vocabulary left after
//            pruning and its theta row is a uniform placeholder, not a fit
//   vocab:   vocabulary array (indices match phi columns)
//   phi:     K × V matrix — topic-word distributions      (φ, Blei et al. 2003)
//
// `sentences` may be raw strings or arrays of pre-tokenized words.
//
// opts keys:
//   docTopicPrior     (α) — Dirichlet concentration for document-topic distributions.
//                           Controls how many topics a single document draws from.
//                           Higher = more uniform/mixed docs. Default 0.1.
//                           Blei, Ng & Jordan (2003) "Latent Dirichlet Allocation", §2.
//
//   wordTopicPrior    (β) — Dirichlet concentration for topic-word distributions.
//                           Controls how many words define a single topic.
//                           Higher = broader, more generic topics. Default 0.01.
//                           Blei, Ng & Jordan (2003) "Latent Dirichlet Allocation", §2.
//
//   seedStrength      (μ*) — Total seed pseudo-count added per seeded topic.
//                            Distributed across seed words proportional to phrase length.
//                            Higher = stronger guidance toward seed vocabulary.
//                            Recommended 5–100 (corpus-size dependent). Default 5.
//                            Lu et al. (2011) §3.2; Watanabe & Baturo (2024) §2.1.
//
//   sequentialSmoothing (γ) — Temporal carry-over weight from the previous document.
//                             Each word's topic probability is multiplied by θ^γ_{d-1},
//                             biasing toward the previous doc's topics.
//                             0 = standard LDA (no carry-over). 0.5 recommended.
//                             Watanabe & Baturo (2024) "seqsLDA", Eq. 7.
//
//   seedGroups        — array of phrase-arrays (one per desired topic). See below.
//   minDocFreq        — minimum docs a term must appear in (int, default 2).
//   maxDocFreq        — maximum FRACTION of docs a term may appear in (0..1, default 0.7).
const ldaProcess = function (sentences, numberOfTopics, numberOfTermsPerTopic, opts) {
  opts = opts || {};
  const iterations    = opts.iterations    || 300;
  const burnIn        = opts.burnIn        || 50;
  const thinInterval  = opts.thinInterval  || 20;
  const sampleLag     = opts.sampleLag     || 10;
  const minTermLength = opts.minTermLength || 3;
  const minDocFreq    = opts.minDocFreq    || 2;
  const maxDocFreq    = opts.maxDocFreq != null ? opts.maxDocFreq : 0.7;
  const randomSeed    = opts.randomSeed;

  if (!sentences || sentences.length === 0) return { topics: [], theta: [], vocab: [], phi: [] };

  // First pass: count term doc-frequency for vocabulary pruning.
  const docFreq = {};
  const tokenized = sentences.map((s) => {
    const arr = Array.isArray(s) ? s : (s || "").toLowerCase().split(/[\s,"]+/);
    const seen = new Set();
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      // Keep letters (\p{L}), combining marks (\p{M}), numbers, apostrophes,
      // hyphens, AND underscores (so merged phrases like "right_to_information"
      // survive intact).
      const w = String(arr[i]).replace(/[^\p{L}\p{M}\p{N}'_-]+/gu, "");
      if (!w || w.length < minTermLength || w.indexOf("http") === 0) continue;
      out.push(w);
      if (!seen.has(w)) { seen.add(w); docFreq[w] = (docFreq[w] || 0) + 1; }
    }
    return out;
  });

  // Prune vocabulary: keep terms appearing in [minDocFreq, maxDocFreq×|D|] docs.
  const vocab = [];
  const vocabIdx = new Map();
  const maxDocCount = Math.floor(tokenized.length * maxDocFreq);
  let prunedByMax = 0;
  for (const w of Object.keys(docFreq)) {
    if (docFreq[w] < minDocFreq) continue;
    if (docFreq[w] > maxDocCount) { prunedByMax++; continue; }
    vocabIdx.set(w, vocab.length);
    vocab.push(w);
  }

  // Encode docs as vocab indices; skip empty docs.
  const documents = [];
  const docMap = [];
  for (let i = 0; i < tokenized.length; i++) {
    const enc = [];
    for (const w of tokenized[i]) {
      const idx = vocabIdx.get(w);
      if (idx !== undefined) enc.push(idx);
    }
    if (enc.length > 0) { documents.push(enc); docMap.push(i); }
  }

  if (documents.length === 0 || vocab.length === 0) {
    return { topics: [], theta: [], vocab, phi: [] };
  }

  const V = vocab.length;
  const K = parseInt(numberOfTopics);

  // α — document-topic Dirichlet prior (Blei et al. 2003 §2).
  const docTopicPrior  = opts.docTopicPrior  || 0.1;
  // β — topic-word Dirichlet prior (Blei et al. 2003 §2).
  const wordTopicPrior = opts.wordTopicPrior || 0.01;

  // Build seedTopic[w]: which topic index word w is seeded to (-1 = unseeded).
  // Phrases arrive space-separated ("right to information") or already merged
  // ("right_to_information"); we check both forms against the vocab.
  let seedTopic  = null;
  let seedWeight = null; // phrase-length weight per vocab index (bigram=2, trigram=3, …)
  let seedMatched = 0, seedTotal = 0;
  const seedMatchedPhrases = [];
  const seedGroups = opts.seedGroups;
  if (seedGroups && seedGroups.length > 0) {
    seedTopic  = new Int32Array(V).fill(-1);
    seedWeight = new Float64Array(V).fill(1);
    const S = Math.min(K, seedGroups.length);
    const counted = new Set(); // deduplicate across all groups
    for (let s = 0; s < S; s++) {
      for (const phrase of seedGroups[s]) {
        const merged = phrase.trim().toLowerCase().split(/\s+/).join("_");
        const spaced = phrase.trim().toLowerCase();
        if (counted.has(merged)) continue;
        counted.add(merged);
        seedTotal++;
        let idx = vocabIdx.get(merged);
        const matchedForm = idx !== undefined ? merged : undefined;
        if (idx === undefined) idx = vocabIdx.get(spaced);
        // First assignment wins — a word belongs to at most one seed group.
        if (idx !== undefined && seedTopic[idx] === -1) {
          seedTopic[idx] = s;
          seedWeight[idx] = merged.split("_").length; // 1 for unigrams, 2 bigrams, 3 trigrams…
          seedMatched++;
          seedMatchedPhrases.push(matchedForm ?? spaced);
        }
      }
    }
  }

  // γ — sequential carry-over (Watanabe & Baturo 2024 Eq. 7). 0 = disabled.
  const sequentialSmoothing = opts.sequentialSmoothing != null ? opts.sequentialSmoothing : 0;
  // μ* — seed pseudo-count strength (Lu et al. 2011 §3.2).
  const seedStrength = opts.seedStrength != null ? opts.seedStrength : 5;

  lda.configure(documents, V, iterations, burnIn, thinInterval, sampleLag, randomSeed, seedTopic, seedWeight);
  lda.gibbs(K, docTopicPrior, wordTopicPrior, seedStrength, sequentialSmoothing);

  const phi          = lda.getPhi();
  const thetaCompact = lda.getTheta();

  // Re-expand theta to align with the original input order. A document left with
  // no vocabulary after pruning gets a uniform prior, which is not a measurement —
  // `modeled` flags the rows that are, so callers can skip the rest. Without it a
  // contentless document reads as 1/K on every topic, and at K ≤ 4 that clears a
  // 0.2 membership threshold and lands it in every single bucket.
  const M = sentences.length;
  const theta = new Array(M);
  const modeled = new Array(M).fill(false);
  for (let i = 0; i < M; i++) {
    theta[i] = new Array(K);
    for (let k = 0; k < K; k++) theta[i][k] = 1 / K;
  }
  for (let j = 0; j < docMap.length; j++) {
    theta[docMap[j]] = thetaCompact[j];
    modeled[docMap[j]] = true;
  }

  // Extract top terms per topic from phi.
  const topics = [];
  let topTerms = Math.min(numberOfTermsPerTopic, vocab.length);
  for (let k = 0; k < phi.length; k++) {
    const indexed = phi[k].map((p, w) => ({ p, w }));
    indexed.sort((a, b) => b.p - a.p);
    const row = [];
    for (let t = 0; t < topTerms; t++) {
      const { p, w } = indexed[t];
      if (p < 0.001) continue;
      row.push({ term: vocab[w], probability: p });
    }
    topics.push(row);
  }

  return { topics, theta, modeled, vocab, prunedByMax, phi, seedMatched, seedTotal, seedMatchedPhrases };
};

function makeArray(x) {
  const a = new Array(x);
  for (let i = 0; i < x; i++) a[i] = 0;
  return a;
}

function make2DArray(x, y) {
  const a = new Array(x);
  for (let i = 0; i < x; i++) {
    a[i] = new Array(y);
    for (let j = 0; j < y; j++) a[i][j] = 0;
  }
  return a;
}

const lda = new (function () {
  this.THIN_INTERVAL = 20;
  this.BURN_IN       = 100;
  this.ITERATIONS    = 1000;

  this.configure = function (docs, v, iterations, burnIn, thinInterval, sampleLag, randomSeed, seedTopic, seedWeight) {
    this.ITERATIONS    = iterations;
    this.BURN_IN       = burnIn;
    this.THIN_INTERVAL = thinInterval;
    this.SAMPLE_LAG    = sampleLag;
    this.RANDOM_SEED   = randomSeed;
    this.documents     = docs;
    this.V             = v;
    this.numstats      = 0;
    // seedTopic[w]  = topic index that word w is seeded to, or -1 if unseeded.
    // seedWeight[w] = phrase-length weight (unigram=1, bigram=2, trigram=3, …).
    this.seedTopic  = seedTopic  || null;
    this.seedWeight = seedWeight || null;
  };

  this.initialState = function (K) {
    const M = this.documents.length;
    this.nw    = make2DArray(this.V, K); // N_kw  — word-topic co-occurrence counts
    this.nd    = make2DArray(M, K);      // N_dk  — doc-topic counts
    this.nwsum = makeArray(K);           // N_k·  — total tokens per topic
    this.ndsum = makeArray(M);           // N_d·  — document lengths
    this.z     = new Array(M);           // Z     — per-token topic assignments
    for (let m = 0; m < M; m++) {
      const N = this.documents[m].length;
      this.z[m] = new Array(N);
      for (let n = 0; n < N; n++) {
        const topic = parseInt("" + (this.getRandom() * K));
        this.z[m][n] = topic;
        this.nw[this.documents[m][n]][topic]++;
        this.nd[m][topic]++;
        this.nwsum[topic]++;
      }
      this.ndsum[m] = N;
    }
  };

  // Collapsed Gibbs sampler — Griffiths & Steyvers (2004) §2.
  //
  // Parameters:
  //   K                   — number of topics
  //   docTopicPrior       — α, Dirichlet prior on θ (Blei et al. 2003 §2)
  //   wordTopicPrior      — β, Dirichlet prior on φ (Blei et al. 2003 §2)
  //   seedStrength        — μ*, total pseudo-count per seeded topic (Lu et al. 2011 §3.2)
  //   sequentialSmoothing — γ, temporal carry-over from previous doc (Watanabe & Baturo 2024 Eq. 7)
  this.gibbs = function (K, docTopicPrior, wordTopicPrior, seedStrength, sequentialSmoothing) {
    this.K              = K;
    this.docTopicPrior  = docTopicPrior;
    this.wordTopicPrior = wordTopicPrior;
    // γ — 0 disables sequential LDA; any positive value activates Watanabe & Baturo 2024 Eq. 7.
    this.sequentialSmoothing = (sequentialSmoothing != null && sequentialSmoothing > 0)
      ? sequentialSmoothing : 0;

    if (this.SAMPLE_LAG > 0) {
      this.thetasum = make2DArray(this.documents.length, K);
      this.phisum   = make2DArray(K, this.V);
      this.numstats = 0;
    }

    // ── Seeded LDA pseudo-count construction — Lu et al. (2011) §3.2 ──────────
    //
    // For each word w seeded to topic k:
    //   seedPseudoCounts[w] = phraseWeight[w] × seedStrength / Σ_w phraseWeight[w]
    //
    // Phrase-length weighting: a 3-word phrase contributes 3× the pseudo-count of a
    // unigram, keeping total pseudo-count per topic = seedStrength regardless of the
    // number of seeds.
    //
    // wordPriorPerTopic[k] = V·β + Σ_{w seeded to k} seedPseudoCounts[w]
    // replaces the standard uniform V·β denominator in the Gibbs conditional.
    this.wordPriorPerTopic = makeArray(K);
    if (this.seedTopic && seedStrength > 0) {
      const weightedSeedTotal = new Float64Array(K);
      const st = this.seedTopic, sw = this.seedWeight;
      for (let w = 0; w < this.V; w++) {
        const k = st[w];
        if (k >= 0 && k < K) weightedSeedTotal[k] += sw ? sw[w] : 1;
      }
      this.seedPseudoCounts = new Float64Array(this.V);
      const topicSeedBoost = new Float64Array(K);
      for (let w = 0; w < this.V; w++) {
        const k = st[w];
        if (k >= 0 && k < K && weightedSeedTotal[k] > 0) {
          const phraseWeight = sw ? sw[w] : 1;
          this.seedPseudoCounts[w] = phraseWeight * seedStrength / weightedSeedTotal[k];
          topicSeedBoost[k] += this.seedPseudoCounts[w];
        }
      }
      for (let k = 0; k < K; k++) {
        this.wordPriorPerTopic[k] = this.V * wordTopicPrior + topicSeedBoost[k];
      }
    } else {
      this.seedPseudoCounts = null;
      for (let k = 0; k < K; k++) this.wordPriorPerTopic[k] = this.V * wordTopicPrior;
    }

    this.initialState(K);

    // Reusable buffers hoisted out of the hot inner loops (S1, S2).
    // _topicProbsBuf: replaces per-call makeArray(K) in sampleFullConditional — saves
    //   ~30 M allocations for a 1000-doc × 300-iter run.
    // _prevDocPowBuf: replaces per-document new Float64Array(K) for sequential LDA —
    //   saves ~300 K allocations.
    this._topicProbsBuf = new Float64Array(K);
    this._prevDocPowBuf = new Float64Array(K);

    const useSeq = this.sequentialSmoothing > 0;

    for (let i = 0; i < this.ITERATIONS; i++) {
      for (let m = 0; m < this.z.length; m++) {
        // Sequential LDA (Watanabe & Baturo 2024 Eq. 7):
        // compute θ^γ_{d-1,k} once per document rather than once per word token.
        let prevDocTopicPow = null;
        if (useSeq && m > 0) {
          const prevDocDenom = this.ndsum[m - 1] + K * this.docTopicPrior;
          for (let k = 0; k < K; k++) {
            this._prevDocPowBuf[k] = Math.pow(
              (this.nd[m - 1][k] + this.docTopicPrior) / prevDocDenom,
              this.sequentialSmoothing
            );
          }
          prevDocTopicPow = this._prevDocPowBuf;
        }
        for (let n = 0; n < this.z[m].length; n++) {
          this.z[m][n] = this.sampleFullConditional(m, n, prevDocTopicPow);
        }
      }
      // Collect samples after burn-in at every sampleLag-th iteration.
      // `i >= BURN_IN` matches the stated semantics: BURN_IN iterations discarded.
      if (i >= this.BURN_IN && this.SAMPLE_LAG > 0 && i % this.SAMPLE_LAG === 0) {
        this.updateParams();
      }
    }
  };

  // Full conditional P(z_i=k | rest) — Griffiths & Steyvers (2004) Eq. 5,
  // extended with seeded φ̄ (Lu et al. 2011 §3.2) and sequential carry-over
  // (Watanabe & Baturo 2024 Eq. 7):
  //
  //   P(z=k | rest) ∝ φ̄_kw · θ_dk · θ^γ_{d-1,k}
  //
  // where  φ̄_kw = (N_kw + β + ω_w·𝟙[seeded to k]) / wordPriorPerTopic[k]
  this.sampleFullConditional = function (m, n, prevDocTopicPow) {
    let topic = this.z[m][n];
    const w   = this.documents[m][n];

    // Exclude current token from counts before sampling (collapsed Gibbs convention).
    this.nw[w][topic]--;
    this.nd[m][topic]--;
    this.nwsum[topic]--;
    this.ndsum[m]--;

    // Reuse the pre-allocated buffer; all K entries are overwritten below.
    const topicProbs         = this._topicProbsBuf;
    const seedTopicRow       = this.seedTopic;
    const seededTopicForWord = seedTopicRow ? seedTopicRow[w] : -1;
    const seedBoostForWord   = (this.seedPseudoCounts && seededTopicForWord >= 0)
      ? this.seedPseudoCounts[w] : 0;
    const docDenom = this.ndsum[m] + this.K * this.docTopicPrior;

    for (let k = 0; k < this.K; k++) {
      // wordPrior = β when w is not seeded to k, β + ω_w when it is.
      const wordPrior = this.wordTopicPrior + (seededTopicForWord === k ? seedBoostForWord : 0);
      let pk = ((this.nw[w][k] + wordPrior) / (this.nwsum[k] + this.wordPriorPerTopic[k])) *
               ((this.nd[m][k] + this.docTopicPrior) / docDenom);
      // Sequential carry-over: multiply by θ^γ_{d-1,k}.
      if (prevDocTopicPow) pk *= prevDocTopicPow[k];
      topicProbs[k] = pk;
    }

    // Cumulative sum for inverse-CDF sampling.
    for (let k = 1; k < this.K; k++) topicProbs[k] += topicProbs[k - 1];
    const u = this.getRandom() * topicProbs[this.K - 1];
    for (topic = 0; topic < this.K; topic++) {
      if (u < topicProbs[topic]) break;
    }

    // Re-include with the new assignment.
    this.nw[this.documents[m][n]][topic]++;
    this.nd[m][topic]++;
    this.nwsum[topic]++;
    this.ndsum[m]++;
    return topic;
  };

  // Accumulate θ and φ̄ samples for time-averaging — Griffiths & Steyvers (2004) §3.
  // φ̄ numerator includes ω (seed boost) to match the Gibbs conditional.
  this.updateParams = function () {
    for (let m = 0; m < this.documents.length; m++) {
      for (let k = 0; k < this.K; k++) {
        this.thetasum[m][k] += (this.nd[m][k] + this.docTopicPrior)
          / (this.ndsum[m] + this.K * this.docTopicPrior);
      }
    }
    const seedTopicRow     = this.seedTopic;
    const seedPseudoCounts = this.seedPseudoCounts;
    for (let k = 0; k < this.K; k++) {
      const wordPriorK = this.wordPriorPerTopic[k];
      for (let w = 0; w < this.V; w++) {
        const seedBoost = (seedPseudoCounts && seedTopicRow && seedTopicRow[w] === k)
          ? seedPseudoCounts[w] : 0;
        this.phisum[k][w] += (this.nw[w][k] + this.wordTopicPrior + seedBoost)
          / (this.nwsum[k] + wordPriorK);
      }
    }
    this.numstats++;
  };

  // θ — document-topic distribution (M × K).
  // Returns time-averaged samples when available; falls back to single-point estimate.
  this.getTheta = function () {
    const M     = this.documents.length;
    const theta = new Array(M);
    for (let i = 0; i < M; i++) theta[i] = new Array(this.K);
    if (this.SAMPLE_LAG > 0 && this.numstats > 0) {
      for (let m = 0; m < M; m++)
        for (let k = 0; k < this.K; k++)
          theta[m][k] = this.thetasum[m][k] / this.numstats;
    } else {
      for (let m = 0; m < M; m++)
        for (let k = 0; k < this.K; k++)
          theta[m][k] = (this.nd[m][k] + this.docTopicPrior)
            / (this.ndsum[m] + this.K * this.docTopicPrior);
    }
    return theta;
  };

  // φ̄ — topic-word distribution (K × V), with seed pseudo-counts in the numerator.
  // Returns time-averaged samples when available; falls back to single-point estimate.
  this.getPhi = function () {
    const phi = new Array(this.K);
    for (let i = 0; i < this.K; i++) phi[i] = new Array(this.V);
    if (this.SAMPLE_LAG > 0 && this.numstats > 0) {
      for (let k = 0; k < this.K; k++)
        for (let w = 0; w < this.V; w++)
          phi[k][w] = this.phisum[k][w] / this.numstats;
    } else {
      // Single-point estimate (also used as fallback when numstats === 0).
      const seedTopicRow     = this.seedTopic;
      const seedPseudoCounts = this.seedPseudoCounts;
      for (let k = 0; k < this.K; k++) {
        const wordPriorK = this.wordPriorPerTopic[k];
        for (let w = 0; w < this.V; w++) {
          const seedBoost = (seedPseudoCounts && seedTopicRow && seedTopicRow[w] === k)
            ? seedPseudoCounts[w] : 0;
          phi[k][w] = (this.nw[w][k] + this.wordTopicPrior + seedBoost)
            / (this.nwsum[k] + wordPriorK);
        }
      }
    }
    return phi;
  };

  // Deterministic PRNG when randomSeed is set; falls back to Math.random().
  // Note: seed value of 0 is treated as "no seed" (falsy) — pass any non-zero integer.
  this.getRandom = function () {
    if (this.RANDOM_SEED != null && this.RANDOM_SEED !== 0) {
      const x = Math.sin(this.RANDOM_SEED++) * 1000000;
      return x - Math.floor(x);
    }
    return Math.random();
  };
})();

export default ldaProcess;
