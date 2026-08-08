# Topic Modelling Pipeline

This document describes the end-to-end topic modelling pipeline implemented in
`frontend/src/lib/topic-modelling/topic-pipeline.svelte.js` (orchestration) and
`frontend/src/lib/topic-modelling/lda.js` (Gibbs sampler), plus the plot it feeds
(`frontend/src/lib/components/search/radviz.svelte.js`).

---

## Pipeline overview

```
Search hits (raw parliamentary text)
    │
    ▼
[1] Lemmatization & tokenization       (winkNLP)
    │
    ▼
[2] Statistical phrase detection       (multi-pass bigram merging)
    │
    ▼
[3] Vocabulary pruning                 (doc-frequency floor + ceiling)
    │
    ▼
[4] K-sweep                            (quick LDA × N candidates → RD score → bestK)
    │
    ▼
[5] Full seeded LDA at bestK           (Gibbs sampler, 300 iterations)
    │
    ▼
[6] Document–topic membership          (θ > TOPIC_MIN → multi-topic buckets,
    │                                   each tagged with its second topic)
    ▼
[7] RadViz projection                  (per opened topic: the other topics become
    │                                   named anchors; θ places the documents)
    ▼
Topic plot
```

---

## Stage 1 — Lemmatization & tokenization

Each parliamentary hit is processed by winkNLP:

- tokens are lowercased and lemmatized (e.g. "services" → "service", "constituted" → "constitute")
- punctuation and numerals are stripped
- words shorter than 3 characters are discarded
- stopwords from `topic-stopwords.js` are removed (parliamentary boilerplate, procedural language, etc.)
- documents with fewer than 8 surviving tokens are dropped (too thin to contribute a topic signal)

Seed groups are also pre-lemmatized once on first NLP load so that multi-word
and single-word seeds match the lemmatized vocabulary exactly. Unigrams pass
through the winkNLP lemmatizer; multi-word phrases are kept as-is (already
idiomatic).

---

## Stage 2 — Statistical phrase detection

Multi-word expressions ("right to information", "financial inclusion") are
detected and merged into single tokens using a PMI-based bigram scorer across
up to 5 passes. Each pass feeds its output into the next, building up to
6-grams incrementally.

The merger uses a threshold of 5 (roughly equivalent to NPMI > 0.5 after
log-normalization). A phrase must appear at least 3 times to be considered.

The stats bar reports the merged phrase inventory:
```
phrases [1272 2-gram + 396 3-gram + …] (13011 merges)
```

---

## Stage 3 — Vocabulary pruning

After phrase detection, the vocabulary is built from the merged token stream:

| Filter | Parameter | Current value | Rationale |
|--------|-----------|---------------|-----------|
| `minDocFreq` | minimum documents a term must appear in | `max(2, floor(N × 0.01))` | 1% of corpus — drops words seen in only 1–2 docs while keeping domain-specific terms |
| `maxDocFreq` | maximum fraction of documents a term may appear in | `0.6` | words appearing in >60% of docs are query-specific noise (the search term itself) |

The old `minDocFreq = max(2, floor(N × 0.05))` was too aggressive: for 651
documents it produced `minDocFreq = 32`, stripping the vocabulary down to ~202
words and destroying nearly all seed signal. At 1%, the same corpus gives
`minDocFreq = 6`, retaining ~1000–2000 words.

---

## Stage 4 — K-sweep (algorithmic topic count selection)

The number of topics **K is not fixed or tied to the number of seed groups**.
It is determined algorithmically by running quick LDA experiments across a
range of candidate K values and selecting the one with the highest
*Regularized Topic Divergence* (RD) score.

### Search range

```
K_MIN = 4
K_MAX = min(SEED_GROUPS.length + 8, floor(N_docs / 3))
```

With 20 seed groups: `K_MAX = min(28, floor(N / 3))`.

The `N / 3` cap prevents LDA from being asked for more topics than the data
can support (rough rule: at least 3 documents per topic).

### Sweep step

The sweep advances in **steps of 3** (`kc += 3`), checking
`K = 4, 7, 10, 13, …, K_MAX`. A step of 3 gives ~9 candidates over the full
range, which balances coverage against latency. A step of 2 would give 13
candidates but adds ~30% run time with minimal precision gain for this corpus.

### Quick LDA runs

Each candidate K gets a fast, low-fidelity LDA run:

| Parameter | Sweep value | Full-run value |
|-----------|-------------|----------------|
| `iterations` | 50 | 300 |
| `burnIn` | 15 | 50 |
| `thinInterval` | 10 | 20 |
| `sampleLag` | 5 | 10 |

