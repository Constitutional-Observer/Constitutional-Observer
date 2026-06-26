<script>
  import { browser } from "$app/environment";
  import { untrack, tick } from "svelte";
  import { TOPIC_STOPWORDS } from "$lib/topic-modelling/topic-stopwords.js";
  import { TOPIC_PHRASES, PHRASE_MERGED_SET, SEED_GROUPS } from "$lib/topic-modelling/topic-phrases.js";
  import { applyPhrases } from "$lib/topic-modelling/phrase-matcher.js";
  import { renderHighlight } from "$lib/highlight.js";

  import { select as d3select } from "d3-selection";
  import { zoom as d3zoom, zoomIdentity } from "d3-zoom";

 

  const hitTitle = (hit, i) => hit.title_en || hit.subject || `Document ${i + 1}`;

  const humanTerm = (term) => {
    const s = term.replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  // First matched chunk text with Meilisearch highlight tags, falling back to
  // plain text / __discussions. The highlighted form lets cluster excerpts show
  // the matched search terms (rendered via sanitizeHighlight + {@html}).
  const hitExcerpt = (hit) =>
    hit._matchedChunks?.[0]?.textHL ||
    hit._matchedChunks?.[0]?.text ||
    hit._formatted?.__discussions ||
    hit.__discussions ||
    "";

  // ── TopicPipeline ──── NLP/LDA/t-SNE pipeline → clusters ──────────────────
  class TopicPipeline {
    static #MAX_DOCS           = 1000;
    static #MAX_TOKENS_PER_DOC = 1900;
    // Global token cap — bigram counting is O(total tokens) and a 1000-doc
    // search of long debates can blow JS heap without this.
    static #MAX_TOTAL_TOKENS   = 800_000;
    static #KEEP_POS  = new Set(["NOUN", "PROPN"]);
    static #NON_LATIN = /[^ -ɏ]/;

    static #argmax(a) {
      let m = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[m]) m = i;
      return m;
    }
    static #hitText(hit) {
      return (hit._matchedChunks || []).map(c => c.text).filter(Boolean).join(" ")
        || hit.__discussions || "";
    }

    // λ: 1 = top-probability (common), 0 = pure lift (distinctive), 0.6 = LDAvis default mix.
    lambda      = $state(0.6);
    processing  = $state(false);
    progress    = $state("");
    stats       = $state(null);
    rawClusters = $state([]);  // {topic, allTerms:[{term,probability,pw}], coherence, count, items}[]

    #lastSig            = "";
    #cachedNlp          = null;
    #cachedSeedGroups   = null; // SEED_GROUPS with unigrams lemmatized via winkNLP

    // LDAvis relevance:  λ·log P(w|k) + (1−λ)·log[ P(w|k) / P(w) ].
    // Re-ranking is cheap (K × 30 candidates) so it re-derives on every λ tick.
    // Sievert & Shirley (2014), "LDAvis".
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
        ...c, terms: TopicPipeline.#rankTerms(c.allTerms, lam).slice(0, 8),
      }));
    }

    reset() { this.rawClusters = []; this.stats = null; this.processing = false; }
    rerun(hits, query = "") { this.#lastSig = ""; this.run(hits, query); }

    async run(hits, query = "") {
      if (!browser) return;
      const sig = `${hits?.length ?? 0}:${query}`;
      if (sig === this.#lastSig) return;
      this.#lastSig = sig;

      if (!hits || hits.length < 4) {
        this.progress = "Need at least 4 results to model topics.";
        this.reset();
        return;
      }

      this.processing = true;
      const t0 = performance.now();
      this.progress = "Loading NLP model...";

      try {
        const [{ default: lda }, { TSNE }, { default: detectAndMergeBigrams }] = await Promise.all([
          import("$lib/topic-modelling/lda.js"), import("$lib/topic-modelling/tsne.js"), import("$lib/topic-modelling/bigrams.js"),
        ]);

        if (!this.#cachedNlp) {
          const [winkNLPmod, modelMod] = await Promise.all([
            import("wink-nlp"), import("wink-eng-lite-web-model"),
          ]);
          this.#cachedNlp = winkNLPmod.default(modelMod.default);
          // Pre-lemmatize unigram seeds using the same normalizer that builds the vocab.
          // Multi-word phrases are left as-is (they're already written in lemma form and
          // will be phrase-merged to underscore form before the vocab is built).
          const _nlp = this.#cachedNlp, _its = _nlp.its;
          this.#cachedSeedGroups = SEED_GROUPS.map(group =>
            group.map(phrase => {
              const trimmed = phrase.trim().toLowerCase();
              if (trimmed.includes(" ")) return trimmed;
              const tok = _nlp.readDoc(trimmed).tokens().itemAt(0);
              const lemma = tok ? tok.out(_its.lemma) : null;
              return (lemma || trimmed).toLowerCase().replace(/[^\p{L}\p{M}]/gu, "");
            })
          );
        }
        const nlp = this.#cachedNlp, its = nlp.its;

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

          // Build the doc's RAW lemma stream (no filtering yet) with parallel
          // drop flags. We need the unfiltered stream so curated multi-word
          // phrases like "right to information" can match — the joiner "to"
          // would otherwise be dropped by the stopword filter before the
          // phrase matcher ever sees it.
          const rawLemmas = [], dropFlag = [];
          nlp.readDoc(text).tokens().each((t) => {
            if (rawLemmas.length >= TopicPipeline.#MAX_TOKENS_PER_DOC) return;
            const normal = t.out(its.normal);
            if (!normal) return;

            // Non-Latin script: keep \p{L}+\p{M} so Indic matras survive.
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

            // English path. Strip non-letters from the lemma so "mr." → "mr"
            // is too short to pass; fall back to surface form when no lemma.
            if (t.out(its.type) !== "word") return;
            const rawLemma = t.out(its.lemma) || normal;
            const lemma = rawLemma.toLowerCase().replace(/[^\p{L}]/gu, "");
            if (lemma.length < 2) return;
            // Accented Latin (U+00C0–U+024F) in English-path text = PDF OCR artifact; drop.
            if (/[À-ɏ]/.test(lemma)) return;
            let drop = false;
            if (lemma.length < 3) drop = true;
            else if (t.out(its.stopWordFlag)) { drop = true; stoppedCount++; }
            else if (!TopicPipeline.#KEEP_POS.has(t.out(its.pos))) drop = true;
            else if (TOPIC_STOPWORDS.has(lemma)) { drop = true; stoppedCount++; }
            rawLemmas.push(lemma);
            dropFlag.push(drop);
          });

          // Lexicon phrase match runs against the unfiltered stream. Then we
          // emit the matcher output: phrase merges unconditionally, single
          // tokens only if their drop flag is false.
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

        // Phrase detection (pre-LDA). Multi-pass: each pass treats merged
        // tokens as input, so "land use" → "land_use" (pass 1), then
        // "agricultural land_use" → "agricultural_land_use" (pass 2 = trigram).
        // Loop bails early when no more phrases clear the threshold.
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

        // 1% doc-frequency floor — keeps domain-specific terms while dropping words seen in only 1 doc.
        // The old 5% floor was too aggressive: for 651 docs it set minDocFreq=32,
        // leaving only 202 vocab words and almost no seed matches.
        const minDocFreq = Math.max(2, Math.floor(phrased.length * 0.007));
        const ldaOpts = (k, quick) => ({
          iterations: quick ? 50 : 300, burnIn: quick ? 15 : 50,
          thinInterval: quick ? 10 : 20, sampleLag: quick ? 5 : 10,
          // α — document-topic Dirichlet prior; 50/K is the symmetric Griffiths heuristic.
          docTopicPrior: 50 / k,
          // β — topic-word Dirichlet prior (Blei et al. 2003 §2).
          wordTopicPrior: 0.03,
          minDocFreq, maxDocFreq: 0.3,
          seedGroups: this.#cachedSeedGroups,
          // μ* — total seed pseudo-count per topic (Lu et al. 2011 §3.2).
          // With ~18 seeds/topic: ω ≈ μ*/18. At 30 → ω≈1.7 (strong guidance,
          // corpus still contributes); at 70 → ω≈3.9 (topics locked to seeds).
          seedStrength: 30,
          // γ — sequential carry-over from previous document (Watanabe & Baturo 2024 Eq. 7).
          sequentialSmoothing: 0.7,
        });

        // JSD between two phi rows — used in sweep and in post-LDA quality scoring.
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

        // Regularized divergence score for a given LDA run (Deveaud et al. 2014).
        // δ controls granularity: lower δ → prefer more, finer topics.
        // 0.05 = medium (paper default); 0.02 = fine (better for large corpora).
        const DELTA = 0.01
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

        // K-sweep: quick LDA runs over the candidate range, pick K with highest RD.
        // Upper bound: 1 topic per 5 docs (keeps topics stable) but never more than
        // seed groups + 20 (avoids pointlessly thin residual topics).
        const K_MIN = 4;
        const K_MAX = Math.min(SEED_GROUPS.length + 20, Math.floor(phrased.length / 5));
        let bestK = K_MIN, bestRD = -Infinity;
        for (let kc = K_MIN; kc <= K_MAX; kc += 3) {
          this.progress = `Finding K · scanning ${kc}/${K_MAX}...`;
          await new Promise(r => setTimeout(r, 0));
          const { phi: phiK, theta: thetaK } = lda(phrased, kc, 5, ldaOpts(kc, true));
          if (!phiK || !phiK.length) continue;
          const rd = rdForRun(phiK, thetaK, kc);
          if (rd > bestRD) { bestRD = rd; bestK = kc; }
        }

        // Full LDA run at the found optimal K.
        this.progress = `K=${bestK} · Running full model (${phrased.length} docs)...`;
        await new Promise(r => setTimeout(r, 0));
        const K = bestK;
        const { topics: ldaTopics, theta, vocab, prunedByMax, phi, seedMatched, seedTotal, seedMatchedPhrases } =
          lda(phrased, K, 100, ldaOpts(K, false));
        console.log(`[TopicMap] Seed phrases found (${seedMatched}/${seedTotal}):`, seedMatchedPhrases);

        if (theta.length < 4 || vocab.length === 0) {
          this.progress = "Topic model collapsed (vocabulary too small).";
          this.reset();
          return;
        }

        const tLda = performance.now();
        this.progress = "Projecting with t-SNE...";
        await new Promise(r => setTimeout(r, 0));
        const perplexity = Math.min(30, Math.max(5, Math.floor(theta.length / 4)));
        const tsne = new TSNE({ dim: 2, perplexity, epsilon: 10 });
        tsne.initDataRaw(theta);
        for (let it = 0; it < 250; it++) tsne.step();
        const globalRaw   = tsne.getSolution();
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
        // Sort by distinctiveness: most distinct topic first.
        const order = ldaTopics.map((_, k) => k).sort((a, b) => topicJSD[b] - topicJSD[a]);

        // P(w) for the LDAvis lift denominator.
        let totalTokens = 0;
        const tokenFreq = new Map();
        for (const doc of phrased) {
          totalTokens += doc.length;
          for (const w of doc) tokenFreq.set(w, (tokenFreq.get(w) || 0) + 1);
        }

        // Bucket docs by dominant topic.
        const counts  = new Array(K).fill(0);
        const buckets = Array.from({ length: K }, () => []);
        for (let j = 0; j < theta.length; j++) {
          const k = assignments[j];
          counts[k]++;
          buckets[k].push({ j, gx: globalRaw[j][0], gy: globalRaw[j][1], prob: probs[j], hit: meta[j].hit, idx: meta[j].idx });
        }

        // Global t-SNE extent — used to place every dot in one shared scatter
        // (overview view) so clusters keep their real relative positions.
        let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity;
        for (const p of globalRaw) {
          if (p[0] < gMinX) gMinX = p[0]; if (p[0] > gMaxX) gMaxX = p[0];
          if (p[1] < gMinY) gMinY = p[1]; if (p[1] > gMaxY) gMaxY = p[1];
        }
        const gRx = (gMaxX - gMinX) || 1, gRy = (gMaxY - gMinY) || 1;

        const SPREAD = 0.7;
        this.rawClusters = order.map((k) => {
          const items = buckets[k];
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const it of items) {
            if (it.gx < minX) minX = it.gx; if (it.gx > maxX) maxX = it.gx;
            if (it.gy < minY) minY = it.gy; if (it.gy > maxY) maxY = it.gy;
          }
          const rx = (maxX - minX) || 1, ry = (maxY - minY) || 1;
          const placed = items.map(it => ({
            ...it,
            // Per-cluster normalized coords (spread to fill the zoomed view).
            nx: items.length === 1 ? 0.5 : 0.5 + ((it.gx - minX) / rx - 0.5) * SPREAD,
            ny: items.length === 1 ? 0.5 : 0.5 + ((it.gy - minY) / ry - 0.5) * SPREAD,
            // Global normalized coords (shared scatter / overview).
            ngx: (it.gx - gMinX) / gRx,
            ngy: (it.gy - gMinY) / gRy,
          })).sort((a, b) => b.prob - a.prob);
          const allTerms = (ldaTopics[k] || []).map(t => ({
            term: t.term, probability: t.probability,
            pw: (tokenFreq.get(t.term) || 0) / (totalTokens || 1),
          }));
          return { topic: k, allTerms, coherence: topicJSD[k], count: counts[k], items: placed };
        });

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
          tsneMs:   Math.round(performance.now() - tLda),
        };
        this.progress = "";
      } catch (err) {
        console.error("TopicMap pipeline failed:", err);
        this.progress = "Error: " + (err.message || err);
      } finally {
        this.processing = false;
      }
    }
  }

  // ── ClusterMap ──── view state + d3-zoom + canvas label drawing ─────────
  class ClusterMap {
    static #PAD       = 32;
    static #SCALE_MIN = 0.2;
    static #SCALE_MAX = 4;

    view            = $state("overview");   // "overview" (scatter+boxes) | "cluster"
    selectedCluster = $state(null);
    hoveredCircle   = $state(null);
    hoveredBox      = $state(null);          // cluster idx under cursor in overview
    mapCanvas       = $state(null);
    mapRect         = $state(null);
    transform       = $state({ x: 0, y: 0, k: 1 });
    #zoomBehavior   = null;
    #dragMoved      = false;

    open(idx) { this.selectedCluster = idx; this.view = "cluster"; this.hoveredBox = null; this.resetView(); }
    close()   { this.view = "overview"; this.selectedCluster = null; this.hoveredCircle = null; this.resetView(); }

    attachZoom() {
      if (!this.mapCanvas) return;
      this.#zoomBehavior = d3zoom()
        .scaleExtent([ClusterMap.#SCALE_MIN, ClusterMap.#SCALE_MAX])
        // Wheel zoom only fires when Ctrl is held — keeps page scroll free.
        .filter(ev => ev.type !== "wheel" || ev.ctrlKey)
        .on("start", () => { this.#dragMoved = false; })
        .on("zoom",  (ev) => {
          if (ev.sourceEvent?.type !== "wheel") this.#dragMoved = true;
          this.transform = { x: ev.transform.x, y: ev.transform.y, k: ev.transform.k };
        });
      d3select(this.mapCanvas).call(this.#zoomBehavior);
    }

    zoomBy(factor) {
      if (!this.#zoomBehavior || !this.mapCanvas) return;
      d3select(this.mapCanvas).call(this.#zoomBehavior.scaleBy, factor);
    }

    resetView() {
      if (this.#zoomBehavior && this.mapCanvas) {
        d3select(this.mapCanvas).call(this.#zoomBehavior.transform, zoomIdentity);
      }
      this.transform = { x: 0, y: 0, k: 1 };
    }

    #toPx(it, w, h) {
      const pad = ClusterMap.#PAD;
      return {
        cx: (pad + it.nx * (w - pad * 2)) * this.transform.k + this.transform.x,
        cy: (pad + (1 - it.ny) * (h - pad * 2)) * this.transform.k + this.transform.y,
      };
    }

    pick(clientX, clientY, clusters) {
      if (!this.mapCanvas || this.selectedCluster == null) return null;
      const cluster = clusters[this.selectedCluster];
      if (!cluster) return null;
      const rect = this.mapCanvas.getBoundingClientRect();
      const mx = clientX - rect.left, my = clientY - rect.top;
      let best = null, bestD = 400;
      for (const it of cluster.items) {
        const { cx, cy } = this.#toPx(it, rect.width, rect.height);
        const d = (cx - mx) ** 2 + (cy - my) ** 2;
        if (d < bestD) { bestD = d; best = it; }
      }
      return best;
    }

    onMove(e, clusters) {
      const p = this.pick(e.clientX, e.clientY, clusters);
      if (!p && this.hoveredCircle) { this.hoveredCircle = null; return; }
      if (p && this.hoveredCircle?.j !== p.j) this.hoveredCircle = p;
    }
    onLeave() { this.hoveredCircle = null; }
    onClick(e, clusters, onselect) {
      if (this.#dragMoved) { this.#dragMoved = false; return; }
      const p = this.pick(e.clientX, e.clientY, clusters);
      if (p) onselect?.(p.idx);
    }

    draw(clusters) {
      if (!this.mapCanvas || this.selectedCluster == null) return;
      const cluster = clusters[this.selectedCluster];
      if (!cluster) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = this.mapCanvas.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      const W = Math.max(1, Math.floor(w * dpr));
      const H = Math.max(1, Math.floor(h * dpr));
      if (this.mapCanvas.width  !== W) this.mapCanvas.width  = W;
      if (this.mapCanvas.height !== H) this.mapCanvas.height = H;

      const ctx = this.mapCanvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      // ── Pass 1: dots ──────────────────────────────────
      for (const it of cluster.items) {
        const { cx, cy } = this.#toPx(it, w, h);
        const radius = 3 + Math.min(6, it.prob * 8);
        const hover  = this.hoveredCircle?.j === it.j;
        ctx.beginPath();
        ctx.arc(cx, cy, hover ? radius + 2 : radius, 0, Math.PI * 2);
        ctx.fillStyle   = hover ? "rgba(0,0,0,1)" : "rgba(0,0,0,0.65)";
        ctx.fill();
        ctx.lineWidth   = hover ? 2 : 0.8;
        ctx.strokeStyle = hover ? "#000" : "rgba(0,0,0,0.25)";
        ctx.stroke();
      }

      if (!this.mapRect || this.mapRect.width !== w || this.mapRect.height !== h) {
        this.mapRect = { width: w, height: h };
      }
    }

    // Global-scatter pixel position for a dot (overview view).
    #toPxG(it, w, h) {
      const pad = ClusterMap.#PAD;
      return {
        cx: (pad + it.ngx * (w - pad * 2)) * this.transform.k + this.transform.x,
        cy: (pad + (1 - it.ngy) * (h - pad * 2)) * this.transform.k + this.transform.y,
      };
    }

    // Pixel-space bounding box + opacity for every cluster. Prominence is
    // encoded by transparency (more documents = more opaque), never colour or
    // font size — a fixed label size keeps the field calm. `alpha` runs
    // 0.3 (sparse cluster, recedes) → 1 (largest cluster, pops).
    static #LABEL_FONT = "700 12px ui-sans-serif, system-ui, sans-serif";
    overviewBoxes(clusters, w, h) {
      const maxCount = Math.max(1, ...clusters.map(c => c.count || c.items.length));
      const BPAD = 14;
      return clusters.map((cluster, idx) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const it of cluster.items) {
          const { cx, cy } = this.#toPxG(it, w, h);
          if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
          if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
        }
        const frac = (cluster.count || cluster.items.length) / maxCount;
        return {
          idx,
          x0: x0 - BPAD, y0: y0 - BPAD, x1: x1 + BPAD, y1: y1 + BPAD,
          label: cluster.terms.slice(0, 3).map(t => humanTerm(t.term)).join(" · "),
          alpha: 0.3 + 0.7 * frac,               // opacity by document share
          count: cluster.count || cluster.items.length,
        };
      });
    }

    drawOverview(clusters) {
      if (!this.mapCanvas || !clusters.length) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = this.mapCanvas.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      const W = Math.max(1, Math.floor(w * dpr));
      const H = Math.max(1, Math.floor(h * dpr));
      if (this.mapCanvas.width  !== W) this.mapCanvas.width  = W;
      if (this.mapCanvas.height !== H) this.mapCanvas.height = H;

      const ctx = this.mapCanvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const boxes = this.overviewBoxes(clusters, w, h);

      // ── Pass 1: cluster boxes (behind dots) ──────────────
      // Thin solid border only — no fill, no dashes — at the cluster's opacity
      // so sparse clusters recede. Hovered box snaps to full strength.
      for (const b of boxes) {
        const hover = this.hoveredBox === b.idx;
        ctx.beginPath();
        ctx.roundRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, 8);
        ctx.lineWidth   = hover ? 2 : 1;
        ctx.strokeStyle = `rgba(0,0,0,${hover ? 0.7 : 0.15 + 0.35 * b.alpha})`;
        ctx.stroke();
      }

      // ── Pass 2: dots (all clusters) — opacity = cluster score ───
      for (let ci = 0; ci < boxes.length; ci++) {
        const a = this.hoveredBox === ci ? 0.95 : 0.2 + 0.6 * boxes[ci].alpha;
        ctx.fillStyle = `rgba(0,0,0,${a})`;
        for (const it of clusters[ci].items) {
          const { cx, cy } = this.#toPxG(it, w, h);
          ctx.beginPath();
          ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── Pass 3: topic labels (fixed size, opacity = cluster score) ───
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.font = ClusterMap.#LABEL_FONT;
      for (const b of boxes) {
        const hover = this.hoveredBox === b.idx;
        const a = hover ? 1 : 0.45 + 0.55 * b.alpha;
        const tx = Math.max(4, Math.min(b.x0 + 6, w - 6 - ctx.measureText(b.label).width));
        const ty = Math.max(2, b.y0 - 16);
        // White halo for legibility over dots.
        ctx.lineWidth = 3;
        ctx.strokeStyle = `rgba(255,255,255,${0.85 * a})`;
        ctx.strokeText(b.label, tx, ty);
        ctx.fillStyle = `rgba(0,0,0,${a})`;
        ctx.fillText(b.label, tx, ty);
      }

      if (!this.mapRect || this.mapRect.width !== w || this.mapRect.height !== h) {
        this.mapRect = { width: w, height: h };
      }
    }

    // Which cluster box is under the cursor (smallest enclosing box wins).
    pickClusterBox(clientX, clientY, clusters) {
      if (!this.mapCanvas) return null;
      const rect = this.mapCanvas.getBoundingClientRect();
      const mx = clientX - rect.left, my = clientY - rect.top;
      const boxes = this.overviewBoxes(clusters, rect.width, rect.height);
      let best = null, bestArea = Infinity;
      for (const b of boxes) {
        if (mx >= b.x0 && mx <= b.x1 && my >= b.y0 && my <= b.y1) {
          const area = (b.x1 - b.x0) * (b.y1 - b.y0);
          if (area < bestArea) { bestArea = area; best = b.idx; }
        }
      }
      return best;
    }

    onMoveOverview(e, clusters) {
      const idx = this.pickClusterBox(e.clientX, e.clientY, clusters);
      if (this.hoveredBox !== idx) this.hoveredBox = idx;
    }
    onClickOverview(e, clusters) {
      if (this.#dragMoved) { this.#dragMoved = false; return; }
      const idx = this.pickClusterBox(e.clientX, e.clientY, clusters);
      if (idx != null) this.open(idx);
    }

    // Greedy label placement — no canvas context needed.
    // Returns {j, idx, hit, cx, cy, lx, ly, lw, lh} for each placed label.
    computeLabels(clusters) {
      if (this.view !== "cluster" || this.selectedCluster == null || !this.mapRect) return [];
      const cluster = clusters[this.selectedCluster];
      if (!cluster) return [];

      const { width: w, height: h } = this.mapRect;
      const tr  = this.transform;
      const pad = ClusterMap.#PAD;

      const N   = 80;    // max labels to attempt
      const LW  = 200;   // card width (matches .tm-label-card CSS)
      const LH  = 80;    // estimated card height for collision (title + 3 excerpt lines)
      const GAP = 6;     // dot-to-card gap

      const placed = [];
      const result = [];

      for (let rank = 0; rank < Math.min(N, cluster.items.length); rank++) {
        const it = cluster.items[rank];
        const cx = (pad + it.nx * (w - pad * 2)) * tr.k + tr.x;
        const cy = (pad + (1 - it.ny) * (h - pad * 2)) * tr.k + tr.y;
        if (cx < -LW || cx > w + LW || cy < -LH || cy > h + LH) continue;

        const dotR = 3 + Math.min(6, it.prob * 8) + GAP;
        const candidates = [
          { ox: dotR,       oy: -LH / 2 },
          { ox: -LW - dotR, oy: -LH / 2 },
          { ox: -LW / 2,    oy: -LH - dotR },
          { ox: -LW / 2,    oy: dotR },
          { ox: dotR,       oy: dotR },
          { ox: -LW - dotR, oy: dotR },
        ];

        let pos = null;
        for (const { ox, oy } of candidates) {
          const lx = cx + ox, ly = cy + oy;
          if (lx < 2 || lx + LW > w - 2 || ly < 2 || ly + LH > h - 2) continue;
          if (placed.every(p => lx + LW < p.x || lx > p.x + p.w || ly + LH < p.y || ly > p.y + p.h)) {
            pos = { lx, ly };
            break;
          }
        }
        if (!pos) continue;

        placed.push({ x: pos.lx, y: pos.ly, w: LW, h: LH });
        result.push({ j: it.j, idx: it.idx, hit: it.hit, rank, cx, cy,
                      lx: pos.lx, ly: pos.ly });
      }
      return result;
    }
  }

  // `query` feeds the per-run stopword set so query terms (which every hit
  // contains by definition) don't dominate every topic.
  let { hits = [], query = "", onselect, paginationDone = true } = $props();

  const pipeline = new TopicPipeline();
  const map      = new ClusterMap();

  // Only run after all pages have loaded — avoids re-running LDA on every
  // incremental batch. When paginationDone flips to true it fires once with
  // the final complete hit list; until then the effect returns early.
  $effect(() => {
    hits; query; paginationDone;
    if (!paginationDone) return;
    untrack(() => pipeline.run(hits, query));
  });

  // Drop back to grid if a re-run produces fewer clusters than selected.
  $effect(() => {
    pipeline.clusters;
    untrack(() => {
      if (map.selectedCluster != null && map.selectedCluster >= pipeline.clusters.length) {
        map.close();
      }
    });
  });

  // Wire d3-zoom once when the canvas binds; redraw dots on any state change.
  $effect(() => { if (map.mapCanvas) untrack(() => map.attachZoom()); });
  $effect(() => {
    map.view; map.selectedCluster; map.hoveredCircle; map.hoveredBox; map.transform;
    pipeline.clusters;
    if (!map.mapCanvas) return;
    if (map.view === "overview") {
      tick().then(() => map.drawOverview(pipeline.clusters));
    } else if (map.view === "cluster" && map.selectedCluster != null) {
      tick().then(() => map.draw(pipeline.clusters));
    }
  });

  // HTML label cards — recomputed whenever transform or clusters change.
  let topLabeled = $derived.by(() => {
    map.view; map.selectedCluster; map.mapRect; map.transform;
    return map.computeLabels(pipeline.clusters);
  });

  // Phrases (multi-word merged tokens) currently visible in the topic grid,
  // partitioned by source. Recomputes on λ slider change since the displayed
  // term list per cluster is itself derived from λ via LDAvis relevance.
  let phrasesShown = $derived.by(() => {
    const seen = new Set();
    for (const c of pipeline.clusters) {
      for (const t of c.terms) if (t.term.includes("_")) seen.add(t.term);
    }
    const all = [...seen].sort();
    return {
      lexicon:  all.filter(p => PHRASE_MERGED_SET.has(p)),
      emergent: all.filter(p => !PHRASE_MERGED_SET.has(p)),
      total:    all.length,
    };
  });

</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape" && map.view === "cluster") map.close(); }} />

<section class="topic-map">
  <div class="tm-header">
    <span class="tm-title">Topic map</span>
    {#if pipeline.stats}
      <span class="tm-label">Topics <strong class="tm-kval">{pipeline.stats.K}</strong></span>
    {/if}
    <label class="tm-label" title="LDAvis relevance: λ=1 common topic words, λ=0 distinctive. 0.6 recommended.">
      Mix
      <input type="range" min="0" max="1" step="0.05" bind:value={pipeline.lambda} class="tm-slider" />
      <span class="tm-lambda-value">λ {pipeline.lambda.toFixed(2)}</span>
    </label>
    <button class="tm-rerun" disabled={pipeline.processing}
      onclick={() => pipeline.rerun(hits, query)}>
      {pipeline.processing ? "Working..." : "Re-run"}
    </button>
    {#if pipeline.progress}
      <span class="tm-progress">{pipeline.progress}</span>
    {:else if pipeline.stats}
      {@const s = pipeline.stats}
      <span class="tm-stats">
        {s.modeledDocs}/{s.hits} docs · vocab {s.vocab} · {s.keptTokens} tokens · {s.stoppedCount} stopwords removed{#if s.phrasesMatched} · {s.phrasesMatched} lexicon phrases matched{/if}{#if s.prunedByMax} · {s.prunedByMax} terms pruned by max-doc-freq (>{s.maxDocFreqPct}%){/if} · phrases [{s.phrasesPerPass?.map((n, i) => `${n} ${i === 0 ? '2-gram' : i === 1 ? '3-gram' : (i + 2) + '-gram'}`).join(' + ') || `${s.bigramsKept} bigrams`}] ({s.bigramsMerged} merges) · seeds {s.seedMatched}/{s.seedTotal} · K {s.K} · RD {s.rdScore} · NLP {s.nlpMs}ms · phrases {s.bigramMs}ms · LDA {s.ldaMs}ms · t-SNE {s.tsneMs}ms
        {#if phrasesShown.total}
          <span class="tm-bigram-examples">
            · shown ({phrasesShown.total}): {[
              ...phrasesShown.lexicon.map(p => `★${p}`),
              ...phrasesShown.emergent,
            ].join(", ")}
          </span>
        {/if}
        {#if s.bigramExamples?.length}
          <span class="tm-bigram-examples"> · examples: {s.bigramExamples.join(", ")}</span>
        {/if}
      </span>
    {/if}
  </div>

  {#if pipeline.clusters.length === 0 && !pipeline.processing}
    <div class="tm-empty">{pipeline.progress || "Waiting for search results..."}</div>
  {:else}
    <div class="tm-subhead">
      {#if map.view === "cluster" && map.selectedCluster != null}
        {@const cluster = pipeline.clusters[map.selectedCluster]}
        <button class="tm-back" onclick={() => map.close()}>← All topics</button>
        {#if cluster}
          <h3 class="tm-cluster-title">
            {#each cluster.terms.slice(0, 10) as t (t.term)}
              <span class="tm-cluster-term">{humanTerm(t.term)}</span>
            {/each}
          </h3>
          <span class="tm-cluster-count">{cluster.count} docs</span>
        {/if}
      {:else}
        <span class="tm-hint">Click a topic box to zoom in · hold Ctrl + scroll to zoom · drag to pan</span>
      {/if}
      <div class="tm-zoom-btns" title="Or hold Ctrl + scroll">
        <button class="tm-zoom-btn" onclick={() => map.zoomBy(1.4)}>+</button>
        <button class="tm-zoom-btn" onclick={() => map.zoomBy(1 / 1.4)}>−</button>
        <button class="tm-zoom-btn" onclick={() => map.resetView()}
          disabled={map.transform.x === 0 && map.transform.y === 0 && map.transform.k === 1}>
          ⟲
        </button>
      </div>
    </div>

    <div class="tm-map-wrap">
      <!-- d3-zoom owns pan/wheel-zoom; we only handle hover + click. -->
      <canvas
        bind:this={map.mapCanvas}
        class="tm-map"
        onmousemove={(e) => map.view === "cluster"
          ? map.onMove(e, pipeline.clusters)
          : map.onMoveOverview(e, pipeline.clusters)}
        onmouseleave={() => { map.onLeave(); map.hoveredBox = null; }}
        onclick={(e) => map.view === "cluster"
          ? map.onClick(e, pipeline.clusters, onselect)
          : map.onClickOverview(e, pipeline.clusters)}
      ></canvas>

      {#if map.view === "cluster" && map.selectedCluster != null}
        <!-- Dashed leader lines from each dot to its label card -->
        <svg class="tm-leaders" aria-hidden="true">
          {#each topLabeled as r (r.j)}
            <line
              x1={r.cx} y1={r.cy}
              x2={r.lx < r.cx ? r.lx + 200 : r.lx}
              y2={r.ly + 10}
              class="tm-leader-line"
            />
          {/each}
        </svg>

        <!-- HTML label cards — native click events, {@html} for highlights -->
        {#each topLabeled as r (r.j)}
          <div
            class="tm-label-card"
            style="left: {r.lx}px; top: {r.ly}px"
            onclick={(e) => { e.stopPropagation(); onselect?.(r.idx); }}
            role="button" tabindex="0"
            onkeydown={(e) => { if (e.key === "Enter") onselect?.(r.idx); }}
          >
            <div class="tm-label-title">{hitTitle(r.hit, r.idx)}</div>
            {#if hitExcerpt(r.hit)}
              <p class="tm-label-excerpt">{@html renderHighlight(hitExcerpt(r.hit), selectedClusterTerms)}</p>
            {/if}
          </div>
        {/each}

        {#if map.hoveredCircle}
          {@const hov = map.hoveredCircle}
          <div class="tm-hover-tip">
            <div class="tm-tip-title">{hitTitle(hov.hit, hov.idx)}</div>
            {#if hitExcerpt(hov.hit)}
              <p class="tm-tip-excerpt">{@html renderHighlight(hitExcerpt(hov.hit), selectedClusterTerms)}</p>
            {/if}
          </div>
        {/if}
      {:else if map.hoveredBox != null && pipeline.clusters[map.hoveredBox]}
        {@const hc = pipeline.clusters[map.hoveredBox]}
        <div class="tm-hover-tip">
          <div class="tm-tip-title">{hc.count} documents · click to zoom in</div>
          <p class="tm-tip-excerpt">
            {hc.terms.slice(0, 8).map((t) => humanTerm(t.term)).join(" · ")}
          </p>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style lang="postcss">
  .topic-map { @apply mb-3 bg-white/60 backdrop-blur-sm rounded-lg border border-primary/30; }

  .tm-header { @apply flex items-center gap-3 px-3 py-2 border-b border-primary/20 flex-wrap; }
  .tm-title  { @apply text-[11px] font-bold text-black/70 uppercase tracking-wider; }
  .tm-label  { @apply flex items-center gap-1 text-[10px] font-semibold text-black/60 uppercase tracking-wider; }
  .tm-kval   { @apply font-mono text-black/80 ml-0.5; }
  .tm-slider { @apply w-24 align-middle; }
  .tm-lambda-value { @apply text-[10px] font-mono text-black/60 ml-1; }
  .tm-rerun {
    @apply text-[11px] px-2 py-0.5 rounded border border-primary/30 bg-primary/20 text-black/80 cursor-pointer;
    @apply hover:bg-primary/40 disabled:opacity-50 disabled:cursor-not-allowed;
  }
  .tm-rerun::after { content: ""; }
  .tm-progress { @apply text-[10px] text-black/50 italic; }
  .tm-stats    { @apply text-[9px] text-black/40 font-mono leading-tight; }
  .tm-bigram-examples { @apply text-emerald-700/70; }
  .tm-empty    { @apply px-3 py-6 text-center text-sm text-black/40 italic; }

  .tm-subhead { @apply flex items-center gap-3 px-3 pt-2 pb-1 flex-wrap; }
  .tm-hint { @apply text-[10px] text-black/45 italic; }
  .tm-back {
    @apply text-[11px] px-2 py-0.5 rounded border border-primary/30 bg-white/60 text-black/70 cursor-pointer hover:bg-primary/20;
  }
  .tm-back::after { content: ""; }
  .tm-zoom-btns {
    @apply flex items-center rounded border border-primary/30 overflow-hidden;
  }
  .tm-zoom-btn {
    @apply text-[13px] px-2 py-0.5 bg-white/60 text-black/70 cursor-pointer leading-none;
    @apply hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed;
    border: none;
  }
  .tm-zoom-btn::after { content: ""; }
  .tm-zoom-btn + .tm-zoom-btn { border-left: 1px solid rgba(0,0,0,0.1); }
  .tm-cluster-title { @apply flex flex-wrap gap-1.5 text-sm; }
  .tm-cluster-term {
    @apply font-semibold px-1.5 py-0.5 rounded bg-black/10 text-black/70;
  }
  .tm-cluster-count { @apply text-[10px] text-black/50 font-mono ml-auto; }

  .tm-map-wrap {
    @apply relative rounded-lg border border-primary/20 bg-white/40 overflow-hidden mx-3 mb-3;
    width: auto;
    height: 520px;
  }
  .tm-map        { @apply absolute inset-0 w-full h-full; cursor: grab; touch-action: none; }
  .tm-map:active { cursor: grabbing; }


  .tm-hover-tip {
    @apply absolute top-2 left-2 rounded bg-white/95 border border-primary/30;
    @apply shadow-sm pointer-events-none z-20;
    max-width: 280px;
  }
  .tm-tip-title {
    @apply px-2.5 pt-2 pb-1 text-[11px] font-semibold text-black/80 leading-tight;
  }
  .tm-tip-excerpt {
    @apply px-2.5 pb-2 text-[10px] text-black/55 leading-snug;
    border-top: 1px solid rgba(0,0,0,0.06);
    padding-top: 5px;
    margin-top: 0;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  /* Search API highlight tags rendered as amber marks */
  .tm-tip-excerpt :global(strong) {
    background: rgba(251, 191, 36, 0.45);
    border-radius: 2px;
    padding: 0 1px;
    font-weight: inherit;
  }

  /* SVG leader lines */
  .tm-leaders { @apply absolute inset-0 w-full h-full pointer-events-none; z-index: 5; }
  .tm-leader-line { stroke: rgba(0,0,0,0.2); stroke-width: 1; stroke-dasharray: 3 3; fill: none; }

  /* HTML label cards — native events, full CSS styling */
  .tm-label-card {
    @apply absolute z-10 bg-white/95 rounded-md shadow-sm cursor-pointer overflow-hidden text-left;
    border: 1px solid rgba(0,0,0,0.12);
    width: 200px;
  }
  .tm-label-card:hover { @apply bg-white shadow-md; border-color: rgba(0,0,0,0.22); }
  .tm-label-card::after { content: ""; }
  .tm-label-title {
    @apply px-2 pt-1.5 pb-1 text-[11px] font-semibold text-black/80 leading-tight truncate;
    border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  .tm-label-excerpt {
    @apply px-2 py-1.5 text-[9px] text-black/50 leading-snug;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .tm-label-excerpt :global(strong) {
    background: rgba(251, 191, 36, 0.45);
    border-radius: 2px;
    padding: 0 1px;
    font-weight: inherit;
  }
</style>
