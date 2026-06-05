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

// Returns { topics, theta, vocab } where:
//   topics: array of K topics, each an array of {term, probability}
//   theta:  M x K matrix of per-document topic distributions
//   vocab:  vocabulary array (indices match phi columns)
//
// `sentences` may be raw strings or arrays of pre-tokenized words.
// `opts`: { iterations, burnIn, alpha, beta, minTermLength, minDocFreq, maxDocFreq }
//
//   minDocFreq  — minimum docs a term must appear in (int, default 2).
//                 Drops hapaxes that just inflate vocab.
//   maxDocFreq  — maximum FRACTION of docs a term may appear in (0..1,
//                 default 0.7). Drops terms so common they appear in
//                 nearly every doc — they don't discriminate topics, and
//                 they'd otherwise dominate every cluster (e.g. the
//                 search query itself).
const ldaProcess = function (sentences, numberOfTopics, numberOfTermsPerTopic, opts) {
  opts = opts || {};
  const iterations = opts.iterations || 300;
  const burnIn = opts.burnIn || 50;
  const thinInterval = opts.thinInterval || 20;
  const sampleLag = opts.sampleLag || 10;
  const minTermLength = opts.minTermLength || 3;
  const minDocFreq = opts.minDocFreq || 2;
  const maxDocFreq = opts.maxDocFreq != null ? opts.maxDocFreq : 0.7;
  const randomSeed = opts.randomSeed;

  if (!sentences || sentences.length === 0) return { topics: [], theta: [], vocab: [] };

  // First pass: count term doc-frequency for vocabulary pruning.
  const docFreq = {};
  const tokenized = sentences.map((s) => {
    const arr = Array.isArray(s) ? s : (s || "").toLowerCase().split(/[\s,"]+/);
    const seen = new Set();
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      // Keep letters (\p{L}), combining marks (\p{M}), numbers, apostrophes,
      // hyphens, AND underscores.
      //   - \p{M} matters for Indic scripts: e.g. அனுமதி is அ+ன+ு+ம+த+ி,
      //     where ு (U+0BC1) and ி (U+0BBF) are combining vowel marks.
      //     Without \p{M} the matras get stripped and the word collapses
      //     to nonsense like அனமத.
      //   - underscore matters so bigram-merged phrases like "girl_education"
      //     don't get mashed into "girleducation".
      const w = String(arr[i]).replace(/[^\p{L}\p{M}\p{N}'_-]+/gu, "");
      if (!w || w.length < minTermLength || w.indexOf("http") === 0) continue;
      out.push(w);
      if (!seen.has(w)) { seen.add(w); docFreq[w] = (docFreq[w] || 0) + 1; }
    }
    return out;
  });

  // Build vocab keeping only terms appearing in >= minDocFreq docs AND
  // in <= maxDocFreq fraction of docs (corpus-wide upper-bound prune).
  // The upper bound catches words so ubiquitous they fail to discriminate
  // topics — e.g. the user's search term appears in every hit by definition.
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

  // Encode docs as vocab indices.
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
    return { topics: [], theta: [], vocab };
  }

  const V = vocab.length;
  const K = parseInt(numberOfTopics);
  const alpha = opts.alpha || 0.1;
  const beta = opts.beta || 0.01;

  lda.configure(documents, V, iterations, burnIn, thinInterval, sampleLag, randomSeed);
  lda.gibbs(K, alpha, beta);

  const phi = lda.getPhi();
  const thetaCompact = lda.getTheta();

  // Re-expand theta to align with the original input order; empty docs get a uniform prior.
  const M = sentences.length;
  const theta = new Array(M);
  for (let i = 0; i < M; i++) {
    theta[i] = new Array(K);
    for (let k = 0; k < K; k++) theta[i][k] = 1 / K;
  }
  for (let j = 0; j < docMap.length; j++) theta[docMap[j]] = thetaCompact[j];

  const topics = [];
  let topTerms = numberOfTermsPerTopic;
  if (topTerms > vocab.length) topTerms = vocab.length;
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

  return { topics, theta, vocab, prunedByMax };
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
  this.BURN_IN = 100;
  this.ITERATIONS = 1000;

  this.configure = function (docs, v, iterations, burnIn, thinInterval, sampleLag, randomSeed) {
    this.ITERATIONS = iterations;
    this.BURN_IN = burnIn;
    this.THIN_INTERVAL = thinInterval;
    this.SAMPLE_LAG = sampleLag;
    this.RANDOM_SEED = randomSeed;
    this.documents = docs;
    this.V = v;
    this.dispcol = 0;
    this.numstats = 0;
  };

  this.initialState = function (K) {
    const M = this.documents.length;
    this.nw = make2DArray(this.V, K);
    this.nd = make2DArray(M, K);
    this.nwsum = makeArray(K);
    this.ndsum = makeArray(M);
    this.z = new Array(M);
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

  this.gibbs = function (K, alpha, beta) {
    this.K = K;
    this.alpha = alpha;
    this.beta = beta;
    if (this.SAMPLE_LAG > 0) {
      this.thetasum = make2DArray(this.documents.length, this.K);
      this.phisum = make2DArray(this.K, this.V);
      this.numstats = 0;
    }
    this.initialState(K);
    for (let i = 0; i < this.ITERATIONS; i++) {
      for (let m = 0; m < this.z.length; m++) {
        for (let n = 0; n < this.z[m].length; n++) {
          const topic = this.sampleFullConditional(m, n);
          this.z[m][n] = topic;
        }
      }
      if (i > this.BURN_IN && this.SAMPLE_LAG > 0 && i % this.SAMPLE_LAG === 0) {
        this.updateParams();
      }
    }
  };

  this.sampleFullConditional = function (m, n) {
    let topic = this.z[m][n];
    this.nw[this.documents[m][n]][topic]--;
    this.nd[m][topic]--;
    this.nwsum[topic]--;
    this.ndsum[m]--;
    const p = makeArray(this.K);
    for (let k = 0; k < this.K; k++) {
      p[k] =
        ((this.nw[this.documents[m][n]][k] + this.beta) / (this.nwsum[k] + this.V * this.beta)) *
        ((this.nd[m][k] + this.alpha) / (this.ndsum[m] + this.K * this.alpha));
    }
    for (let k = 1; k < p.length; k++) p[k] += p[k - 1];
    const u = this.getRandom() * p[this.K - 1];
    for (topic = 0; topic < p.length; topic++) {
      if (u < p[topic]) break;
    }
    this.nw[this.documents[m][n]][topic]++;
    this.nd[m][topic]++;
    this.nwsum[topic]++;
    this.ndsum[m]++;
    return topic;
  };

  this.updateParams = function () {
    for (let m = 0; m < this.documents.length; m++) {
      for (let k = 0; k < this.K; k++) {
        this.thetasum[m][k] += (this.nd[m][k] + this.alpha) / (this.ndsum[m] + this.K * this.alpha);
      }
    }
    for (let k = 0; k < this.K; k++) {
      for (let w = 0; w < this.V; w++) {
        this.phisum[k][w] += (this.nw[w][k] + this.beta) / (this.nwsum[k] + this.V * this.beta);
      }
    }
    this.numstats++;
  };

  this.getTheta = function () {
    const M = this.documents.length;
    const theta = new Array(M);
    for (let i = 0; i < M; i++) theta[i] = new Array(this.K);
    if (this.SAMPLE_LAG > 0 && this.numstats > 0) {
      for (let m = 0; m < M; m++) {
        for (let k = 0; k < this.K; k++) theta[m][k] = this.thetasum[m][k] / this.numstats;
      }
    } else {
      for (let m = 0; m < M; m++) {
        for (let k = 0; k < this.K; k++) {
          theta[m][k] = (this.nd[m][k] + this.alpha) / (this.ndsum[m] + this.K * this.alpha);
        }
      }
    }
    return theta;
  };

  this.getPhi = function () {
    const phi = new Array(this.K);
    for (let i = 0; i < this.K; i++) phi[i] = new Array(this.V);
    if (this.SAMPLE_LAG > 0) {
      for (let k = 0; k < this.K; k++) {
        for (let w = 0; w < this.V; w++) phi[k][w] = this.phisum[k][w] / this.numstats;
      }
    } else {
      for (let k = 0; k < this.K; k++) {
        for (let w = 0; w < this.V; w++) {
          phi[k][w] = (this.nw[w][k] + this.beta) / (this.nwsum[k] + this.V * this.beta);
        }
      }
    }
    return phi;
  };

  this.getRandom = function () {
    if (this.RANDOM_SEED) {
      const x = Math.sin(this.RANDOM_SEED++) * 1000000;
      return x - Math.floor(x);
    }
    return Math.random();
  };
})();

export default ldaProcess;
