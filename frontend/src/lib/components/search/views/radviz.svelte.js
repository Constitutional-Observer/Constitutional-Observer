// RadViz view model: TopicPipeline.radviz() unit-disc coordinates → pane pixels,
// plus document-card placement. Drawing only; θ fixes every position.

export class RadvizPlot {
  // Overridable one level deep — `{ cards: { max: 6 } }` touches only cards.max.
  static #DEFAULTS = {
    ring: {
      radiusDivisor: 2,  // R = min(paneW, paneH) / radiusDivisor − pad
      pad: 58,           // R → pane edge; anchor labels sit in this band
      minRadius: 30,     // below this, layoutFor returns null
      anchorOffset: 12,  // anchor label distance outside the plotted radius
      fill: 1,           // fraction of R the widest document reaches at zoom 1
      rMaxFloor: 0.05,   // divisor floor; guards the all-at-centre case
      sideBias: 0.3,     // |ux| past which a label hangs off that side
      zoom: 1,           // starting zoom; multiplies px-per-θ-share
      zoomMin: 0.5,
      zoomMax: 12,
      zoomStep: 1.4,     // factor per zoomIn() / zoomOut()
      wheelRate: 0.0015, // ctrl+wheel: factor = exp(-deltaY · wheelRate)
    },
    grid: {
      step: 0.1,        // θ-share between lines
      labelEvery: 2,    // tick + label every Nth line
      tick: 4,          // tick half-length
      minSpacing: 6,    // px/step below which the grid is dropped
      maxShare: 1,      // no line past this θ-share; 100% is the hard ceiling
    },
    marker: {
      baseRadius: 4,    // radius at θ = 0
      probScale: 10,    // px of radius per unit θ
      probCap: 8,       // max px added by probScale
      hoverGrow: 2,
      hitPad: 5,        // hover target radius past the drawn marker
    },
    relax: {
      maxShift: 12,     // max displacement from the true position
      gap: 2,           // demanded clearance between two markers
      passes: 60,
      passesLarge: 12,  // used above largeCount markers
      largeCount: 200,
    },
    cards: {
      max: Infinity,      // cap on open cards
      width: 196,
      height: 200,
      gap: 9,             // marker → card
      edge: 4,            // card → pane edge
      dotClearance: 3,    // reject a card with a marker this close inside it
      minPaneMargin: 120, // no cards below paneW < width + this
      // Must track `.gm-rv-anchor`'s max-width in TopicPlot.
      anchorBox: { width: 132, height: 32 },
    },
  };

  static #GOLDEN = 2.39996;
  static #DRAG_SLOP = 3; // px before a pointer-down counts as a pan, not a click

  paneW = $state(0);
  paneH = $state(0);
  hovered = $state(null); // θ-row index of the marker under the pointer
  cfg = $state(RadvizPlot.#merge({}));
  zoom = $state(null);    // null → cfg.ring.zoom
  panX = $state(0);
  panY = $state(0);
  dragging = $state(false);
  #drag = null;
  #suppressClick = false;

  constructor(overrides = {}) { this.cfg = RadvizPlot.#merge(overrides); }
  configure(overrides = {}) { this.cfg = RadvizPlot.#merge(overrides); }

  // ── View: zoom about a point, and pan ────────────────────────────────────
  // Scale multiplies px-per-θ-share; pan offsets the origin. Both apply to
  // markers, grid and anchor ring alike, so the picture only ever moves and
  // grows — the projection is never distorted.
  get scale() { return this.zoom ?? this.cfg.ring.zoom; }
  get canZoomOut() { return this.scale > this.cfg.ring.zoomMin; }
  get canZoomIn() { return this.scale < this.cfg.ring.zoomMax; }
  get moved() { return this.zoom !== null || this.panX !== 0 || this.panY !== 0; }

  // (sx, sy) are pane-local and stay under the cursor across the scale change:
  // screen = centre + pan + world·scale, solved for the pan that fixes `world`.
  zoomAt(factor, sx, sy) {
    const r = this.cfg.ring;
    const before = this.scale;
    const after = RadvizPlot.#clamp(before * factor, r.zoomMin, r.zoomMax);
    if (after === before) return;
    const ratio = after / before;
    const cx = this.paneW / 2, cy = this.paneH / 2;
    this.panX = sx - cx - (sx - cx - this.panX) * ratio;
    this.panY = sy - cy - (sy - cy - this.panY) * ratio;
    this.zoom = after;
  }
  zoomBy(factor) { this.zoomAt(factor, this.paneW / 2, this.paneH / 2); }
  zoomIn() { this.zoomBy(this.cfg.ring.zoomStep); }
  zoomOut() { this.zoomBy(1 / this.cfg.ring.zoomStep); }
  resetView() { this.zoom = null; this.panX = 0; this.panY = 0; }

  // Ctrl/meta gate matches the old canvas: a bare wheel must still scroll the page.
  wheel(e) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    this.zoomAt(
      Math.exp(-e.deltaY * this.cfg.ring.wheelRate),
      e.clientX - rect.left, e.clientY - rect.top,
    );
  }

  pointerDown(e) {
    if (e.button !== 0) return;
    this.#drag = {
      x: e.clientX, y: e.clientY, px: this.panX, py: this.panY,
      el: e.currentTarget, id: e.pointerId,
    };
    this.#suppressClick = false;
  }
  pointerMove(e) {
    if (!this.#drag) return;
    const dx = e.clientX - this.#drag.x, dy = e.clientY - this.#drag.y;
    if (!this.dragging) {
      if (Math.abs(dx) + Math.abs(dy) < RadvizPlot.#DRAG_SLOP) return;
      this.dragging = true;
      // Captured here and not on pointerdown: an active capture retargets the
      // click to the capturing element, which would swallow every marker and
      // card click. Only a real drag needs the pointer to keep tracking.
      this.#drag.el.setPointerCapture?.(this.#drag.id);
    }
    this.panX = this.#drag.px + dx;
    this.panY = this.#drag.py + dy;
  }
  pointerUp() {
    if (!this.#drag) return;
    const { el, id } = this.#drag;
    if (el.hasPointerCapture?.(id)) el.releasePointerCapture(id);
    this.#drag = null;
    this.#suppressClick = this.dragging;
    this.dragging = false;
  }
  // A drag that ends over a marker must not also open it.
  clickAllowed() {
    const ok = !this.#suppressClick;
    this.#suppressClick = false;
    return ok;
  }

  static #merge(overrides) {
    const out = {};
    for (const [group, defaults] of Object.entries(RadvizPlot.#DEFAULTS))
      out[group] = { ...defaults, ...(overrides?.[group] || {}) };
    return out;
  }

  static #overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  static #clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Separates markers that share a pixel (identical θ profiles; every document about
  // on the origin). Displacement is capped at relax.maxShift. No randomness — the
  // layout must be identical across reloads.
  #relax(dots) {
    const rx = this.cfg.relax;
    const n = dots.length;
    for (let i = 0; i < n; i++) {
      // Golden-angle offset gives exact ties a direction to separate along.
      const a = i * RadvizPlot.#GOLDEN;
      dots[i].px = dots[i].tx + Math.cos(a) * 0.01 * i;
      dots[i].py = dots[i].ty + Math.sin(a) * 0.01 * i;
    }
    const passes = n > rx.largeCount ? rx.passesLarge : rx.passes;
    for (let pass = 0; pass < passes; pass++) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const A = dots[i], B = dots[j];
          let dx = B.px - A.px, dy = B.py - A.py;
          let d = Math.hypot(dx, dy);
          const min = A.rad + B.rad + rx.gap;
          if (d >= min) continue;
          if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
          const push = (min - d) / 2 / d;
          A.px -= dx * push; A.py -= dy * push;
          B.px += dx * push; B.py += dy * push;
        }
      }
      for (const p of dots) {
        const dx = p.px - p.tx, dy = p.py - p.ty, d = Math.hypot(dx, dy);
        if (d > rx.maxShift) {
          p.px = p.tx + (dx / d) * rx.maxShift;
          p.py = p.ty + (dy / d) * rx.maxShift;
        }
      }
    }
    return dots;
  }

  // source: one TopicPipeline.radviz() result. Null when unset or R < minRadius.
  layoutFor(source) {
    if (!source || !this.paneW || !this.paneH) return null;
    const { ring, marker } = this.cfg;
    const R0 = Math.min(this.paneW, this.paneH) / ring.radiusDivisor - ring.pad;
    if (R0 < ring.minRadius) return null;

    // Zoom scales the radius, pan shifts the origin; both flow into everything
    // below, so markers, grid and anchors move and grow as one.
    const R = R0 * this.scale;
    const cx0 = this.paneW / 2 + this.panX, cy0 = this.paneH / 2 + this.panY;
    // px per unit θ-share. Maps the widest document to R, so the grid must label
    // what each line stands for.
    const k = (ring.fill * R) / Math.max(source.rMax, ring.rMaxFloor);

    // Anchors stay pinned inside the pane however far the plot is zoomed, so the
    // legend never leaves the screen: each sits at min(its ring radius, the pane
    // boundary along its own direction).
    const limit = (ux, uy) => {
      const mx = Math.max(cx0, this.paneW - cx0) - ring.pad;
      const my = Math.max(cy0, this.paneH - cy0) - ring.pad;
      return Math.min(
        Math.abs(ux) < 1e-6 ? Infinity : mx / Math.abs(ux),
        Math.abs(uy) < 1e-6 ? Infinity : my / Math.abs(uy),
      );
    };

    // tx/ty: CSS translate keeping the label clear of the ring on its own side.
    const anchors = source.anchors.map((a) => {
      const ra = Math.max(0, Math.min(R + ring.anchorOffset, limit(a.ux, a.uy)));
      return {
        ...a,
        sx: cx0 + a.ux * Math.max(0, ra - ring.anchorOffset),
        sy: cy0 + a.uy * Math.max(0, ra - ring.anchorOffset),
        ax: cx0 + a.ux * ra, ay: cy0 + a.uy * ra,
        tx: a.ux > ring.sideBias ? "0" : a.ux < -ring.sideBias ? "-100%" : "-50%",
        ty: a.uy > ring.sideBias ? "0" : a.uy < -ring.sideBias ? "-100%" : "-50%",
      };
    });

    const dots = this.#relax(
      source.points.map((p) => ({
        ...p,
        tx: cx0 + p.ux * k,
        ty: cy0 + p.uy * k,
        rad: marker.baseRadius + Math.min(marker.probCap, p.prob * marker.probScale),
      })),
    );

    return { R, cx0, cy0, k, dots, anchors, grid: this.#grid(k, cx0, cy0, source.rMax) };
  }

  // Open grid stepped in θ-share, ruled to the pane edges. Only lines inside the
  // measurable range are marked: k maps rMax to R, so the pane edge sits past the
  // furthest document, and past maxShare there is no such thing as a share. Lines
  // beyond that are rule, not scale, and carry no tick or label. Re-rules on
  // resize via paneW/paneH. Layout is isotropic, so cols and rows share one scale
  // and differ only in count. Offsets are from centre; the caller mirrors both.
  #grid(k, cx0, cy0, rMax) {
    const g = this.cfg.grid;
    const stepPx = g.step * k;
    const cols = [], rows = [];
    if (stepPx >= g.minSpacing) {
      const last = Math.min(
        Math.floor(g.maxShare / g.step + 1e-9),
        Math.ceil(rMax / g.step),
      );
      const mark = (i) => ({
        off: i * stepPx,
        share: i * g.step,
        pct: Math.round(i * g.step * 100),
        marked: i <= last && i % g.labelEvery === 0,
      });
      const reachX = Math.max(cx0, this.paneW - cx0);
      const reachY = Math.max(cy0, this.paneH - cy0);
      for (let i = 1; i * stepPx <= reachX; i++) cols.push(mark(i));
      for (let i = 1; i * stepPx <= reachY; i++) rows.push(mark(i));
    }
    return { cols, rows, tick: g.tick, x0: 0, x1: this.paneW, y0: 0, y1: this.paneH };
  }

  // Places a card in the first of eight slots around its own marker that clears
  // the pane edge, every placed card, every anchor label and every marker.
  // Highest θ first, up to cards.max. Nothing is displaced to make room, so a
  // marker with no free slot gets no card.
  cardsFor(layout) {
    const c = this.cfg.cards;
    if (!layout || this.paneW < c.width + c.minPaneMargin) return [];

    const taken = layout.anchors.map((a) => ({
      x: a.ax - c.anchorBox.width / 2, y: a.ay - c.anchorBox.height / 2,
      w: c.anchorBox.width, h: c.anchorBox.height,
    }));
    const out = [];

    for (const d of [...layout.dots].sort((a, b) => b.prob - a.prob)) {
      if (out.length >= c.max) break;
      const off = d.rad + c.gap;
      const candidates = [
        { x: d.px + off,          y: d.py - c.height / 2 },
        { x: d.px - c.width - off, y: d.py - c.height / 2 },
        { x: d.px - c.width / 2,   y: d.py - c.height - off },
        { x: d.px - c.width / 2,   y: d.py + off },
        { x: d.px + off,           y: d.py + off },
        { x: d.px - c.width - off, y: d.py + off },
        { x: d.px + off,           y: d.py - c.height - off },
        { x: d.px - c.width - off, y: d.py - c.height - off },
      ];

      let box = null;
      for (const cand of candidates) {
        const b = { x: cand.x, y: cand.y, w: c.width, h: c.height };
        if (b.x < c.edge || b.x + b.w > this.paneW - c.edge) continue;
        if (b.y < c.edge || b.y + b.h > this.paneH - c.edge) continue;
        if (taken.some((t) => RadvizPlot.#overlaps(b, t))) continue;
        if (layout.dots.some((o) =>
          o.px > b.x - c.dotClearance && o.px < b.x + b.w + c.dotClearance &&
          o.py > b.y - c.dotClearance && o.py < b.y + b.h + c.dotClearance
        )) continue;
        box = b; break;
      }
      if (!box) continue;

      taken.push(box);
      out.push({
        ...d,
        lx: box.x, ly: box.y, w: box.w, h: box.h,
        ex: RadvizPlot.#clamp(d.px, box.x, box.x + box.w),
        ey: RadvizPlot.#clamp(d.py, box.y, box.y + box.h),
      });
    }
    return out;
  }

  // Hovered document, unless it already has a placed card.
  floatingIn(layout, cards) {
    if (this.hovered === null || !layout) return null;
    if (cards.some((c) => c.j === this.hovered)) return null;
    return layout.dots.find((d) => d.j === this.hovered) || null;
  }

  markerRadius(d) {
    return this.hovered === d.j ? d.rad + this.cfg.marker.hoverGrow : d.rad;
  }
  enter(j) { this.hovered = j; }
  leave(j) { if (this.hovered === j) this.hovered = null; }
}
