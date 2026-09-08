/**
 * Procedural fabric textures: weave colour, derived normal, and roughness
 * maps drawn to canvas at physical scale — no image assets (decision D3).
 * Precedent: Hack23/blacktrigram fabricTextures.ts (CanvasTexture weave +
 * normal + roughness); matte-cloth roughness 0.70–0.85 and weave normal-map
 * strength 0.02–0.05 come from the texturize.app generator docs via the
 * findings log §2.
 *
 * The module splits cleanly:
 *  - pure geometry (`weaveLayout`, `heightField`, `normalField`,
 *    `roughnessField`) — deterministic, unit-tested in jsdom;
 *  - browser-only rasterization (`createFabricTextures`) — same canvas
 *    elements are repainted on `update`, so a fabric swap re-skins every
 *    piece without reallocating GPU textures.
 *
 * Physical scale: one texture tile spans `tileCm` true centimetres (an
 * integer number of weave repeats, and of stripe bands when striped), so
 * the texture's `repeat` is 1/tileCm per world centimetre. Weave taxonomy:
 * plain (1×1 interlace), 2/2 twill (diagonal), 5-end satin (long weft
 * floats — the lustrous one).
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { FabricSpec, WeaveType } from '../model';

/** Fundamental interlace period in threads per axis, per weave. */
export const WEAVE_PERIOD: Readonly<Record<WeaveType, number>> = {
  plain: 2,
  twill: 4,
  satin: 5,
};

/** Matte-cloth base roughness per weave (findings log range 0.70–0.85). */
export function roughnessFor(weave: WeaveType): number {
  switch (weave) {
    case 'satin':
      return 0.74;
    case 'twill':
      return 0.78;
    case 'plain':
      return 0.82;
  }
}

/** Weave normal-map strength per weave (findings log range 0.02–0.05). */
export function normalStrengthFor(weave: WeaveType): number {
  switch (weave) {
    case 'satin':
      return 0.025;
    case 'twill':
      return 0.035;
    case 'plain':
      return 0.045;
  }
}

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Parse a validated FabricSpec hex color (`#rgb`/`#rrggbb`) into channels. */
export function hexToRgb(hex: string): Rgb {
  const digits = hex.slice(1);
  const expand = (d: string): number => parseInt(d + d, 16);
  const r =
    digits.length === 3 ? expand(digits[0]) : parseInt(digits.slice(0, 2), 16);
  const g =
    digits.length === 3 ? expand(digits[1]) : parseInt(digits.slice(2, 4), 16);
  const b =
    digits.length === 3 ? expand(digits[2]) : parseInt(digits.slice(4, 6), 16);
  return { r, g, b };
}

/** Scale an RGB color by k (k < 1 darkens) — used to derive the stripe shade. */
export function shade(color: Rgb, k: number): Rgb {
  return {
    r: Math.round(color.r * k),
    g: Math.round(color.g * k),
    b: Math.round(color.b * k),
  };
}

export function rgbCss(color: Rgb): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

/**
 * Does the warp thread crossing weft column `col` in warp row `row` pass
 * over the weft? Texture space: warp threads run along +u (stacked along
 * v), weft threads along +v — the grainline UV rotation (pieceGeometry)
 * maps +u onto each piece's grain, so warp-direction stripes run true to
 * grain by construction.
 */
export function warpUpAt(weave: WeaveType, row: number, col: number): boolean {
  switch (weave) {
    case 'plain':
      // Alternating over-under: checkerboard.
      return (row + col) % 2 === 0;
    case 'twill':
      // 2/2 twill: two-up floats stepping one thread per row → the diagonal.
      return (((col - row) % 4) + 4) % 4 < 2;
    case 'satin':
      // 5-end satin: one interlacing per thread, stepping +2 → weft floats
      // of four, which is where satin's luster lives.
      return col === (2 * row) % 5;
  }
}

