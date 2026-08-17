// Partitions hits into one group per source index, holds a TopicPipeline per
// group, and models each in a sequential background queue (largest first).
// Empty groups (0 docs) never get a grid cell — they always fall into the
// accordion overflow. Past MAIN_CAP non-empty groups, the lowest-scored of those
// overflow into the same accordion instead of growing the grid.

import { TopicPipeline } from "$lib/topic-modelling/topic-pipeline.svelte.js";

export const MIN_GROUP_DOCS = 4;

export class GeoGroups {
  static #MAIN_CAP = 12;

  groups = $state([]);
  cellGroups = $state([]);
  accordionGroups = $state([]);
  #pipelines = new Map();
  #queue = [];
  #running = false;
  #query = "";

  get overflowing() { return this.accordionGroups.length > 0; }

  // True on the call that discards the previous query's models. The view stack
  // must clear with it: a { groupKey, idx } from the old result set would point
  // at a different topic in the new one.
  get queryChanged() { return this.#queryChanged; }
  #queryChanged = false;

  // Rebuilds the partition on every call so doc counts update live during
  // pagination; topic modelling only starts once readyToModel is true, so LDA
  // isn't restarted mid-pagination.
  build(hits, query, indices = [], readyToModel = true) {
    this.#queryChanged = query !== this.#query;
    if (this.#queryChanged) {
      for (const p of this.#pipelines.values()) p.reset();
    }
    this.#query = query;
    const meta = new Map(indices.map((i) => [i.uid, i]));
    const map = new Map();
    for (const hit of hits) {
      let e = map.get(hit._index);
      if (!e) {
        const m = meta.get(hit._index);
        e = { key: hit._index, label: m?.label || hit._index, annotation: m?.annotation || "", items: [] };
        map.set(hit._index, e);
      }
      e.items.push(hit);
    }
    for (const i of indices) {
      if (!map.has(i.uid))
        map.set(i.uid, { key: i.uid, label: i.label, annotation: i.annotation || "", items: [] });
    }
    const groups = [...map.values()].map((e) => {
      let p = this.#pipelines.get(e.key);
      if (!p) { p = new TopicPipeline(); this.#pipelines.set(e.key, p); }
      return { ...e, count: e.items.length, pipeline: p };
    });
    groups.sort((a, b) => a.label.localeCompare(b.label));
    this.groups = groups;

    const nonEmpty = groups.filter((g) => g.count > 0);
    const empty = groups.filter((g) => g.count === 0);

    let overflow;
    if (nonEmpty.length > GeoGroups.#MAIN_CAP) {
      const keep = new Set(
        [...nonEmpty].sort((a, b) => b.count - a.count).slice(0, GeoGroups.#MAIN_CAP).map((g) => g.key),
      );
      this.cellGroups = nonEmpty.filter((g) => keep.has(g.key));
      overflow = nonEmpty.filter((g) => !keep.has(g.key));
    } else {
      this.cellGroups = nonEmpty;
      overflow = [];
    }
    this.accordionGroups = [...overflow, ...empty].sort((a, b) => a.count - b.count);

    for (const k of [...this.#pipelines.keys()]) if (!map.has(k)) this.#pipelines.delete(k);
    if (readyToModel) this.#enqueue();
  }

  #enqueue() {
    // Display order is alphabetical; modelling still runs largest-first.
    this.#queue = this.groups
      .filter((g) => g.count >= MIN_GROUP_DOCS)
      .sort((a, b) => b.count - a.count);
    if (!this.#running) this.#drain();
  }
  async #drain() {
    this.#running = true;
    while (this.#queue.length) {
      const g = this.#queue.shift();
      await g.pipeline.model(g.items, this.#query, g.key);
    }
    this.#running = false;
  }
}