50 iterations is enough to let the Gibbs chain partially settle — sufficient
for the RD score to distinguish strong peaks from flat regions, not enough for
a publication-quality model.

### Regularized Topic Divergence (RD)

RD measures how distinct the topics are from each other, weighted by how
prevalent each topic is in the corpus.  Higher RD = topics are more
distinguishable, so the model is more informative.

**Based on Deveaud, SanJuan & Bellot (2014).**

```
p_k = P(Z = k)                              (topic prior from theta)

RD = δ² + Σ_i Σ_j  max(0, p_i·p_j − δ²) · JSD(φ_i, φ_j)

where JSD(p, q) = ½ Σ_v [ p_v·log(p_v/m_v) + q_v·log(q_v/m_v) ]
                  m_v = (p_v + q_v) / 2
```

`δ = 0.05` is the granularity regularizer: pairs of topics are only counted
when their joint weight `p_i·p_j` exceeds `δ²`. This prevents rare, nearly-
empty topics from inflating the score.

The K with the highest RD is selected as `bestK`.

---

## Stage 5 — Full Seeded LDA

### Seeded LDA (Lu et al. 2011 / Watanabe & Baturo 2024)

Standard LDA uses a symmetric Dirichlet prior β on the word-topic
distributions. Seeded LDA adds per-word **pseudo-counts** that bias the sampler
toward assigning seed words to their designated topics.

The implementation follows Lu et al.'s frequency-proportional approach:

**Pre-compute pseudo-counts** (once, before Gibbs iterations):

```
seedCount[k] = number of seed words from group k found in vocabulary

omega[w] = muStar / seedCount[k]   if word w is seeded to topic k
         = 0                        otherwise

omegaK[k] = Σ_{w seeded to k} omega[w]          (= muStar, if all seeds found)
betaSumK[k] = V·β + omegaK[k]
```

Each seeded topic receives a total pseudo-count of `muStar`, distributed
uniformly across its seed words that are actually present in the vocabulary.

**Gibbs full conditional** for token (m, n) with word w:

```
P(z_{m,n} = k | rest) ∝

    (N_{kw} + β + [k == seedTopic[w]] · omega[w])
    ─────────────────────────────────────────────  ×  (N_{mk} + α)
           N_{k·} + betaSumK[k]
```

The standard symmetric Dirichlet (`N_{kw} + β`) is augmented by `omega[w]`
only when w is assigned to its seed topic k. The denominator `betaSumK[k]`
accounts for the sum of pseudo-counts in topic k, keeping the distribution
properly normalized.

### Hyperparameters

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `alpha` | `50 / K` | Dirichlet prior on θ (document-topic). `50/K` follows Griffiths & Steyvers (2004) heuristic — sum is always 50 regardless of K |
| `beta` | `0.01` | Symmetric Dirichlet prior on φ (topic-word). Small value → sparse, focused topics |
| `muStar` | `5` | Seed pseudo-count scale. Each seeded topic gets a total additive weight of 5, shared equally among its found seeds. Increase for stronger topical guidance; decrease to let data override seeds |
| `iterations` | `300` | Gibbs iterations |
| `burnIn` | `50` | Iterations discarded before sampling begins |
| `thinInterval` | `20` | Sample every 20 iterations after burn-in |
| `sampleLag` | `10` | Minimum lag between samples |

### Seed groups

There are 20 seed groups defined in `topic-phrases.js`:

```
CONSTITUTIONAL · HEALTHCARE · ECONOMIC · POLICY · AGRICULTURE
ENERGY_INFRA · EDUCATION · SOCIAL_WELFARE · BANKING_FINANCE · ENVIRONMENT
DEFENCE · FOREIGN_AFFAIRS · HOME_AFFAIRS · LABOUR · TRANSPORT · TELECOM
GEOGRAPHY · INSTITUTIONS · PROCEDURAL · MISC
```

Only the first `min(K, 20)` groups are assigned to seed topics. If K < 20,
later groups are unseeded — their words still appear freely but with no prior
push.

**Seed hit rate** (stats bar: `seeds 26/467`) reports how many unique seed
entries resolved to a word in the pruned vocabulary. A low hit rate (e.g. 26)
with a small vocabulary (202) is a sign that `minDocFreq` is too high. After
the 1%-floor fix, both numbers should rise substantially.

---

## Stage 6 — Document–topic membership (multi-topic)

LDA is a **mixed-membership** model: every document has a full distribution θ
over all K topics, not a single label. A document belongs to every topic it is
more than `TOPIC_MIN` composed of:

