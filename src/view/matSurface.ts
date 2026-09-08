/**
 * Single source of truth for the cutting-mat surface model: the fixed
 * reference mat's physical dimensions, the texture tile size, and the
 * work-bounds math that turns placed pieces into surface extents. The
 * layout, the mat texture, and both viewports consume this module — the
 * blueprint's build acceptance forbids a second hardcoded mat constant.
 * Pure constants and pure functions — jsdom-safe by construction.
 */

/** The fixed reference mat, in true centimetres (1 world unit = 1 cm). */
export const MAT_WIDTH_CM = 150;
export const MAT_DEPTH_CM = 100;
/** World centimetres covered by one mat texture tile. */
export const MAT_TILE_CM = 10;

/**
 * How far the paper roll overshoots the work on every side, in
 * centimetres: the paper is sized to the project bounds plus this margin,
 * so the work never sits closer than 10 cm to a paper edge.
 */
export const PAPER_MARGIN_CM = 10;

/** Axis-aligned bounds in mat centimetres (origin: the mat's top-left corner). */
export interface BoundsCm {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** A placed piece's axis-aligned box, in mat centimetres. */
export interface WorkBoxCm {
  readonly xCm: number;
  readonly yCm: number;
  readonly widthCm: number;
  readonly heightCm: number;
}

/**
 * Overall work bounds: the union of every placed piece's bounding box, in
 * mat centimetres. Feeds the paper surface's extent and the fit camera's
 * framing. Returns null for an empty project — "no work" means something
 * different to each consumer, so callers decide.
 */
export function workBoundsCm(
  boxes: readonly WorkBoxCm[],
): BoundsCm | null {
  if (boxes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.xCm);
    minY = Math.min(minY, box.yCm);
    maxX = Math.max(maxX, box.xCm + box.widthCm);
    maxY = Math.max(maxY, box.yCm + box.heightCm);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Paper surface bounds: the work bounds grown by PAPER_MARGIN_CM on every
 * side. This is the declared containment contract — no placement may sit
 * beyond the mat and paper surfaces together, so the paper always encloses
 * the whole work with breathing room.
 */
export function paperBoundsCm(work: BoundsCm): BoundsCm {
  return {
    minX: work.minX - PAPER_MARGIN_CM,
    minY: work.minY - PAPER_MARGIN_CM,
    maxX: work.maxX + PAPER_MARGIN_CM,
    maxY: work.maxY + PAPER_MARGIN_CM,
  };
}
