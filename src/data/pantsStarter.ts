/**
 * Pants starter data (blueprint D5 ladder, last rung): the adapter's legs plus
 * simple parametric auxiliaries, so selecting the starter puts real trouser
 * pieces on the mat and every measurement change redrafts the whole set.
 *
 * The legs come straight from the Titan adapter — the same redraft the
 * measurements panel drives — so the front and back always track real drafts.
 * The waistband, fly shield, and pocket bag are hand-authored cm-space vector
 * pieces sized from PantMeasurements (not from the draft outlines): their
 * formulas reproduce the template-draft relationships almost exactly (the
 * front's waist edge measures the eased waist quarter; the front's fly edge
 * measures ≈ 0.46 × fork depth) and stay valid across the panel's whole
 * range, where Titan's outline topology itself changes shape.
 *
 * Coordinates are centimetres, y-up (the domain convention). Titan's draft is
 * deterministic (titanPants.test.ts); the named-edge anatomy below is pinned
 * by tests at the template so an adapter upgrade that changes the topology
 * fails loudly instead of mis-seaming.
 */
import type { EdgeChain, PathCmd, Piece } from '../model';
import { closePath, lineTo, moveTo, quadTo } from '../model';
import { vec2 } from '../model';
import type { PantMeasurements } from '../engine/titanSettings';
import { TITAN_PANTS_TEMPLATE, forkDepthCm } from '../engine/titanSettings';
import { redraftPants } from '../engine/titanPants';

/**
 * Titan leg outlines have a fixed command anatomy at the template draft:
 * 7 vertices each (M + six segments + Z). Every chain here names a whole
 * edge run off that anatomy — EdgeChain granularity is whole outline edges,
 * so a sub-edge (a pocket mouth partway down the side seam) cannot be
 * referenced. Valid at the template and its neighbourhood; Titan may add
 * outline vertices at extreme ease settings, where these chains stay in
 * bounds but their semantics are not guaranteed.
 */
export const LEG_VERTEX_COUNT = 7;

/** Adapter ids for the two leg pieces (see engine/titanPants.ts). */
const FRONT_ID = 'pants-front';
const BACK_ID = 'pants-back';

export const FRONT_CHAINS = {
  /** Waist side corner down to the hem: one long cubic. */
  outseam: { pieceId: FRONT_ID, startVertex: 0, edgeCount: 1 },
  hem: { pieceId: FRONT_ID, startVertex: 1, edgeCount: 1 },
  /** Hem corner up to the fork: the inseam (lower crotch included). */
  inseam: { pieceId: FRONT_ID, startVertex: 2, edgeCount: 1 },
  /** Fork up to the centre-front waist corner: the rise, fly edge included. */
  rise: { pieceId: FRONT_ID, startVertex: 3, edgeCount: 2 },
  /** Just the crotch curve + fly extension bump (fork → fly notch). */
  flyExtension: { pieceId: FRONT_ID, startVertex: 3, edgeCount: 1 },
  /** Centre-front waist corner across to the side: the front's waist edge. */
  waist: { pieceId: FRONT_ID, startVertex: 5, edgeCount: 1 },
} satisfies Record<string, EdgeChain>;

export const BACK_CHAINS = {
  /** Fork down to the hem: the back's inseam (mirror of the front's). */
  inseam: { pieceId: BACK_ID, startVertex: 0, edgeCount: 1 },
  hem: { pieceId: BACK_ID, startVertex: 1, edgeCount: 1 },
  outseam: { pieceId: BACK_ID, startVertex: 2, edgeCount: 1 },
  /** Side waist corner across to the centre back: the back's waist edge. */
  waist: { pieceId: BACK_ID, startVertex: 3, edgeCount: 1 },
  /** Centre-back waist corner around the seat down to the fork. */
  rise: { pieceId: BACK_ID, startVertex: 4, edgeCount: 2 },
} satisfies Record<string, EdgeChain>;