```
θ[doc][k] > TOPIC_MIN            (currently 0.2)
```

Membership is purely θ-driven — **no forced dominant (`argmax`) topic**. So a
document can belong to several topics, or (rarely, if nothing clears the floor)
to none — with `K ≈ 7` the strongest topic is almost always well above it.

This one rule drives everything downstream: cluster buckets, the plot (a document
appears in each cluster it belongs to), the detail-panel chips, and highlighting.
Because a document can sit in several clusters, **per-topic member counts overlap
and no longer sum to the document total**.

Topics are ordered for display by **per-topic distinctiveness**: the
prevalence-weighted average JSD from every other topic. More distinctive topics
appear first.

### Choosing the threshold

`TOPIC_MIN` (`topic-pipeline.svelte.js`) is a precision/recall dial. `α = 50/K`
is high, so θ rows spread across topics:

- **Too high** (e.g. `0.4`) → docs collapse back toward a single topic.
- **Too low** (e.g. `0.01`) → docs pick up topics they barely touch; noise.
- At `0.2` a document is listed under any topic it is >20% composed of.

### The second topic — why documents sit together

Each bucket entry also carries `second`, the document's strongest topic *other*
than the one whose bucket it is in, and `secondProb`, that topic's weight.
`second` is `null` when no other topic clears `TOPIC_MIN`.

`second` is deliberately **relative to the bucket**: the same document has a
different `second` in each topic it belongs to, because "what else is this about"
is only meaningful from wherever you are currently reading.

The plot uses it for the one-line summary under a hovered document — *68% this
topic · also concerns tenancy · tenure · holding* — which names in words the pull
that the document's position already shows.

### Consumers

`TopicPipeline.docTopics` returns, per document, its topics (strongest-first)
with each topic's λ-ranked terms. `GeoClusterMap` publishes this to the shared
`topicHighlight` state:

- `topicsByDoc[docKey]` → the `{ topic, prob, terms }` list → the "In N topics"
  chips in the detail panel.
- `termsByDoc[docKey]` → the **union** of all member topics' terms → text
  highlighting covers every topic the document belongs to, not just one.

---

## Stage 7 — RadViz projection

`TopicPipeline.radviz(topicId)` lays out one topic's documents in 2-D. It runs per
opened topic, not per model run, and is a weighted sum rather than an optimisation
— no iterations, no timing entry in the stats bar.

### The construction

Every topic **other** than the opened one becomes an anchor, evenly spaced around
a circle. A document is the θ-weighted sum of those anchor unit vectors:

```
ux = Σ  θ[j][a] · cos(angle_a)          for every anchor a ≠ opened topic
uy = Σ  θ[j][a] · sin(angle_a)
```

The opened topic has no anchor, so it contributes nothing and pulls toward the
origin. Because θ rows sum to 1 there is no renormalisation step and the bound
falls straight out: `|r| ≤ 1 − θ[j][k]`. That is the whole reading of the plot —

> **distance from the centre is the share of a document that is about something
> other than the topic you opened, and the direction says which topic that is.**

A document that clears no other topic sits exactly at the centre. And since a
document is only in this bucket if `θ[j][k] > TOPIC_MIN`, `r` can never exceed
`1 − 0.2 = 0.8` — usually far less. The plot stretches to compensate; see
**Rendering** below.

### Anchor order

Anchors are placed in a **ring order** computed once per model run in
`TopicLDAViz.ringOrder`, from the full K×K Jensen–Shannon matrix that the
distinctiveness pass already produces: start at the most distinctive topic, then
repeatedly append the nearest topic not yet placed.

This defuses RadViz's known ambiguity. A document splitting its weight across two
anchors lands between them — and if those anchors were diametrically opposed it
would land back on the origin and read as "about nothing else". Ordering by
similarity means the two anchors a document is *likely* to split across are
neighbours, so the in-between position is a true reading rather than a collision
with the centre.

Computing the ring once, rather than per selection, keeps the picture's shape
stable as the reader moves between topics: opening a topic vacates its slot and
the survivors are respaced evenly, but their cyclic order never changes.

### Return value

```
radviz(topicId) → {
  anchors: [{ topic, angle, ux, uy }],                     // unit vectors, ring order
  points:  [{ j, hit, idx, prob, second, ux, uy, r }],     // unit-disc coordinates
  rMax,                                                    // largest r in points
}
```

Coordinates are unit-disc, not pixels. `null` before the model finishes and at
K = 1, where there is no other topic to anchor against; the caller falls back to a
plain document list.

