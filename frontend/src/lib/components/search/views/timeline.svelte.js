// Timeline view model: documents → pane pixels on a time axis. Bars count the
// documents falling in each calendar period; the dots below them are the
// documents themselves, one marker each, on a single horizontal line.


import { scaleUtc } from "d3-scale";
import { utcTickInterval, utcYear } from "d3-time";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { docFormat } from "$lib/components/search/search-state.svelte.js";

const DAY = 86400000;

// Bin labels, for the drill-down heading. The axis uses d3's own multi-resolution
// format, which is right on an axis and ambiguous out of it ("Mar" with no year).
const YEAR_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", year: "numeric" });
const MONTH_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short", year: "numeric" });
const DAY_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

export class TimelinePlot {
  // Overridable one level deep — `{ bins: { targetPx: 9 } }` touches only bins.targetPx.
  static #DEFAULTS = {
    axis: {
      padLeft: 14,
      padRight: 14,
      padTop: 10,
      padBottom: 8,
      tickBand: 16,        // band under the line holding the tick labels
      tickMinSpacing: 62,  // px between dated ticks — labels collide below this
      tickMaxSpacing: 100, // the domain is padded with empty years above this
      minInnerWidth: 200,  // below this, layoutFor gives up
    },
    panels: {
      gutter: 12,          // bars → the line
      minVolumeHeight: 44, // below this the pane is too short to plot
    },
    bins: { targetPx: 20 }, // aim for a calendar interval about this wide
    marker: { baseRadius: 4 },
    view: { zoomMin: 1, zoomMax: 64, zoomStep: 1.6 },
  };

  paneW = $state(0);
  paneH = $state(0);
  cfg = $state(TimelinePlot.#merge({}));
  transform = $state(zoomIdentity);
  dragging = $state(false);

  #node = null;
  #zoom = null;
  #moved = false;
  #suppressClick = false;

  constructor(overrides = {}) { this.cfg = TimelinePlot.#merge(overrides); }

  static #merge(overrides) {
    const out = {};
    for (const [group, defaults] of Object.entries(TimelinePlot.#DEFAULTS))
      out[group] = { ...defaults, ...(overrides?.[group] || {}) };
    return out;
  }

  // ── View: d3-zoom, horizontal only ────────────────────────────────────────

  get canZoomOut() { return this.transform.k > this.cfg.view.zoomMin; }
  get canZoomIn() { return this.transform.k < this.cfg.view.zoomMax; }
  get moved() { return this.transform.k !== 1 || this.transform.x !== 0; }

  // Called with the pane element; returns the teardown, so a Svelte $effect can
  // own the lifetime. A plot that is never attached simply stays at the identity
  // transform. The extent is not set here — it is in pane pixels, so it belongs to
  // the effect that follows a resize.
  attach(node) {
    if (!node) return;
    const v = this.cfg.view;
    const z = zoom()
      .scaleExtent([v.zoomMin, v.zoomMax])
      // A bare wheel must still scroll the page, as it does in the topic plot.
      .filter((e) => (e.type !== "wheel" || e.ctrlKey || e.metaKey) && !e.button)
      .on("start", () => { this.#moved = false; })
      .on("zoom", (e) => {
        if (e.sourceEvent && /move|drag/.test(e.sourceEvent.type)) {
          this.#moved = true;
          this.dragging = true;
        }
        this.transform = e.transform;
      })
      .on("end", () => {
        this.#suppressClick = this.#moved;
        this.dragging = false;
      });

    this.#node = node;
    this.#zoom = z;
    // Double-click-to-zoom would fight opening a document.
    select(node).call(z).on("dblclick.zoom", null);

    return () => {
      select(node).on(".zoom", null);
      this.#node = null;
      this.#zoom = null;
    };
  }

  // The pan clamp is an extent in pane pixels, so it has to follow a resize.
  syncExtent() {
    if (!this.#node || !this.#zoom) return;
    const a = this.cfg.axis;
    const right = Math.max(a.padLeft + 1, this.paneW - a.padRight);
    const ext = [[a.padLeft, 0], [right, Math.max(1, this.paneH)]];
    this.#zoom.extent(ext).translateExtent(ext);
  }

  zoomIn() {
    if (this.#node) select(this.#node).call(this.#zoom.scaleBy, this.cfg.view.zoomStep);
  }
  zoomOut() {
    if (this.#node) select(this.#node).call(this.#zoom.scaleBy, 1 / this.cfg.view.zoomStep);
  }
  resetView() {
    if (this.#node) select(this.#node).call(this.#zoom.transform, zoomIdentity);
    else this.transform = zoomIdentity;
  }

  // A drag that ends over a bar must not also open it.
  clickAllowed() {
    const ok = !this.#suppressClick;
    this.#suppressClick = false;
    return ok;
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  // hits: the documents to plot. domain: an explicit [lo, hi] window, which the
  // drill-down uses to ask for exactly one bar's period. Null when there is
  // nothing plottable, so the caller simply renders nothing.
  layoutFor(hits, domain = null) {
    const a = this.cfg.axis, p = this.cfg.panels, m = this.cfg.marker;
    if (!hits?.length || !this.paneW || !this.paneH) return null;
    const innerW = this.paneW - a.padLeft - a.padRight;
    if (innerW < a.minInnerWidth) return null;

    let dated = [];
    for (const [i, hit] of hits.entries()) {
      const t = docFormat.hitTime(hit);
      if (t !== null) dated.push({ i, hit, t });
    }
    if (!dated.length) return null;
    dated.sort((x, y) => x.t - y.t || x.i - y.i);

    let lo = dated[0].t, hi = dated[dated.length - 1].t;
    // A single shared date would make the scale degenerate; give it a month.
    if (hi <= lo) { lo -= 15 * DAY; hi += 15 * DAY; }

    if (domain) {
      // The caller has already said what to show, so no padding and no year
      // snapping. It means only that period, too: without the filter the bin whose
      // edge lands on the boundary drags a neighbour's documents in with it, and
      // every document outside the window still becomes a marker, drawn off-box.
      [lo, hi] = domain;
      dated = dated.filter((d) => d.t >= lo && d.t < hi);
      if (!dated.length) return null;
    } else {
      // A handful of results from two adjacent years would otherwise be stretched
      // across the full width, reading like an era. Pad the domain with empty
      // years, centred on the data, until the years are no further apart than
      // tickMaxSpacing — the axis then says "these three documents sit in this
      // decade" instead of implying the decade is what was searched. Snapping to
      // whole years also means the first and last labels are clean.
      const YEAR = 365.2425 * DAY;
      const wantYears = innerW / a.tickMaxSpacing;
      if ((hi - lo) / YEAR < wantYears) {
        const pad = (wantYears * YEAR - (hi - lo)) / 2;
        lo -= pad;
        hi += pad;
      }
      lo = +utcYear.floor(new Date(lo));
      hi = +utcYear.ceil(new Date(hi));
    }

    const x0 = a.padLeft, x1 = a.padLeft + innerW;
    const x = this.transform.rescaleX(scaleUtc().domain([lo, hi]).range([x0, x1]));
    const xOf = (t) => x(t);
    const [vLo, vHi] = x.domain();

    // Vertical budget, top down: reserved top band, bars, gutter, the one line,
    // tick labels. `axis.padTop` is what a caller raises to reserve room above the
    // bars, but it yields first when the pane is short, and the bars yield next.
    // The line and its years are never dropped: a timeline with no dates on it is
    // not a timeline, so they come out of the budget before anything else.
    const lineBand = 2 * (m.baseRadius + 2);
    const need = p.gutter + lineBand + a.tickBand + a.padBottom;
    if (this.paneH < need) return null;
    const top = Math.max(0, Math.min(a.padTop, this.paneH - need - p.minVolumeHeight));
    const volumeH = Math.max(0, this.paneH - top - need);
    const volumeBase = top + volumeH;
    const axisY = volumeBase + p.gutter + lineBand / 2;
    const bottom = axisY + lineBand / 2 + a.tickBand;

    // Bin interval comes from the VISIBLE span, so bins refine as you zoom; the
    // bins themselves cover the whole domain, so the bar scale does not.
    const interval =
      utcTickInterval(vLo, vHi, Math.max(2, Math.round(innerW / this.cfg.bins.targetPx))) ||
      utcTickInterval(vLo, vHi, 2);
    const { bins, denom } = this.#bins(dated, interval, xOf);
    for (const b of bins) b.countH = (b.count / denom) * volumeH;

    const dots = dated.map((d) => ({ ...d, px: xOf(d.t), py: axisY }));

    // One request for the number of labels that fit, then thin. d3's calendar
    // intervals overshoot the requested count, and asking for a smaller count only
    // ever returns a coarser interval, so dropping ticks is the only way to hold a
    // minimum spacing.
    const fmt = x.tickFormat();
    const ticks = [];
    for (const d of x.ticks(Math.max(2, Math.floor(innerW / a.tickMinSpacing)))) {
      const px = x(d);
      if (ticks.length && px - ticks[ticks.length - 1].x < a.tickMinSpacing) continue;
      ticks.push({ t: +d, x: px, label: fmt(d) });
    }

    return { x0, x1, top, volumeBase, axisY, bottom, bins, dots, ticks };
  }

  // Calendar-aligned bins using a d3 time interval, so bar edges land on 1 January
  // or the 1st of a month and two runs of the same interval always agree on the
  // boundaries.
  //
  // `denom` is the tallest bar anywhere in the domain, not just on screen: a
  // per-viewport maximum would make bar heights jump as you panned. Only the
  // returned bin list is trimmed to the visible window.
  #bins(dated, interval, xOf) {
    const by = new Map();
    for (const d of dated) {
      const start = +interval.floor(new Date(d.t));
      let b = by.get(start);
      if (!b) { b = { start, count: 0, top: null }; by.set(start, b); }
      b.count++;
      // The bin's strongest result, so hovering a bar can name a document rather
      // than only counting one.
      if (!b.top || (d.hit._bestScore || 0) > (b.top.hit._bestScore || 0)) b.top = d;
    }

    const fmt = (start, width) =>
      (width >= 300 * DAY ? YEAR_FMT : width >= 25 * DAY ? MONTH_FMT : DAY_FMT)
        .format(new Date(start));

    const out = [];
    let denom = 1;
    for (const b of by.values()) {
      if (b.count > denom) denom = b.count;
      const end = +interval.offset(new Date(b.start), 1);
      b.end = end;
      b.label = fmt(b.start, end - b.start);
      b.px = xOf(b.start);
      // 1px of surface between neighbouring bars, so two full bins never merge.
      b.pw = Math.max(1, xOf(end) - b.px - 1);
      if (b.px + b.pw < -8 || b.px > this.paneW + 8) continue;
      out.push(b);
    }
    return { bins: out.sort((p, q) => p.start - q.start), denom };
  }
}
