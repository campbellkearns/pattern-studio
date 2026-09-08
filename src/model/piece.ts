/**
 * Pattern pieces: the cut units a garment is made from.
 *
 * UNITS BOUNDARY — every field here is centimetres, seam allowance included.
 * FreeSewing/Titan drafts in millimetres (docs/spike-freesewing.md); mm→cm
 * conversion belongs in the future engine adapter (parametric-redraft task),
 * not in this model.
 */
import {
  requireFinite,
  requireNonEmptyString,
  requirePositiveInteger,
} from './assert';
import type { PathCmd } from './path';
import { validatePath } from './path';
import type { Vec2 } from './vec2';
import { assertFiniteVec2 } from './vec2';

/**
 * Grain direction on a piece. The angle drives UV/texture rotation so weave
 * runs true to grain; the placement anchors the printed grainline mark.
 */
export interface Grainline {
  /** Degrees counterclockwise from the piece's +x axis, canonicalized to [0, 360). */
  readonly angle: number;
  /** Piece-local anchor of the grainline mark, in centimetres. */
  readonly placement: Vec2;
}

export interface Piece {
  readonly id: string;
  readonly name: string; // e.g. "Front leg", "Waistband"
  /** Closed cutting outline, in centimetres. */
  readonly outline: readonly PathCmd[];
  /** Open marks inside the outline: grainline arrows, notches, fold symbols. */
  readonly internal: readonly PathCmd[];
  readonly grainline: Grainline;
  /** Seam allowance width in centimetres (the engine adapter converts from mm drafts). */
  readonly seamAllowance: number;
  /** How many to cut: "cut 2" → 2, "cut 1 on fold" → 1. */
  readonly cutCount: number;
}

function createGrainline(angle: number, placement: Vec2): Grainline {
  if (!Number.isFinite(angle)) {
    throw new Error(`grainline angle must be a finite number, got ${angle}`);
  }
  assertFiniteVec2(placement, 'grainline placement');
  const canonical = ((angle % 360) + 360) % 360;
  return Object.freeze({
    angle: canonical,
    placement: Object.freeze({ ...placement }),
  });
}

export function createPiece(input: Piece): Piece {
  const id = requireNonEmptyString(input.id, 'piece id');
  const name = requireNonEmptyString(input.name, 'piece name');

  validatePath(input.outline, { closed: true }, `piece "${name}" outline`);
  // A piece may carry no internal marks at all — only outlines are non-empty by invariant.
  if (input.internal.length > 0) {
    validatePath(
      input.internal,
      { closed: false },
      `piece "${name}" internal marks`,
    );
  }

  const seamAllowance = requireFinite(
    input.seamAllowance,
    `piece "${name}" seamAllowance`,
  );
  if (seamAllowance < 0) {
    throw new Error(
      `piece "${name}" seamAllowance must be >= 0, got ${seamAllowance}`,
    );
  }

  return Object.freeze({
    id,
    name,
    outline: input.outline,
    internal: input.internal,
    grainline: createGrainline(
      input.grainline.angle,
      input.grainline.placement,
    ),
    seamAllowance,
    cutCount: requirePositiveInteger(
      input.cutCount,
      `piece "${name}" cutCount`,
    ),
  });
}
