<script>
  import { browser } from "$app/environment";
  import { untrack, tick } from "svelte";
  import { TOPIC_STOPWORDS } from "$lib/topic-stopwords.js";
  // d3-zoom: pan/wheel-zoom and touch gestures on the cluster canvas.
  import { select as d3select } from "d3-selection";
  import { zoom as d3zoom, zoomIdentity } from "d3-zoom";

 

  const hitTitle = (hit, i) => hit.title_en || hit.subject || `Document ${i + 1}`;

  // Strip all HTML except <strong>…</strong> so the API's highlight tags
  // render safely via {@html} without allowing arbitrary markup.
  function sanitizeHighlight(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/&lt;strong&gt;/g, "<strong>")
      .replace(/&lt;\/strong&gt;/g, "</strong>");
  }

  // First matched chunk text, falling back to __discussions.
  const hitExcerpt = (hit) => hit._matchedChunks?.[0]?.text || hit.__discussions || "";

  // ── TopicPipeline ──── NLP/LDA/t-SNE pipeline → clusters ──────────────────
  class TopicPipeline {
    static #MAX_DOCS           = 1000;
    static #MAX_TOKENS_PER_DOC = 1900;
    // Global token cap — bigram counting is O(total tokens) and a 1000-doc
    // search of long debates can blow JS heap without this.
    static #MAX_TOTAL_TOKENS   = 800_000;
    static #KEEP_POS  = new Set(["NOUN", "PROPN", "ADJ"]);
    static #NON_LATIN = /[^ -ɏ]/;

    static #argmax(a) {
      let m = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[m]) m = i;
      return m;
    }
    static #hitText(hit) {
      return (hit._matchedChunks || []).map(c => c.text).filter(Boolean).join(" ")
        || hit.__discussions || "";
    }

    numTopics   = $state(12);
    // λ: 1 = top-probability (common), 0 = pure lift (distinctive), 0.6 = LDAvis default mix.
    lambda      = $state(0.6);
    processing  = $state(false);
    progress    = $state("");
    stats       = $state(null);
    rawClusters = $state([]);  // {topic, allTerms:[{term,probability,pw}], coherence, count, items}[]

    #lastSig   = "";
    #cachedNlp = null;

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
      const K   = this.numTopics;
      const sig = `${hits?.length ?? 0}:${K}:${query}`;
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
          import("$lib/lda.js"), import("$lib/tsne.js"), import("$lib/bigrams.js"),
        ]);

        if (!this.#cachedNlp) {
          const [winkNLPmod, modelMod] = await Promise.all([
            import("wink-nlp"), import("wink-eng-lite-web-model"),
          ]);
          this.#cachedNlp = winkNLPmod.default(modelMod.default);
        }
        const nlp = this.#cachedNlp, its = nlp.its;

        const cappedHits = hits.slice(0, TopicPipeline.#MAX_DOCS);
        this.progress = `Tokenizing ${cappedHits.length} documents...`;
        await new Promise(r => setTimeout(r, 0));

        // Per-run stopwords from the search query — the query appears in every
        // hit by definition so it carries no discriminating signal.
        const queryStopwords = new Set();
        if (query && query.trim()) {
          nlp.readDoc(query.trim()).tokens().each((t) => {
            const n = t.out(its.normal);
            if (!n) return;
            if (TopicPipeline.#NON_LATIN.test(n)) {
              for (const piece of n.toLowerCase().split(/\s+/)) {
                const term = piece.replace(/[^\p{L}\p{M}]/gu, "");
                if (term.length >= 2) queryStopwords.add(term);
              }
              return;
            }
            if (t.out(its.type) !== "word") return;
            const lem = (t.out(its.lemma) || n).toLowerCase().replace(/[^\p{L}]/gu, "");
            if (lem.length >= 2) queryStopwords.add(lem);
          });
        }

        const tokenized = [], meta = [];
        let stoppedCount = 0, keptTokens = 0, queryStopped = 0;
        for (let i = 0; i < cappedHits.length; i++) {
          if (keptTokens >= TopicPipeline.#MAX_TOTAL_TOKENS) break;
          const hit  = cappedHits[i];
          const text = TopicPipeline.#hitText(hit);
          if (!text || text.length < 40) continue;
          const lemmas = [];
          nlp.readDoc(text).tokens().each((t) => {
            if (lemmas.length >= TopicPipeline.#MAX_TOKENS_PER_DOC) return;
            const normal = t.out(its.normal);
            if (!normal) return;

            // Non-Latin script (Tamil, Devanagari, …): winkNLP types these as
            // "alien" not "word", and sometimes lumps multi-word runs into one
            // token — so we script-detect first, split on whitespace, and
            // keep \p{L}+\p{M} (combining marks matter: அனுமதி → matras lost
            // without them would become அனமத).
            if (TopicPipeline.#NON_LATIN.test(normal)) {
              for (const piece of normal.toLowerCase().split(/\s+/)) {
                const term = piece.replace(/[^\p{L}\p{M}]/gu, "");
                if (term.length < 3) continue;
                if (TOPIC_STOPWORDS.has(term)) { stoppedCount++; continue; }
                if (queryStopwords.has(term)) { queryStopped++; continue; }
                lemmas.push(term);
              }
              return;
            }

            // English path. Strip non-letters from the lemma so "mr." → "mr"
            // gets rejected by the length filter (winkNLP keeps trailing
            // punctuation on some lemmas). Fall back to surface form when the
            // model produces no lemma (numbers, odd tokens).
            if (t.out(its.type) !== "word") return;
            if (t.out(its.stopWordFlag)) { stoppedCount++; return; }
            if (!TopicPipeline.#KEEP_POS.has(t.out(its.pos))) return;
            const lemma = (t.out(its.lemma) || normal).toLowerCase().replace(/[^\p{L}]/gu, "");
            if (lemma.length < 3) return;
            if (TOPIC_STOPWORDS.has(lemma)) { stoppedCount++; return; }
            if (queryStopwords.has(lemma)) { queryStopped++; return; }
            lemmas.push(lemma);
          });
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

        // minDocFreq floor 2 → drops hapaxes. maxDocFreq 0.8 → drops terms in
        // ≥80% of docs (esp. the search query). LDA returns top-50 candidates
        // so the LDAvis relevance re-ranker has room to surface low-λ picks.
        const minDocFreq = Math.max(2, Math.floor(phrased.length * 0.05));
        this.progress = `Running LDA · ${phrased.length} docs · ${K} topics...`;
        await new Promise(r => setTimeout(r, 0));
        const { topics: ldaTopics, theta, vocab, prunedByMax } = lda(phrased, K, 50, {
          iterations: 300, burnIn: 50, thinInterval: 20, sampleLag: 10,
          alpha: 50 / K, beta: 0.01, minDocFreq, maxDocFreq: 0.6,
        });

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
        const globalRaw  = tsne.getSolution();
        const assignments = theta.map(t => TopicPipeline.#argmax(t));
        const probs       = theta.map((t, j) => t[assignments[j]]);
        const coherence = ldaTopics.map(t => t.slice(0, 5).reduce((s, x) => s + x.probability, 0));
        const order     = ldaTopics.map((_, k) => k).sort((a, b) => coherence[b] - coherence[a]);

        // P(w) for the LDAvis lift denominator. Computed over phrased corpus.
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

        // Per-cluster: normalize t-SNE coords to local bbox, contract by SPREAD
        // toward centroid (display only, t-SNE topology preserved). allTerms
        // carries top-50 candidates with P(w|k)+P(w) so `clusters` getter can
        // re-rank by relevance(λ) without re-running LDA.
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
            nx: items.length === 1 ? 0.5 : 0.5 + ((it.gx - minX) / rx - 0.5) * SPREAD,
            ny: items.length === 1 ? 0.5 : 0.5 + ((it.gy - minY) / ry - 0.5) * SPREAD,
          })).sort((a, b) => b.prob - a.prob);
          const allTerms = (ldaTopics[k] || []).map(t => ({
            term: t.term, probability: t.probability,
            pw: (tokenFreq.get(t.term) || 0) / (totalTokens || 1),
          }));
          return { topic: k, allTerms, coherence: coherence[k], count: counts[k], items: placed };
        });

        this.stats = {
          hits: cappedHits.length, modeledDocs: tokenized.length, vocab: vocab.length,
          keptTokens, stoppedCount, queryStopped,
          queryStopwords: [...queryStopwords],
          prunedByMax: prunedByMax || 0,
          bigramsKept, bigramsMerged, phrasesPerPass,
          bigramExamples: phraseExamples.slice(0, 12),
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
    view            = $state("grid");
    selectedCluster = $state(null);
    hoveredCircle   = $state(null);
    mapCanvas       = $state(null);
    mapRect         = $state(null);
    transform       = $state({ x: 0, y: 0, k: 1 });
    #zoomBehavior   = null;
    #dragMoved      = false;

    open(idx) { this.selectedCluster = idx; this.view = "cluster"; this.resetView(); }
    close()   { this.view = "grid"; this.selectedCluster = null; this.hoveredCircle = null; this.resetView(); }

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
  let { hits = [], query = "", onselect } = $props();

  const pipeline = new TopicPipeline();
  const map      = new ClusterMap();

  // Re-run pipeline on hits / K / query change. run() dedupes via sig.
  $effect(() => {
    hits; pipeline.numTopics; query;
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
    if (map.view !== "cluster" || map.selectedCluster == null) return;
    pipeline.clusters; map.hoveredCircle; map.transform;
    tick().then(() => map.draw(pipeline.clusters));
  });

  // HTML label cards — recomputed whenever transform or clusters change.
  let topLabeled = $derived.by(() => {
    map.view; map.selectedCluster; map.mapRect; map.transform;
    return map.computeLabels(pipeline.clusters);
  });

</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape" && map.view === "cluster") map.close(); }} />

<section class="topic-map">
  <div class="tm-header">
    <span class="tm-title">Topic map</span>
    <label class="tm-label">K
      <input type="number" min="2" max="12" bind:value={pipeline.numTopics}
        class="tm-number" disabled={pipeline.processing} />
    </label>
    <label class="tm-label" title="LDAvis relevance: λ=1 common topic words, λ=0 distinctive. 0.6 recommended.">
      Mix
      <input type="range" min="0" max="1" step="0.05" bind:value={pipeline.lambda} class="tm-slider" />
      <span class="tm-lambda-value">λ {pipeline.lambda.toFixed(2)}</span>
    </label>
    <button class="tm-rerun" disabled={pipeline.processing}
      onclick={() => pipeline.rerun(hits)}>
      {pipeline.processing ? "Working..." : "Re-run"}
    </button>
    {#if pipeline.progress}
      <span class="tm-progress">{pipeline.progress}</span>
    {:else if pipeline.stats}
      {@const s = pipeline.stats}
      <span class="tm-stats">
        {s.modeledDocs}/{s.hits} docs · vocab {s.vocab} · {s.keptTokens} tokens · {s.stoppedCount} stopwords removed{#if s.queryStopped} · {s.queryStopped} query terms removed [{s.queryStopwords.join(', ')}]{/if}{#if s.prunedByMax} · {s.prunedByMax} terms pruned by max-doc-freq (>70%){/if} · phrases [{s.phrasesPerPass?.map((n, i) => `${n} ${i === 0 ? '2-gram' : i === 1 ? '3-gram' : (i + 2) + '-gram'}`).join(' + ') || `${s.bigramsKept} bigrams`}] ({s.bigramsMerged} merges) · NLP {s.nlpMs}ms · phrases {s.bigramMs}ms · LDA {s.ldaMs}ms · t-SNE {s.tsneMs}ms
        {#if s.bigramExamples?.length}
          <span class="tm-bigram-examples"> · examples: {s.bigramExamples.join(", ")}</span>
        {/if}
      </span>
    {/if}
  </div>

  {#if map.view === "grid"}
    {#if pipeline.clusters.length === 0 && !pipeline.processing}
      <div class="tm-empty">{pipeline.progress || "Waiting for search results..."}</div>
    {:else}
      <div class="tm-grid">
        {#each pipeline.clusters as cluster, idx (cluster.topic)}
          <button
            class="tm-cell"
            onclick={() => map.open(idx)}
            title="Open cluster map"
          >
            <div class="tm-cell-count">{cluster.count}</div>
            <ul class="tm-cell-terms">
              {#each cluster.terms.slice(0, 8) as t (t.term)}
                <li class="tm-term">{t.term}</li>
              {/each}
            </ul>
          </button>
        {/each}
      </div>
    {/if}

  {:else if map.view === "cluster" && map.selectedCluster != null}
    {@const cluster = pipeline.clusters[map.selectedCluster]}
    {#if cluster}
      <div class="tm-cluster-view">
        <header class="tm-cluster-head">
          <button class="tm-back" onclick={() => map.close()}>← All topics</button>
          <div class="tm-zoom-btns" title="Or hold Ctrl + scroll">
            <button class="tm-zoom-btn" onclick={() => map.zoomBy(1.4)}>+</button>
            <button class="tm-zoom-btn" onclick={() => map.zoomBy(1 / 1.4)}>−</button>
            <button class="tm-zoom-btn" onclick={() => map.resetView()}
              disabled={map.transform.x === 0 && map.transform.y === 0 && map.transform.k === 1}>
              ⟲
            </button>
          </div>
          <h3 class="tm-cluster-title">
            {#each cluster.terms.slice(0, 5) as t (t.term)}
              <span class="tm-cluster-term">{t.term}</span>
            {/each}
          </h3>
          <span class="tm-cluster-count">{cluster.count} docs</span>
        </header>

        <div class="tm-map-wrap">
          <!-- d3-zoom owns pan/wheel-zoom; we only handle hover + click. -->
          <canvas
            bind:this={map.mapCanvas}
            class="tm-map"
            onmousemove={(e) => map.onMove(e, pipeline.clusters)}
            onmouseleave={() => map.onLeave()}
            onclick={(e) => map.onClick(e, pipeline.clusters, onselect)}
          ></canvas>

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
                <p class="tm-label-excerpt">{@html sanitizeHighlight(hitExcerpt(r.hit))}</p>
              {/if}
            </div>
          {/each}

          {#if map.hoveredCircle}
            {@const hov = map.hoveredCircle}
            <div class="tm-hover-tip">
              <div class="tm-tip-title">{hitTitle(hov.hit, hov.idx)}</div>
              {#if hitExcerpt(hov.hit)}
                <p class="tm-tip-excerpt">{@html sanitizeHighlight(hitExcerpt(hov.hit))}</p>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</section>

<style lang="postcss">
  .topic-map { @apply mb-3 bg-white/60 backdrop-blur-sm rounded-lg border border-primary/30; }

  .tm-header { @apply flex items-center gap-3 px-3 py-2 border-b border-primary/20 flex-wrap; }
  .tm-title  { @apply text-[11px] font-bold text-black/70 uppercase tracking-wider; }
  .tm-label  { @apply flex items-center gap-1 text-[10px] font-semibold text-black/60 uppercase tracking-wider; }
  .tm-number { @apply w-12 text-[11px] px-1.5 py-0.5 rounded border border-primary/30 bg-white/80 font-mono; }
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

  .tm-grid {
    @apply grid gap-2 p-3;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }
  .tm-cell {
    @apply relative rounded-lg p-3 text-left cursor-pointer transition-all bg-white/70 hover:bg-white/90;
    border: 6px double rgba(0, 0, 0, 0.18);
    aspect-ratio: 1 / 1; min-height: 140px;
  }
  .tm-cell:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.1); transform: translateY(-1px); }
  .tm-cell::after { content: ""; }
  .tm-cell-count {
    @apply absolute top-1.5 right-2 text-[10px] font-mono font-bold px-1.5 rounded bg-black/10 text-black/50;
  }
  .tm-cell-terms { @apply h-full flex flex-col gap-0 pr-6 pt-1 pl-1 m-0 list-none overflow-hidden; }
  .tm-term {
    @apply text-[12px] font-medium leading-snug truncate text-black/70;
  }
  .tm-term::before { content: "· "; opacity: 0.4; }

  .tm-cluster-view { @apply p-3; }
  .tm-cluster-head { @apply flex items-center gap-3 mb-2 flex-wrap; }
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
    @apply relative w-full rounded-lg border border-primary/20 bg-white/40 overflow-hidden;
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
