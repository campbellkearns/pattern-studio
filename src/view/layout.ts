/**
 * Deterministic shelf packing for laying pieces out on the cutting mat.
 * Pieces keep their input order; rows wrap when the next piece would cross
 * the mat's usable width. Pure function — the viewport consumes placements
 * as the min-corner of each piece's bounding box.
 */
export interface LayoutInput {
  readonly id: string;
  readonly widthCm: number;
  readonly heightCm: number;
}

export interface Placement {
  readonly id: string;
  /** Min-corner of the piece's bounding box, in mat centimetres. */
  readonly xCm: number;
  readonly yCm: number;
}

export interface LayoutOptions {
  /** Gap between pieces and around the mat edge, in centimetres. */
  readonly gapCm: number;
  /** Usable mat width, in centimetres. */
  readonly matWidthCm: number;
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
  const { gapCm, matWidthCm } = options;
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
    placements.push({ id: input.id, xCm: x, yCm: y });
    x += input.widthCm + gapCm;
    rowHeight = Math.max(rowHeight, input.heightCm);
  }

  return placements;
}
