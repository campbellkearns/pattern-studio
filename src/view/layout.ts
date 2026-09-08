/**
 * Deterministic shelf packing for laying pieces out on the cutting mat.
 * Pieces keep their input order; rows wrap when the next piece would cross
 * the mat's usable width, and rows that would start past the mat's usable
 * depth land on the paper surface beyond the mat's far edge. Pure function
 * — the viewport consumes placements as the min-corner of each piece's
 * bounding box.
 */
export interface LayoutInput {
  readonly id: string;
  readonly widthCm: number;
  readonly heightCm: number;
}

/** The surfaces a placement can land on. */
export type SurfaceId = 'mat' | 'paper';

export interface Placement {
  readonly id: string;
  /** Min-corner of the piece's bounding box, in mat centimetres. */
  readonly xCm: number;
  readonly yCm: number;
  /**
   * Which surface this row landed on. A mat row may cross the mat's far
   * edge when a piece is deeper than the mat — that overrun belongs to
   * the paper surface by design; paper rows always start beyond it.
   */
  readonly surface: SurfaceId;
}

export interface LayoutOptions {
  /** Gap between pieces and around the mat edge, in centimetres. */
  readonly gapCm: number;
  /** Usable mat width, in centimetres. */
  readonly matWidthCm: number;
  /**
   * Mat depth budget, in centimetres: rows may start only within
   * matDepthCm − gapCm; rows that would start deeper land on paper.
   */
  readonly matDepthCm: number;
}

/**
 * Converts a mat-space placement (0-based, origin at the mat's top-left
 * corner) into world space, where the mat is centred on the origin.
 * World Y is up; the mat lies in the XZ plane with +Z toward the viewer,
 * so mat-down (+yCm) maps to world −Z.
 */
export function placementToWorld(
  placement: Placement,
  matWidthCm: number,
  matDepthCm: number,
): { xCm: number; zCm: number } {
  return {
    xCm: placement.xCm - matWidthCm / 2,
    zCm: matDepthCm / 2 - placement.yCm,
  };
}

export function layoutOnMat(
  inputs: readonly LayoutInput[],
  options: LayoutOptions,
): Placement[] {
  const { gapCm, matWidthCm, matDepthCm } = options;
  // Depth budget: a row may start only where the mat still has depth —
  // the same trailing-gap reservation the width check makes.
  const usableDepthCm = matDepthCm - gapCm;
  const placements: Placement[] = [];
  let x = gapCm;
  let y = gapCm;
  let rowHeight = 0;

  for (const input of inputs) {
    if (x > gapCm && x + input.widthCm > matWidthCm - gapCm) {
      // Row full: start a new one.
      x = gapCm;
      y += rowHeight + gapCm;
      rowHeight = 0;
    }
    placements.push({
      id: input.id,
      xCm: x,
      yCm: y,
      // y is constant within a row, so the whole row shares a surface.
      surface: y <= usableDepthCm ? 'mat' : 'paper',
    });
    x += input.widthCm + gapCm;
    rowHeight = Math.max(rowHeight, input.heightCm);
  }

  return placements;
}