/** Seam allowance recorded on hand-authored aux pieces (notebook-holder convention). */
const AUX_SEAM_ALLOWANCE = 1.5;
/** Finished waistband depth, centimetres. */
const WAISTBAND_DEPTH_CM = 4;
/** Finished pocket-bag depth as a fraction of its mouth length. */
const POCKET_DEPTH_FRACTION = 0.75;
/** Finished fly-shield width as a fraction of its attach-edge length. */
const SHIELD_WIDTH_FRACTION = 0.55;
/** Front fly-edge length as a fraction of the fork depth — measured from the
 * Titan template draft (fly edge chord ≈ 0.46 × fork depth). */
const SHIELD_ATTACH_PER_FORK_DEPTH = 0.46;
/** Pocket mouth as a multiple of the front's waist edge (a slant opening). */
const POCKET_MOUTH_PER_WAIST_QUARTER = 1.2;

/** Horizontal grainline arrow centred at (cx, cy), spanning ±halfSpan. */
function horizontalGrainMarks(
  cx: number,
  cy: number,
  halfSpan: number,
): PathCmd[] {
  return [
    moveTo(vec2(cx - halfSpan, cy)),
    lineTo(vec2(cx + halfSpan, cy)),
    moveTo(vec2(cx + halfSpan, cy)),
    lineTo(vec2(cx + halfSpan - 1.4, cy - 1)),
    moveTo(vec2(cx + halfSpan, cy)),
    lineTo(vec2(cx + halfSpan - 1.4, cy + 1)),
  ];
}

/** Vertical grainline arrow centred at (cx, cy), spanning ±halfSpan. */
function verticalGrainMarks(
  cx: number,
  cy: number,
  halfSpan: number,
): PathCmd[] {
  return [
    moveTo(vec2(cx, cy - halfSpan)),
    lineTo(vec2(cx, cy + halfSpan)),
    moveTo(vec2(cx, cy + halfSpan)),
    lineTo(vec2(cx - 1, cy + halfSpan - 1.4)),
    moveTo(vec2(cx, cy + halfSpan)),
    lineTo(vec2(cx + 1, cy + halfSpan - 1.4)),
  ];
}

/** Short vertical notch tick, hanging down from an opening edge at y = 0. */
function notchMark(x: number): PathCmd[] {
  return [moveTo(vec2(x, -0.2)), lineTo(vec2(x, -1.2))];
}

/**
 * The hand-authored auxiliaries, sized from the measurements:
 *
 * - Waistband: a rectangle as long as the full eased waist circumference
 *   (two cut-2 legs wrap it once), its bottom edge split at the quarter
 *   points so each half can be named to a leg. Grain runs along its length.
 * - Fly shield: a rounded tongue whose attach edge matches the front's fly
 *   extension edge; it grows with the fork depth as the crotch drops.
 * - Pocket bag: a rounded pouch with a mouth scaled to the front's waist
 *   edge (a slant-pocket opening), caught in the side seam at assembly.
 */