`radviz` reads `#theta`, `#ring` and `rawClusters`, but deliberately **not**
`lambda`. λ re-ranks the words an anchor is *labelled* with; it never moves
anything. Anchor terms are resolved from `clusters` at render time, so dragging
the slider re-words the plot without re-running the layout.

### Rendering

`RadvizPlot` (`frontend/src/lib/components/search/radviz.svelte.js`) turns those
coordinates into pane pixels; `GeoClusterMap` draws them. Every constant below is
configurable through the component's `radvizConfig` prop — the defaults are
documented inline in `RadvizPlot.#DEFAULTS`.

**Scale.** `k = R / max(rMax, 0.05)` maps the *furthest actual document* to the
ring radius rather than mapping 1.0 to it, because `rMax` is at most 0.8 and
usually much less — without the stretch every plot would be a knot at the origin.
The stretch varies per topic, which is exactly why the grid has to label what its
lines stand for.

**Grid.** An open cartesian grid ruled to the pane edges, stepped in θ-share
(0.1) rather than pixels, so a labelled line means the same thing at any zoom.
Only lines within the measurable range are ticked and labelled: past `rMax`, and
hard-capped at 100%, there is no share to state, so those lines are rule rather
than scale.

**Markers.** Radius encodes θ in the opened topic; position encodes what the
document is *also* about. Plain circles in one ink — no colour or shape per topic,
since K reaches the mid-teens and identity is already carried by position relative
to a named anchor. A document that clears no other topic is drawn hollow.

**Relaxation.** Identical topic profiles map to the same pixel, and every
centre-only document lands exactly on the origin. Overlapping markers are pushed
apart over a fixed number of passes, each clamped to 12px of its true position so
the nudge never outgrows the signal. There is no randomness anywhere in the
layout: a random seed would reintroduce the reload-to-reload drift that t-SNE was
dropped for.

**Zoom and pan.** Drag to pan, ⌘/ctrl + wheel to zoom at the cursor, buttons in
the header. Both fold into the same transform — markers, grid and anchors scale
and translate together, so the projection is never distorted and the grid stays
true. Anchors are pinned inside the pane so the legend survives a deep zoom.

**Document cards.** The strongest documents get a card pinned beside their marker
on a short leader, placed in the first of eight surrounding slots that clears the
pane edge, other cards, anchor labels and every marker. Nothing is displaced to
make room, so a marker with no free slot simply gets no card and is read by
hovering instead — which keeps a placed card unambiguously next to the document it
names.

### Why this and not t-SNE

An earlier version projected θ with t-SNE. Two problems: once the view is filtered
to a single topic every plotted document already shares it, so nothing visible
explained the remaining spread; and with ~20–30 documents per topic the perplexity
floor of 5 meant it was fitting noise that changed on every reload.

RadViz names its axes on screen and is deterministic — the same search gives the
same picture on every load, which is the property t-SNE could never offer here.

---

## Stats bar glossary

| Stat | Meaning |
|------|---------|
| `N/M docs` | N documents survived minimum-length filter out of M hits returned |
| `vocab V` | size of pruned vocabulary going into LDA |
| `T tokens` | total tokens in the LDA corpus (after stop-word and phrase merging) |
| `S stopwords removed` | tokens removed by the stop-word list |
| `L lexicon phrases matched` | tokens replaced by known lexicon phrases (from `topic-phrases.js`) |
| `phrases [… merges]` | statistical phrases discovered by bigram detection |
| `seeds M/T` | M seed words found in vocab out of T total seed entries checked |
| `K N` | optimal K chosen by the RD sweep |
| `RD R` | Regularized Divergence score at bestK |
| `NLP Xms` | time for winkNLP lemmatization |
| `phrases Xms` | time for phrase detection |
| `LDA Xms` | time for K-sweep + full LDA run |

---

## Key references

- **Latent Dirichlet Allocation**: Blei, D., Ng, A., Jordan, M. (2003). *JMLR 3*.
- **Gibbs sampling for LDA**: Griffiths, T., Steyvers, M. (2004). *PNAS 101*(suppl 1).
- **Seeded LDA**: Lu, B., Ott, M., Cardie, C., Tsou, B. (2011). *EMNLP*. Pseudo-count formulation as used in Watanabe, K., Baturo, A. (2024). *Political Analysis 32(1)*.
- **Regularized Topic Divergence**: Deveaud, R., SanJuan, E., Bellot, P. (2014). *JDIQ 6(1)*.
- **RadViz (dimensional anchors)**: Hoffman, P., Grinstein, G., Marx, K., Grosse, I., Stanley, E. (1997). *DNA visual and analytic data mining*. IEEE Visualization.
