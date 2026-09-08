/**
 * Procedural spot-and-cross pattern-paper texture. Real drafting paper
 * prints crosses on a coarse lattice with dots filling the intermediate
 * intersections; here the cadence matches the mat's ladder — dots on the
 * 5 cm medium tier, crosses on the 10 cm major tier — so both surfaces read
 * as one studio. Pure geometry below is jsdom-safe and pinned by tests; the
 * canvas renderers are browser-only.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { BoundsCm } from './matSurface';
import { MAT_TILE_CM } from './matSurface';

/** Canvas pixels per world centimetre (matches the mat texture). */
export const PAPER_PX_PER_CM = 24;
/** Dots sit on the mat ladder's medium tier… */
export const PAPER_DOT_EVERY_CM = 5;
/** …crosses on its major tier. */
export const PAPER_CROSS_EVERY_CM = MAT_TILE_CM;

/** Ivory base with warm grey print — pattern paper, not plotter film. */
const PAPER_BASE = '#f4efe4';
const PRINT = '#a89c86';
const LABEL_PRINT = '#6b6355';

export interface PaperTileMarks {
  readonly crosses: ReadonlyArray<readonly [number, number]>;
  readonly dots: ReadonlyArray<readonly [number, number]>;
}

/**
 * Mark positions in one MAT_TILE_CM tile, tile-local centimetres. Edge and
 * corner marks are stamped on BOTH sides of the tile (a corner cross at all
 * four corners, edge dots on all four edge midpoints) so that tiled repeats
 * combine clipped halves into whole marks — without this, every repeat
 * boundary slices the dots in half.
 */
export function paperTileMarks(
  dotEveryCm: number = PAPER_DOT_EVERY_CM,
  crossEveryCm: number = PAPER_CROSS_EVERY_CM,
): PaperTileMarks {
  const t = crossEveryCm;
  const d = dotEveryCm;
  return {
    crosses: [
      [0, 0],
      [t, 0],
      [0, t],
      [t, t],
    ],
    dots: [
      [0, d],
      [t, d],
      [d, 0],
      [d, t],
      [d, d],
    ],
  };
}

/** The paper's own dimension label, for its rendered mesh extent. */
export function paperLabel(extent: BoundsCm): { text: string; sub: string } {
  const widthCm = extent.maxX - extent.minX;
  const heightCm = extent.maxY - extent.minY;
  return {
    text: `${roundCm(widthCm)} × ${roundCm(heightCm)} cm`,
    sub: 'spot-and-cross pattern paper',
  };
}

/**
 * Label position: centred across the roll, a step inside its near edge —
 * the band that stays clear of overflow pieces (they fill from the mat's
 * far edge outward).
 */
export function paperLabelPos(extent: BoundsCm): { xCm: number; yCm: number } {
  return {
    xCm: (extent.minX + extent.maxX) / 2,
    yCm: extent.minY + 6,
  };
}

function roundCm(cm: number): number {
  return Math.round(cm * 10) / 10;
}

// --- Renderers (browser-only) ---------------------------------------------

/**
 * One seamless tile: crosses at the corners, dots at the edge midpoints and
 * centre. Repeated across the paper mesh via RepeatWrapping — the tile is
 * dynamic-sized-paper's answer to the mat's one big canvas (a roll can
 * outgrow GPU texture limits; a tile never does).
 */
export function createPaperTileTexture(): CanvasTexture {
  const size = MAT_TILE_CM * PAPER_PX_PER_CM;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('pattern paper requires a 2d canvas context');
  }

  ctx.fillStyle = PAPER_BASE;
  ctx.fillRect(0, 0, size, size);

  const { crosses, dots } = paperTileMarks();
  // Dots: small filled points at the 5 cm intersections.
  ctx.fillStyle = PRINT;
  for (const [xCm, yCm] of dots) {
    ctx.beginPath();
    ctx.arc(xCm * PAPER_PX_PER_CM, yCm * PAPER_PX_PER_CM, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Crosses: open + strokes at the 10 cm intersections.
  ctx.strokeStyle = PRINT;
  ctx.lineWidth = 2.5;
  const arm = 0.9 * PAPER_PX_PER_CM;
  for (const [xCm, yCm] of crosses) {
    const px = xCm * PAPER_PX_PER_CM;
    const py = yCm * PAPER_PX_PER_CM;
    ctx.beginPath();
    ctx.moveTo(px - arm, py);
    ctx.lineTo(px + arm, py);
    ctx.moveTo(px, py - arm);
    ctx.lineTo(px, py + arm);
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Small transparent canvas carrying the paper's dimension label. */
export function createPaperLabelTexture(text: string, sub: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('pattern paper label requires a 2d canvas context');
  }
  const fontStack = "'Avenir Next', 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = LABEL_PRINT;
  ctx.font = `48px ${fontStack}`;
  ctx.fillText(text, canvas.width / 2, 56);
  ctx.font = `30px ${fontStack}`;
  ctx.fillText(sub, canvas.width / 2, 112);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
