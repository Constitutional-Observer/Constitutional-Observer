// TopicPipeline — NLP → phrase-merge → seeded-sequential LDA → (lazy) t-SNE.
//
// Split into two phases so the geo view can show cluster term-grids without
// paying for the 2-D projection up front:
//   • model(hits, query, tag) — tokenize, detect phrases, run LDA, bucket
//     documents by dominant topic and build `rawClusters` (terms + counts +
//     member hits) WITHOUT any t-SNE coordinates.
//   • project() — runs t-SNE on the stored θ and back-fills per-cluster /
//     global normalized coordinates onto the already-built cluster items. Runs
//     at most once per model; called only when a cluster's scatter is opened.
import { browser } from "$app/environment";
import { TOPIC_STOPWORDS } from "$lib/topic-modelling/topic-stopwords.js";
import { TOPIC_PHRASES, SEED_GROUPS } from "$lib/topic-modelling/topic-phrases.js";
import { applyPhrases } from "$lib/topic-modelling/phrase-matcher.js";

export class TopicPipeline {
  static #MAX_DOCS           = 1000;
  static #MAX_TOKENS_PER_DOC = 1900;
  static #MAX_TOTAL_TOKENS   = 800_000;
  static #KEEP_POS  = new Set(["NOUN", "PROPN"]);
  static #NON_LATIN = /[^ -ɏ]/;

  // winkNLP instance + lemmatized seed groups are shared across all pipeline
  // instances (the model load is the expensive part).
  static #nlp = null;
  static #seedGroups = null;

