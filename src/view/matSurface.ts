/**
 * Single source of truth for the cutting-mat surface model: the fixed
 * reference mat's physical dimensions, the texture tile size, and the
 * work-bounds math that turns placed pieces into surface extents. The
 * layout, the mat texture, and both viewports consume this module — the
 * blueprint's build acceptance forbids a second hardcoded mat constant.
 * Pure constants and pure functions — jsdom-safe by construction.
 */

import type { SurfaceId } from './layout';

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

// --- Render heights -------------------------------------------------------

/**
 * The mat's top face is the world floor; the paper roll lies just below it —
 * a real mat is thicker than a sheet of paper. The 0.15 cm step keeps the
 * two surfaces' shared far edge readable without visibly floating pieces.
 */
export const MAT_SURFACE_Y_CM = 0;
export const PAPER_SURFACE_Y_CM = -0.15;

/** Render height of the surface a placement landed on. */
export function surfaceHeightCm(surface: SurfaceId): number {
  return surface === 'mat' ? MAT_SURFACE_Y_CM : PAPER_SURFACE_Y_CM;
}

// --- Workroom environment (UX-04) ------------------------------------------

/**
 * The cutting table the mat rests on: one slab, centred on the mat, sized
 * to give working room beyond the mat and paper on every side (the mat is
 * 150 × 100; the table leaves ~95 cm of table left/right and ~80 cm front/
 * back). Pure constants — the mesh that consumes them lives in
 * surfaceMeshes.ts.
 */
export const TABLE_WIDTH_CM = 340;
export const TABLE_DEPTH_CM = 260;
/** Tabletop thickness — thin, so the slab reads as a surface, not furniture. */
export const TABLE_THICKNESS_CM = 4;
/**
 * Tabletop height: below the paper surface (-0.15) so both mat and paper
 * visibly rest on it. The 1.05 cm step is far enough apart to never
 * z-fight at grazing angles while reading as a mat's real-world thickness.
 */
export const TABLE_TOP_Y_CM = -1.2;

/**
 * The soft room-air fade (scene fog), in world centimetres: the work area
 * stays crisp because the fade begins beyond the mat's farthest corner
 * (hypot(150, 100) ≈ 180 cm from centre) plus camera framing margin, and
 * the table edge only dissolves into the drafting-room air at distance.
 */
export const ROOM_FOG_NEAR_CM = 380;
export const ROOM_FOG_FAR_CM = 1500;

// --- Paper mesh extent ------------------------------------------------------

/**
 * The paper surface's rendered extent. The paper exists only beyond the
 * mat's far edge, so the mesh starts at the far edge (placement y =
 * MAT_DEPTH_CM) and runs to the paper bounds' far side — the paper bounds'
 * near-side margin from paperBoundsCm is subsumed by the mat covering that
 * ground. When the work wouldn't push the paper past a minimal apron (or
 * there is no work at all), the roll still shows a PAPER_MARGIN_CM apron
 * beyond the far edge: the roll is a physical presence even when the work
 * fits on the mat.
 */
export function paperSurfaceExtentCm(work: BoundsCm | null): BoundsCm {
  if (!work) {
    return {
      minX: 0,
      minY: MAT_DEPTH_CM,
      maxX: MAT_WIDTH_CM,
      maxY: MAT_DEPTH_CM + PAPER_MARGIN_CM,
    };
  }
  const paper = paperBoundsCm(work);
  return {
    minX: paper.minX,
    maxX: paper.maxX,
    minY: MAT_DEPTH_CM,
    maxY: Math.max(paper.maxY, MAT_DEPTH_CM + PAPER_MARGIN_CM),
  };
}
