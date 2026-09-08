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