export function pantsAuxPieces(measurements: PantMeasurements): Piece[] {
  const easedWaist =
    measurements.waistCm * (1 + measurements.waistEasePct / 100);
  const waistQuarter = easedWaist / 4;

  // --- Waistband -----------------------------------------------------------
  const bandLength = easedWaist;
  const quarter = bandLength / 4;
  const bandOutline = [
    moveTo(vec2(0, 0)),
    lineTo(vec2(quarter, 0)),
    lineTo(vec2(quarter * 2, 0)),
    lineTo(vec2(quarter * 3, 0)),
    lineTo(vec2(bandLength, 0)),
    lineTo(vec2(bandLength, WAISTBAND_DEPTH_CM)),
    lineTo(vec2(0, WAISTBAND_DEPTH_CM)),
    closePath(),
  ];
  // Centre-back notch on the bottom edge at the band's midpoint.
  const bandMarks = [
    ...horizontalGrainMarks(quarter * 2, WAISTBAND_DEPTH_CM / 2, quarter * 0.7),
    moveTo(vec2(quarter * 2, 0.4)),
    lineTo(vec2(quarter * 2, 1.6)),
  ];

  // --- Fly shield ----------------------------------------------------------
  const attachLength = forkDepthCm(measurements) * SHIELD_ATTACH_PER_FORK_DEPTH;
  const shieldWidth = attachLength * SHIELD_WIDTH_FRACTION;
  const shieldOutline = [
    moveTo(vec2(0, 0)),
    lineTo(vec2(attachLength, 0)),
    lineTo(vec2(attachLength, -(shieldWidth - 1.5))),
    quadTo(
      vec2(attachLength, -shieldWidth),
      vec2(attachLength - 1.5, -shieldWidth),
    ),
    lineTo(vec2(1.5, -shieldWidth)),
    quadTo(vec2(0, -shieldWidth), vec2(0, -(shieldWidth - 1.5))),
    closePath(),
  ];
  const shieldMarks = [...notchMark(0.6), ...notchMark(attachLength - 0.6)];

  // --- Pocket bag ----------------------------------------------------------
  const mouth = waistQuarter * POCKET_MOUTH_PER_WAIST_QUARTER;
  const depth = mouth * POCKET_DEPTH_FRACTION;
  const r = Math.min(3, depth / 3);
  const pocketOutline = [
    moveTo(vec2(0, 0)),
    lineTo(vec2(mouth, 0)),
    lineTo(vec2(mouth, -(depth - r))),
    quadTo(vec2(mouth, -depth), vec2(mouth - r, -depth)),
    lineTo(vec2(r, -depth)),
    quadTo(vec2(0, -depth), vec2(0, -(depth - r))),
    closePath(),
  ];
  const pocketMarks = [
    ...verticalGrainMarks(mouth / 2, -depth / 2, depth * 0.3),
    ...notchMark(0.6),
    ...notchMark(mouth - 0.6),
  ];

  return [
    {
      id: 'waistband',
      name: 'Waistband',
      outline: bandOutline,
      internal: bandMarks,
      grainline: {
        angle: 0,
        placement: vec2(quarter * 2, WAISTBAND_DEPTH_CM / 2),
      },
      seamAllowance: AUX_SEAM_ALLOWANCE,
      cutCount: 1,
    },
    {
      id: 'fly-shield',
      name: 'Fly shield',
      outline: shieldOutline,
      internal: shieldMarks,
      grainline: {
        angle: 0,
        placement: vec2(attachLength / 2, -shieldWidth / 2),
      },
      seamAllowance: AUX_SEAM_ALLOWANCE,
      cutCount: 1,
    },
    {
      id: 'pocket-bag',
      name: 'Front pocket bag',
      outline: pocketOutline,
      internal: pocketMarks,
      grainline: { angle: 90, placement: vec2(mouth / 2, -depth / 2) },
      seamAllowance: AUX_SEAM_ALLOWANCE,
      cutCount: 2,
    },
  ];
}

/**
 * The full starter piece set at the given measurements: adapter legs plus the
 * measurement-sized auxiliaries. This is the unit the starter project and the
 * measurements panel's live redraft both consume.
 */
export function redraftPantsStarter(
  measurements: PantMeasurements,
): readonly Piece[] {
  const legs = redraftPants(measurements);
  return [...legs, ...pantsAuxPieces(measurements)];
}

/** The pants starter's default measurements: Titan's size-40 template. */
export const PANTS_STARTER_MEASUREMENTS: PantMeasurements =
  TITAN_PANTS_TEMPLATE;

/** Y-extent of an outline's vertices — used to place and sanity-check marks. */
export function outlineHeightCm(outline: readonly PathCmd[]): number {
  const ys: number[] = [];
  for (const cmd of outline) {
    if (
      cmd.type === 'M' ||
      cmd.type === 'L' ||
      cmd.type === 'C' ||
      cmd.type === 'Q'
    ) {
      ys.push(cmd.point.y);
    }
  }
  return Math.max(...ys) - Math.min(...ys);
}