function lcm(a: number, b: number): number {
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  return (a * b) / gcd(a, b);
}

/** Canvas edge in pixels — enough threads for detail, small enough to mipmap. */
export const TILE_SIZE_PX = 256;
/** Max threads across a tile: 256px / 64 = 4px per thread at the floor. */
const MAX_THREADS_ACROSS = 64;

export interface WeaveLayout {
  readonly sizePx: number;
  /** Interlace period (threads per repeat) of this weave. */
  readonly period: number;
  /** True centimetres per thread. */
  readonly pitchCm: number;
  /** Threads across the tile — a multiple of the weave period (and of the stripe period when striped) so the tile is seamless. */
  readonly threadsAcross: number;
  readonly threadPx: number;
  /** World centimetres covered by one tile. */
  readonly tileCm: number;
  /** Colored-warp band width in threads (0 = solid colour). */
  readonly stripeBandThreads: number;
  /** warpUpAt per cell: [warpRow][weftCol]. */
  readonly warpUp: readonly (readonly boolean[])[];
  /** Warp rows painted in the stripe shade. */
  readonly stripeRows: readonly number[];
  readonly base: Rgb;
  readonly stripe: Rgb;
}

/**
 * Deterministic weave geometry for a spec. Stripe bands quantize to whole
 * threads (a thread is either one colour or the other) and, with the weave
 * period, must divide the tile — so `stripeCm` snaps to the nearest whole
 * thread count that tiles seamlessly.
 */
export function weaveLayout(
  spec: FabricSpec,
  sizePx = TILE_SIZE_PX,
): WeaveLayout {
  const period = WEAVE_PERIOD[spec.weave];
  const pitchCm = spec.weaveScale / period;
  const base = hexToRgb(spec.color);
  const stripe = shade(base, 0.55);

  // Stripe band width in whole threads, capped so the tile stays legible.
  let band = 0;
  if (spec.stripeCm !== undefined) {
    const requested = Math.max(1, Math.round(spec.stripeCm / pitchCm));
    band = requested;
    while (band > 1 && lcm(2 * band, period) > MAX_THREADS_ACROSS) band -= 1;
  }

  const threadsAcross = band > 0 ? lcm(2 * band, period) : period;

  const warpUp: boolean[][] = [];
  for (let row = 0; row < threadsAcross; row++) {
    warpUp.push(
      Array.from({ length: threadsAcross }, (_, col) =>
        warpUpAt(spec.weave, row, col),
      ),
    );
  }

  const stripeRows: number[] = [];
  if (band > 0) {
    for (let row = 0; row < threadsAcross; row++) {
      if (Math.floor(row / band) % 2 === 1) stripeRows.push(row);
    }
  }

  return {
    sizePx,
    period,
    pitchCm,
    threadsAcross,
    threadPx: sizePx / threadsAcross,
    tileCm: threadsAcross * pitchCm,
    stripeBandThreads: band,
    warpUp,
    stripeRows,
    base,
    stripe,
  };
}

/**
 * Woven-surface height in [0, 1] per pixel: the top thread in each crossing
 * is a semi-elliptical ridge running along its thread direction. Smooth by
 * construction (no noise), so the derived normals are clean.
 */
export function heightField(layout: WeaveLayout): Float32Array {
  const { sizePx, threadPx, warpUp } = layout;
  const field = new Float32Array(sizePx * sizePx);
  for (let py = 0; py < sizePx; py++) {
    const y = py + 0.5;
    const row = Math.floor(y / threadPx);
    for (let px = 0; px < sizePx; px++) {
      const x = px + 0.5;
      const col = Math.floor(x / threadPx);
      // Distance from the top thread's centerline, across the thread.
      const d = warpUp[row][col]
        ? Math.abs(y - (row + 0.5) * threadPx)
        : Math.abs(x - (col + 0.5) * threadPx);
      const t = Math.min((2 * d) / threadPx, 1);
      field[py * sizePx + px] = Math.sqrt(1 - t * t);
    }
  }
  return field;
}

