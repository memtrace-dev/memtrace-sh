/**
 * The strata engine.
 *
 * One canvas runs the length of the page. It is not decoration: it is the
 * product's data model drawn as sediment. Every band is a memory.
 *
 *   solid ochre      a binding decision
 *   hairline         a proposal, inert until a human accepts it
 *   broken band      a decision the codebase currently violates
 *   ghosted band     reverted or superseded, kept as record
 *   thin bone line   an ungoverned note
 *
 * Scrolling deposits layers. The pointer parts them, the way you would part a
 * core sample to read a particular year.
 */

export type Tone = 'binding' | 'proposed' | 'violated' | 'ghost' | 'note';

export interface Layer {
  /** Position in the column, in "sediment units" from the top of the record. */
  depth: number;
  thickness: number;
  tone: Tone;
  /** 0..1, drives per-band texture so no two bands are identical. */
  seed: number;
  /** Horizontal inset, so the column edge is ragged rather than ruled. */
  inset: number;
  label?: string;
}

export interface StrataOptions {
  canvas: HTMLCanvasElement;
  reduced: boolean;
}

const PALETTE = {
  ochre: [184, 106, 47],
  clay: [142, 85, 48],
} as const;

/** Deterministic pseudo-random, so a reload draws the same record. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rgba(c: readonly number[], a: number) {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export class Strata {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private reduced: boolean;
  private layers: Layer[] = [];

  private w = 0;
  private h = 0;
  private dpr = 1;

  /** 0..1 through the document. */
  private progress = 0;
  private renderedProgress = 0;

  private pointer = { x: -1, y: -1, strength: 0 };
  private targetStrength = 0;

  /** Column bounds as fractions of viewport width, eased between sections. */
  private region = { x0: 0.58, x1: 1.02 };
  private targetRegion = { x0: 0.58, x1: 1.02 };

  /** Which tone the current section wants emphasised. */
  private focus: Tone | 'all' = 'all';
  private focusMix = 0;
  private targetFocusMix = 0;

  private raf = 0;
  private running = false;
  private dirty = true;

  /** Page background, used to mask the column's leading edge. Cached because
      getComputedStyle every frame is not free. */
  private bg = '#111111';

  /** Neutral ink for the ungoverned tones. Ochre is the brand and never
      changes, but bone-on-bone is invisible, so the neutral follows the
      theme's text colour instead of being hardcoded. */
  private neutral: [number, number, number] = [246, 244, 238];

  constructor({ canvas, reduced }: StrataOptions) {
    this.canvas = canvas;
    this.reduced = reduced;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.readBackground();
    this.build();
  }

  /**
   * Build the record once. Proportions are chosen so the column reads as a
   * real varve sequence: many thin years, occasional thick deposition events.
   */
  private build() {
    const rand = rng(20260730);
    const layers: Layer[] = [];
    let depth = 0;

    // Roughly one binding decision for every three or four proposals and
    // notes, which is what an actual store looks like after a few weeks.
    const deck: Tone[] = [
      'binding', 'note', 'proposed', 'note', 'binding', 'proposed',
      'note', 'violated', 'note', 'binding', 'ghost', 'proposed',
      'note', 'binding', 'note', 'proposed', 'note', 'binding',
    ];

    for (let i = 0; i < 150; i++) {
      const tone = deck[i % deck.length];
      const base =
        tone === 'binding' ? 22 : tone === 'violated' ? 18 : tone === 'ghost' ? 14 : tone === 'note' ? 6 : 3;
      const thickness = base * (0.65 + rand() * 0.8);
      layers.push({
        depth,
        thickness,
        tone,
        seed: rand(),
        inset: rand() * 0.06,
      });
      depth += thickness + 5 + rand() * 12;
    }

    this.layers = layers;
  }

  /** Re-read the page background, e.g. after a theme toggle. */
  readBackground() {
    const style = getComputedStyle(document.documentElement);
    const v = style.getPropertyValue('--bg').trim();
    if (v) this.bg = v;
    const t = style.getPropertyValue('--text').trim();
    if (t.startsWith('#')) this.neutral = hexToRgb(t);
    this.dirty = true;
    if (this.reduced) this.draw();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.dirty = true;
    if (this.reduced) this.draw();
  }

  setProgress(p: number) {
    this.progress = Math.max(0, Math.min(1, p));
    this.dirty = true;
    if (this.reduced) this.draw();
  }

  /**
   * Depth, in sediment units, sitting at the top of the viewport right now.
   * The gauge in the margin prints this, so the number a reader sees is the
   * record's own coordinate rather than a restated scroll percentage.
   */
  depthAtViewportTop() {
    const total = this.layers[this.layers.length - 1].depth;
    const start = total * 0.04;
    const travel = Math.max(1, total - this.h - start);
    return start + this.progress * travel;
  }

  /** Total extent of the record, for the gauge's end stop. */
  get extent() {
    return this.layers[this.layers.length - 1].depth;
  }

  setRegion(x0: number, x1: number) {
    this.targetRegion = { x0, x1 };
    this.dirty = true;
    if (this.reduced) {
      this.region = { ...this.targetRegion };
      this.draw();
    }
  }

  setFocus(tone: Tone | 'all') {
    this.focus = tone;
    this.targetFocusMix = tone === 'all' ? 0 : 1;
    this.dirty = true;
    if (this.reduced) this.draw();
  }

  setPointer(x: number, y: number) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.targetStrength = 1;
    this.dirty = true;
  }

  clearPointer() {
    this.targetStrength = 0;
    this.dirty = true;
  }

  start() {
    if (this.reduced) {
      this.draw();
      return;
    }
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      this.step();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
  }

  private step() {
    // Critically damped-ish easing toward the targets. Nothing snaps.
    const dp = this.progress - this.renderedProgress;
    const ds = this.targetStrength - this.pointer.strength;
    const df = this.targetFocusMix - this.focusMix;

    if (Math.abs(dp) > 0.00002) this.renderedProgress += dp * 0.09;
    else this.renderedProgress = this.progress;

    if (Math.abs(ds) > 0.001) this.pointer.strength += ds * 0.12;
    else this.pointer.strength = this.targetStrength;

    if (Math.abs(df) > 0.001) this.focusMix += df * 0.07;
    else this.focusMix = this.targetFocusMix;

    const dx0 = this.targetRegion.x0 - this.region.x0;
    const dx1 = this.targetRegion.x1 - this.region.x1;
    if (Math.abs(dx0) > 0.0004) this.region.x0 += dx0 * 0.16;
    else this.region.x0 = this.targetRegion.x0;
    if (Math.abs(dx1) > 0.0004) this.region.x1 += dx1 * 0.16;
    else this.region.x1 = this.targetRegion.x1;

    const settled =
      this.renderedProgress === this.progress &&
      this.pointer.strength === this.targetStrength &&
      this.focusMix === this.targetFocusMix &&
      this.region.x0 === this.targetRegion.x0 &&
      this.region.x1 === this.targetRegion.x1;

    if (!settled || this.dirty) {
      this.draw();
      this.dirty = !settled;
    }
  }

  /**
   * Deposition: the record scrolls up through the viewport as progress grows,
   * so layers arrive from below the fold and accumulate above.
   */
  private draw() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    if (w === 0 || h === 0) return;

    const total = this.layers[this.layers.length - 1].depth;
    // Start a little way into the record so the column is full at first paint:
    // an empty band at the top of the viewport reads as a bug, not as "before
    // the record began". Scroll then travels to the end of the sequence.
    const start = total * 0.04;
    const travel = Math.max(1, total - h - start);
    const offset = -(start + this.renderedProgress * travel);

    const px = this.pointer.x;
    const py = this.pointer.y;
    const strength = this.pointer.strength;

    for (const layer of this.layers) {
      const y0 = layer.depth + offset;
      if (y0 < -80 || y0 > h + 80) continue;

      // Parting: bands bend away from the pointer, more the closer they are,
      // as though the column were being opened with a thumb.
      let shift = 0;
      let spread = 0;
      if (strength > 0.002 && px >= 0) {
        const dy = y0 - py;
        const fall = Math.exp(-(dy * dy) / 14000);
        shift = Math.sign(dy || 1) * fall * 26 * strength;
        spread = fall * strength;
      }

      const y = y0 + shift;
      this.drawLayer(layer, y, spread, px);
    }

    // Mask the reading side. Solid up to the column, then a short fade, so
    // the record runs off the page instead of sitting in a box.
    const edge = this.region.x0 * w;
    if (edge <= 4) return;
    const fade = Math.max(60, w * 0.1);
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, Math.max(0, edge - fade), h);
    const grad = ctx.createLinearGradient(Math.max(0, edge - fade), 0, edge + fade * 0.35, 0);
    grad.addColorStop(0, this.bg);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(Math.max(0, edge - fade), 0, fade * 1.35, h);
  }

  private drawLayer(layer: Layer, y: number, spread: number, px: number) {
    const { ctx, w } = this;
    const left = this.region.x0 * w;
    const right = this.region.x1 * w;
    const span = right - left;
    // Ragged edge: each band starts a little differently, the way a split
    // core never breaks on a straight line.
    const x0 = left + layer.inset * span * 1.6;
    const x1 = right;
    const t = layer.thickness;

    // Focus mix dims every tone except the one the current section is about.
    const dim = this.focus === 'all' || this.focus === layer.tone ? 0 : this.focusMix * 0.72;
    const lift = this.focus === layer.tone ? this.focusMix * 0.35 : 0;

    switch (layer.tone) {
      case 'binding': {
        const a = (0.92 + lift) * (1 - dim);
        const g = ctx.createLinearGradient(0, y, 0, y + t);
        g.addColorStop(0, rgba(PALETTE.ochre, a));
        g.addColorStop(0.55, rgba(PALETTE.ochre, a * 0.86));
        g.addColorStop(1, rgba(PALETTE.clay, a * 0.7));
        ctx.fillStyle = g;
        ctx.fillRect(x0, y, x1 - x0, t);
        // A brighter seam on top, which is what catches the light on a core.
        ctx.fillStyle = rgba(PALETTE.ochre, Math.min(1, a + 0.22));
        ctx.fillRect(x0, y, x1 - x0, 1);
        break;
      }
      case 'violated': {
        // Same weight as a binding band, but broken: the rule still holds,
        // the record shows where the codebase parts from it.
        const a = (0.82 + lift) * (1 - dim);
        ctx.fillStyle = rgba(PALETTE.ochre, a);
        const gapCentre = x0 + (0.25 + layer.seed * 0.5) * (x1 - x0);
        const gapW = 46 + layer.seed * 90 + spread * 120;
        ctx.fillRect(x0, y, Math.max(0, gapCentre - gapW / 2 - x0), t);
        ctx.fillRect(gapCentre + gapW / 2, y + t * 0.35, Math.max(0, x1 - (gapCentre + gapW / 2)), t);
        break;
      }
      case 'proposed': {
        // A hairline. Present, readable, binding nothing.
        const a = (0.66 + lift) * (1 - dim);
        ctx.strokeStyle = rgba(this.neutral, a * 0.62);
        ctx.lineWidth = 1;
        ctx.setLineDash([9, 7]);
        ctx.beginPath();
        ctx.moveTo(x0, y + 0.5);
        ctx.lineTo(x1, y + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      }
      case 'ghost': {
        const a = (0.2 + lift * 0.45) * (1 - dim);
        ctx.fillStyle = rgba(this.neutral, a);
        ctx.fillRect(x0, y, x1 - x0, t);
        break;
      }
      case 'note': {
        const a = (0.26 + lift * 0.5) * (1 - dim);
        ctx.fillStyle = rgba(this.neutral, a);
        ctx.fillRect(x0, y, x1 - x0, t * 0.5);
        break;
      }
    }

    // Grit along the boundary, denser where the pointer is parting the column.
    if (spread > 0.05 && layer.tone !== 'proposed') {
      const rand = rng(Math.floor(layer.seed * 1e6));
      const n = Math.floor(spread * 26);
      ctx.fillStyle = rgba(this.neutral, 0.16 * spread);
      for (let i = 0; i < n; i++) {
        const gx = x0 + rand() * (x1 - x0);
        const gy = y + (rand() - 0.5) * (t + 10);
        ctx.fillRect(gx, gy, 1.2, 1.2);
      }
    }
  }
}