  static #argmax(a) {
    let m = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[m]) m = i;
    return m;
  }
  static #hitText(hit) {
    return (hit._matchedChunks || []).map(c => c.text).filter(Boolean).join(" ")
      || hit.__discussions || "";
  }

  lambda      = $state(0.6);
  processing  = $state(false);
  projecting  = $state(false);
  projected   = $state(false);
  progress    = $state("");
  stats       = $state(null);
  rawClusters = $state([]); // {topic, allTerms:[{term,probability,pw}], coherence, count, items}[]

  #lastSig = "";
  #theta   = null;          // retained for lazy t-SNE projection

  static #rankTerms(allTerms, lambda) {
    const EPS = 1e-12;
    return allTerms.map(t => ({
      term: t.term, probability: t.probability,
      relevance: lambda * Math.log(t.probability + EPS)
               + (1 - lambda) * Math.log((t.probability + EPS) / (t.pw + EPS)),
    })).sort((a, b) => b.relevance - a.relevance);
  }

  get clusters() {
    const lam = this.lambda;
    return this.rawClusters.map(c => ({
      ...c, terms: TopicPipeline.#rankTerms(c.allTerms, lam).slice(0, 10),
    }));
  }

  // Cheap topic count — avoids building/ranking the full `clusters` array just
  // to read a length (hot path: card sizing + grid layout).
  get topicCount() { return this.rawClusters.length; }

  reset() {
    this.rawClusters = []; this.stats = null; this.processing = false;
    this.projecting = false; this.projected = false; this.#theta = null;
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
    this.projected = false; this.#theta = null;
    const t0 = performance.now();
    this.progress = "Loading NLP model...";

    try {
      const [{ default: lda }, { default: detectAndMergeBigrams }] = await Promise.all([
        import("$lib/topic-modelling/lda.js"), import("$lib/topic-modelling/bigrams.js"),
      ]);

      if (!TopicPipeline.#nlp) {
        const [winkNLPmod, modelMod] = await Promise.all([
          import("wink-nlp"), import("wink-eng-lite-web-model"),
        ]);
        TopicPipeline.#nlp = winkNLPmod.default(modelMod.default);
        const _nlp = TopicPipeline.#nlp, _its = _nlp.its;
        TopicPipeline.#seedGroups = SEED_GROUPS.map(group =>
          group.map(phrase => {
            const trimmed = phrase.trim().toLowerCase();
            if (trimmed.includes(" ")) return trimmed;
            const tok = _nlp.readDoc(trimmed).tokens().itemAt(0);
            const lemma = tok ? tok.out(_its.lemma) : null;
            return (lemma || trimmed).toLowerCase().replace(/[^\p{L}\p{M}]/gu, "");
          })
        );
      }
      const nlp = TopicPipeline.#nlp, its = nlp.its;

      const cappedHits = hits.slice(0, TopicPipeline.#MAX_DOCS);
      this.progress = `Tokenizing ${cappedHits.length} documents...`;
      await new Promise(r => setTimeout(r, 0));

      const tokenized = [], meta = [];
      let stoppedCount = 0, keptTokens = 0, phrasesMatched = 0;
      for (let i = 0; i < cappedHits.length; i++) {
        if (keptTokens >= TopicPipeline.#MAX_TOTAL_TOKENS) break;
        const hit  = cappedHits[i];
        const text = TopicPipeline.#hitText(hit);
        if (!text || text.length < 40) continue;

        const rawLemmas = [], dropFlag = [];
        nlp.readDoc(text).tokens().each((t) => {
          if (rawLemmas.length >= TopicPipeline.#MAX_TOKENS_PER_DOC) return;
          const normal = t.out(its.normal);
          if (!normal) return;

          if (TopicPipeline.#NON_LATIN.test(normal)) {
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
          else if (!TopicPipeline.#KEEP_POS.has(t.out(its.pos))) drop = true;
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

      if (tokenized.length < 4) {
        this.progress = "Not enough text in current results to model topics.";
        this.reset();
        return;
      }

      const tNlp = performance.now();

      const NPASSES = 5;
      let phrased = tokenized;
      let bigramsKept = 0, bigramsMerged = 0;
      const phraseExamples = [], phrasesPerPass = [];
      for (let pass = 0; pass < NPASSES; pass++) {
        this.progress = `Detecting phrases (pass ${pass + 1}/${NPASSES})...`;
        await new Promise(r => setTimeout(r, 0));
        const out = detectAndMergeBigrams(phrased, { minCount: 3, threshold: 5 });
        phrasesPerPass.push(out.kept);
        if (out.kept === 0) break;
        phrased = out.docs;
        bigramsKept += out.kept;
        bigramsMerged += out.merged;
        phraseExamples.push(...out.examples);
      }
      const tBigram = performance.now();

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
      const ldaOpts = (k, quick) => ({
        iterations: quick ? 50 : 300, burnIn: quick ? 15 : 50,
        thinInterval: quick ? 10 : 20, sampleLag: quick ? 5 : 10,
        // α — kept high (Griffiths 50/K). These documents are long, multi-topic
        // debates, so letting each doc express many topics yields finer, cleaner
        // topics; forcing them peaky would manufacture thin topics.
        docTopicPrior: 50 / k,
        wordTopicPrior: 0.03,
        minDocFreq, maxDocFreq,
        seedGroups: TopicPipeline.#seedGroups,
        seedStrength,
        sequentialSmoothing: 0.7,
      });

      const EPS = 1e-12;
      const jsdPair = (pi, pj) => {
        let s = 0;
        for (let v = 0; v < pi.length; v++) {
          const m = (pi[v] + pj[v]) * 0.5;
          if (pi[v] > EPS) s += pi[v] * Math.log(pi[v] / (m + EPS));
          if (pj[v] > EPS) s += pj[v] * Math.log(pj[v] / (m + EPS));
        }
        return s * 0.5;
      };

      // δ controls topic granularity in the Deveaud RD score: higher → prefer
      // fewer, coarser topics. Tested on real per-group result-set corpora,
      // 0.01 over-fragmented (K≈13-16 with many near-duplicate "land ceiling"
      // topics); 0.04 lands K≈6-8 with distinct topics on the same data.
      const DELTA = 0.04;
      const rdForRun = (phiK, thetaK, k) => {
        const p = new Array(k).fill(0);
        for (const t of thetaK) for (let i = 0; i < k; i++) p[i] += t[i];
        const pSum = p.reduce((a, b) => a + b, 0);
        for (let i = 0; i < k; i++) p[i] /= (pSum || 1);
        let rd = DELTA * DELTA;
        for (let i = 0; i < k; i++) {
          for (let j = 0; j < k; j++) {
            const w = p[i] * p[j] - DELTA * DELTA;
            if (w > 0) rd += jsdPair(phiK[i], phiK[j]) * w;
          }
        }
        return rd;
      };

      // Topic count: the RD sweep is free to choose fine granularity (up to
      // ~1 topic per 6 docs — these multi-topic debates support it), with an
      // adaptive floor so tiny groups aren't forced to 4. For N<20 the old
      // K_MAX<K_MIN left K stuck at 4 with no sweep.
      const K_MIN = Math.max(2, Math.min(4, Math.round(N / 14)));
      const K_MAX = Math.max(K_MIN, Math.min(SEED_GROUPS.length + 20, Math.floor(N / 6)));
      let bestK = K_MIN, bestRD = -Infinity;
      for (let kc = K_MIN; kc <= K_MAX; kc += 2) {
        this.progress = `Finding K · scanning ${kc}/${K_MAX}...`;
        await new Promise(r => setTimeout(r, 0));
        const { phi: phiK, theta: thetaK } = lda(phrased, kc, 5, ldaOpts(kc, true));
        if (!phiK || !phiK.length) continue;
        const rd = rdForRun(phiK, thetaK, kc);
        if (rd > bestRD) { bestRD = rd; bestK = kc; }
      }

      this.progress = `K=${bestK} · Running full model (${phrased.length} docs)...`;
      await new Promise(r => setTimeout(r, 0));
      const K = bestK;
      const { topics: ldaTopics, theta, vocab, prunedByMax, phi, seedMatched, seedTotal } =
        lda(phrased, K, 100, ldaOpts(K, false));

      if (theta.length < 4 || vocab.length === 0) {
        this.progress = "Topic model collapsed (vocabulary too small).";
        this.reset();
        return;
      }
      const tLda = performance.now();

      const assignments = theta.map(t => TopicPipeline.#argmax(t));
      const probs       = theta.map((t, j) => t[assignments[j]]);

      // P(Z=k) and per-topic distinctiveness for display ordering.
      const pK = new Array(K).fill(0);
      for (const t of theta) for (let k = 0; k < K; k++) pK[k] += t[k];
      const pKSum = pK.reduce((a, b) => a + b, 0);
      for (let k = 0; k < K; k++) pK[k] /= (pKSum || 1);
      const topicJSD = new Array(K).fill(0);
      for (let i = 0; i < K; i++) {
        let wSum = 0;
        for (let j = 0; j < K; j++) {
          if (i === j) continue;
          topicJSD[i] += jsdPair(phi[i], phi[j]) * pK[j];
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

      // Bucket docs by dominant topic — no coordinates yet (lazy t-SNE).
      const counts  = new Array(K).fill(0);
      const buckets = Array.from({ length: K }, () => []);
      for (let j = 0; j < theta.length; j++) {
        const k = assignments[j];
        counts[k]++;
        buckets[k].push({ j, prob: probs[j], hit: meta[j].hit, idx: meta[j].idx });
      }

      this.rawClusters = order.map((k) => {
        const items = buckets[k].slice().sort((a, b) => b.prob - a.prob);
        const allTerms = (ldaTopics[k] || []).map(t => ({
          term: t.term, probability: t.probability,
          pw: (tokenFreq.get(t.term) || 0) / (totalTokens || 1),
        }));
        return { topic: k, allTerms, coherence: topicJSD[k], count: counts[k], items };
      });

      this.#theta = theta;
      this.stats = {
        hits: cappedHits.length, modeledDocs: tokenized.length, vocab: vocab.length,
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

  // Lazy 2-D projection: t-SNE over the retained θ, back-filling per-cluster and
  // global normalized coordinates onto each cluster's member items. Idempotent.
  async project() {
    if (!browser || this.projected || this.projecting || !this.#theta) return;
    this.projecting = true;
    try {
      const { TSNE } = await import("$lib/topic-modelling/tsne.js");
      const theta = this.#theta;
      const t0 = performance.now();
      const perplexity = Math.min(30, Math.max(5, Math.floor(theta.length / 4)));
      const tsne = new TSNE({ dim: 2, perplexity, epsilon: 10 });
      tsne.initDataRaw(theta);
      for (let it = 0; it < 250; it++) tsne.step();
      const globalRaw = tsne.getSolution();

      let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity;
      for (const p of globalRaw) {
        if (p[0] < gMinX) gMinX = p[0]; if (p[0] > gMaxX) gMaxX = p[0];
        if (p[1] < gMinY) gMinY = p[1]; if (p[1] > gMaxY) gMaxY = p[1];
      }
      const gRx = (gMaxX - gMinX) || 1, gRy = (gMaxY - gMinY) || 1;
      const SPREAD = 0.7;

      this.rawClusters = this.rawClusters.map((c) => {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const it of c.items) {
          const gx = globalRaw[it.j][0], gy = globalRaw[it.j][1];
          if (gx < minX) minX = gx; if (gx > maxX) maxX = gx;
          if (gy < minY) minY = gy; if (gy > maxY) maxY = gy;
        }
        const rx = (maxX - minX) || 1, ry = (maxY - minY) || 1;
        const items = c.items.map((it) => {
          const gx = globalRaw[it.j][0], gy = globalRaw[it.j][1];
          return {
            ...it,
            nx: c.items.length === 1 ? 0.5 : 0.5 + ((gx - minX) / rx - 0.5) * SPREAD,
            ny: c.items.length === 1 ? 0.5 : 0.5 + ((gy - minY) / ry - 0.5) * SPREAD,
            ngx: (gx - gMinX) / gRx,
            ngy: (gy - gMinY) / gRy,
          };
        });
        return { ...c, items };
      });
      if (this.stats) this.stats = { ...this.stats, tsneMs: Math.round(performance.now() - t0) };
      this.projected = true;
    } catch (err) {
      console.error("TopicPipeline.project failed:", err);
    } finally {
      this.projecting = false;
    }
  }
}