/**
 * Tangent-space normal map derived from the height field. `strength` scales
 * the xy tilt away from face-normal (the 0.02–0.05 weave range; scaled
 * against 0.05 so the top of the range uses the raw surface normal).
 */
export function normalField(layout: WeaveLayout, strength: number): Uint8Array {
  const sizePx = layout.sizePx;
  const height = heightField(layout);
  const at = (x: number, y: number): number =>
    height[Math.min(y, sizePx - 1) * sizePx + Math.min(x, sizePx - 1)];

  const rgba = new Uint8Array(sizePx * sizePx * 4);
  const xyScale = strength / 0.05;
  for (let y = 0; y < sizePx; y++) {
    for (let x = 0; x < sizePx; x++) {
      const dhdx =
        x === 0 ? at(1, y) - at(0, y) : (at(x + 1, y) - at(x - 1, y)) / 2;
      const dhdy =
        y === 0 ? at(x, 1) - at(x, 0) : (at(x, y + 1) - at(x, y - 1)) / 2;
      // Surface normal from the gradient, then scale the tilt.
      const len = Math.hypot(dhdx, dhdy, 1);
      const nx = (-dhdx / len) * xyScale;
      const ny = (-dhdy / len) * xyScale;
      const nz = 1 / len;
      const o = (y * sizePx + x) * 4;
      rgba[o] = Math.round((nx * 0.5 + 0.5) * 255);
      rgba[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      rgba[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

/**
 * Roughness map as a multiplier on the material's base roughness: long
 * thread floats catch light (glossier multiplier), tight interlacings sit
 * matte. With `roughnessFor` bases of 0.74–0.82 the effective range stays
 * inside the 0.70–0.85 matte-cloth band.
 */
export function roughnessField(layout: WeaveLayout): Uint8Array {
  const { sizePx, threadPx, warpUp } = layout;
  const t = layout.threadsAcross;
  // Float run length of the top thread through each cell.
  const run: number[][] = warpUp.map((warpRow, i) =>
    warpRow.map((up, j) => {
      let n = 1;
      if (up) {
        for (let j2 = j + 1; j2 < t && warpRow[j2]; j2++) n++;
        for (let j2 = j - 1; j2 >= 0 && warpRow[j2]; j2--) n++;
      } else {
        for (let i2 = i + 1; i2 < t && !warpUp[i2][j]; i2++) n++;
        for (let i2 = i - 1; i2 >= 0 && !warpUp[i2][j]; i2--) n++;
      }
      return n;
    }),
  );

  const rgba = new Uint8Array(sizePx * sizePx * 4);
  for (let py = 0; py < sizePx; py++) {
    const row = Math.min(Math.floor((py + 0.5) / threadPx), t - 1);
    for (let px = 0; px < sizePx; px++) {
      const col = Math.min(Math.floor((px + 0.5) / threadPx), t - 1);
      const factor = 1 - 0.05 * (Math.min(run[row][col], 4) / 4);
      const v = Math.round(factor * 255);
      const o = (py * sizePx + px) * 4;
      rgba[o] = v;
      rgba[o + 1] = v;
      rgba[o + 2] = v;
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

/**
 * Deterministic per-cell brightness jitter in [-1, 1]. Sin-hash on integer
 * cell coordinates: same input, same value, no state.
 */
function cellJitter(row: number, col: number): number {
  const h = Math.sin(row * 127.1 + col * 311.7) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
}

export interface FabricTextures {
  readonly map: CanvasTexture;
  readonly normalMap: CanvasTexture;
  readonly roughnessMap: CanvasTexture;
  /** Repaint all three canvases for a new spec (same GPU textures). */
  update(spec: FabricSpec): void;
  dispose(): void;
}

/**
 * Build the three fabric maps for a spec. Browser-only (needs a 2d canvas
 * context); the pure geometry above carries the test surface, mirroring
 * matTexture.ts.
 */
export function createFabricTextures(spec: FabricSpec): FabricTextures {
  const makeCanvas = (): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE_PX;
    canvas.height = TILE_SIZE_PX;
    return canvas;
  };
  const mapCanvas = makeCanvas();
  const normalCanvas = makeCanvas();
  const roughnessCanvas = makeCanvas();

  const mapCtx = mapCanvas.getContext('2d');
  const normalCtx = normalCanvas.getContext('2d');
  const roughnessCtx = roughnessCanvas.getContext('2d');
  if (!mapCtx || !normalCtx || !roughnessCtx) {
    throw new Error('fabric textures require a 2d canvas context');
  }

  const paintColorMap = (layout: WeaveLayout): void => {
    const { sizePx, threadPx, threadsAcross, warpUp, stripeRows } = layout;
    const stripeSet = new Set(stripeRows);
    mapCtx.fillStyle = rgbCss(layout.base);
    mapCtx.fillRect(0, 0, sizePx, sizePx);

    for (let row = 0; row < threadsAcross; row++) {
      for (let col = 0; col < threadsAcross; col++) {
        const warpOnTop = warpUp[row][col];
        const isStripe = warpOnTop && stripeSet.has(row);
        const rgb = isStripe ? layout.stripe : layout.base;
        // Cylinder shading across the thread plus deterministic fiber jitter.
        const jitter = 1 + cellJitter(row, col) * 0.04;
        const centre = shade(rgb, Math.min(1.12 * jitter, 1));
        const edge = shade(rgb, 0.82 * jitter);
        const grad = warpOnTop
          ? mapCtx.createLinearGradient(
              0,
              row * threadPx,
              0,
              (row + 1) * threadPx,
            )
          : mapCtx.createLinearGradient(
              col * threadPx,
              0,
              (col + 1) * threadPx,
              0,
            );
        grad.addColorStop(0, rgbCss(edge));
        grad.addColorStop(0.5, rgbCss(centre));
        grad.addColorStop(1, rgbCss(edge));
        mapCtx.fillStyle = grad;

        // Slight overscan so consecutive segments of one thread fuse.
        const over = 0.5;
        if (warpOnTop) {
          mapCtx.fillRect(
            col * threadPx - over,
            row * threadPx,
            threadPx + 2 * over,
            threadPx,
          );
        } else {
          mapCtx.fillRect(
            col * threadPx,
            row * threadPx - over,
            threadPx,
            threadPx + 2 * over,
          );
        }
      }
    }
  };

  const putData = (ctx: CanvasRenderingContext2D, rgba: Uint8Array): void => {
    const image = ctx.createImageData(TILE_SIZE_PX, TILE_SIZE_PX);
    image.data.set(rgba);
    ctx.putImageData(image, 0, 0);
  };

  const map = new CanvasTexture(mapCanvas);
  map.colorSpace = SRGBColorSpace;
  const normalMap = new CanvasTexture(normalCanvas);
  const roughnessMap = new CanvasTexture(roughnessCanvas);
  for (const texture of [map, normalMap, roughnessMap]) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.anisotropy = 8;
  }

  const paint = (s: FabricSpec): WeaveLayout => {
    const layout = weaveLayout(s);
    paintColorMap(layout);
    putData(normalCtx, normalField(layout, normalStrengthFor(s.weave)));
    putData(roughnessCtx, roughnessField(layout));
    const repeat = 1 / layout.tileCm;
    for (const texture of [map, normalMap, roughnessMap]) {
      texture.repeat.set(repeat, repeat);
      texture.needsUpdate = true;
    }
    return layout;
  };
  paint(spec);

  return {
    map,
    normalMap,
    roughnessMap,
    update(next: FabricSpec): void {
      paint(next);
    },
    dispose(): void {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}
