/**
 * Pants starter data (blueprint D5 ladder, last rung): the adapter's legs plus
 * simple parametric auxiliaries, so selecting the starter puts real trouser
 * pieces on the mat and every measurement change redrafts the whole set.
 *
 * The legs come straight from the Titan adapter — the same redraft the
 * measurements panel drives — so the front and back always track real drafts.
 * The waistband, fly shield, and pocket bag are hand-authored cm-space vector
 * pieces sized from the legs' MEASURED seam edges (not from formulas over the
 * measurements): the shield's attach edge is the front's measured fly edge,
 * the band's quarters are the measured waist edges, and the pocket mouth
 * scales with the front's waist. Sizing from the draft is what keeps every
 * seam-step chain pair matched across the panel's whole range, where Titan's
 * outline topology itself changes shape.
 *
 * Coordinates are centimetres, y-up (the domain convention). Titan's draft is
 * deterministic (titanPants.test.ts); the seam chains are resolved from the
 * drafted geometry at draft time (see data/pantsSeams.ts) — an adapter
 * upgrade that changes the topology in an unresolvable way fails loudly
 * instead of mis-seaming.
 */
import type {
  EdgeChain,
  PathCmd,
  Piece,
  SeamStep,
  StarterProject,
} from '../model';
import {
  closePath,
  createStarterProject,
  lineTo,
  moveTo,
  quadTo,
} from '../model';
import { vec2 } from '../model';
import type { PantMeasurements } from '../engine/titanSettings';
import { TITAN_PANTS_TEMPLATE } from '../engine/titanSettings';
import { redraftPants } from '../engine/titanPants';
import type { MeasuredLegSeams } from './pantsSeams';
import { measureLegSeams, pantsSeamSteps } from './pantsSeams';

/**
 * Declared ease for the pants' rise seam (see SeamStep.ease): Titan fits
 * the front crotch seam and the back cross seam to different targets
 * (`crossSeamFront` / `crossSeamBack`), so the two rise traces legitimately
 * differ beyond the default 5% gate. The largest gap measured across the
 * panel's parameter ranges is ~12%; the declaration leaves headroom above
 * it while still rejecting a wrong-edge chain (which lands far outside).
 */
export const RISE_SEAM_EASE = 0.2;

/** Seam allowance recorded on hand-authored aux pieces (notebook-holder convention). */
const AUX_SEAM_ALLOWANCE = 1.5;
/** Finished waistband depth, centimetres. */
const WAISTBAND_DEPTH_CM = 4;
/** Finished pocket-bag depth as a fraction of its mouth length. */
const POCKET_DEPTH_FRACTION = 0.75;
/** Finished fly-shield width as a fraction of its attach-edge length. */
const SHIELD_WIDTH_FRACTION = 0.55;
/** Pocket mouth as a multiple of the front's waist edge (a slant opening). */
const POCKET_MOUTH_PER_FRONT_WAIST = 1.2;

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
 * The hand-authored auxiliaries, sized from the legs' measured seam edges:
 *
 * - Waistband: a rectangle as long as the full waist circumference (two
 *   cut-2 legs wrap it once), its bottom edge split into quarters laid out
 *   [front][back][back][front] in sewing order so each half can be named to
 *   a leg and the centre-back notch sits at the band's midpoint. Grain runs
 *   along its length.
 * - Fly shield: a rounded tongue whose attach edge IS the front's measured
 *   fly edge, so it always matches the leg it joins.
 * - Pocket bag: a rounded pouch with a mouth scaled to the front's waist
 *   edge (a slant-pocket opening), caught in the side seam at assembly.
 */
export function pantsAuxPieces(measured: MeasuredLegSeams): Piece[] {
  const frontWaist = measured.frontWaistCm;
  const backWaist = measured.backWaistCm;

  // --- Waistband: bottom-edge quarters laid out [F][B][B][F] ---------------
  const bandLength = frontWaist * 2 + backWaist * 2;
  const bandOutline = [
    moveTo(vec2(0, 0)),
    lineTo(vec2(frontWaist, 0)),
    lineTo(vec2(frontWaist + backWaist, 0)),
    lineTo(vec2(frontWaist + backWaist + backWaist, 0)),
    lineTo(vec2(bandLength, 0)),
    lineTo(vec2(bandLength, WAISTBAND_DEPTH_CM)),
    lineTo(vec2(0, WAISTBAND_DEPTH_CM)),
    closePath(),
  ];
  // Centre-back notch on the bottom edge at the band's midpoint.
  const bandMarks = [
    ...horizontalGrainMarks(
      bandLength / 2,
      WAISTBAND_DEPTH_CM / 2,
      bandLength / 4 * 0.7,
    ),
    moveTo(vec2(bandLength / 2, 0.4)),
    lineTo(vec2(bandLength / 2, 1.6)),
  ];

  // --- Fly shield ----------------------------------------------------------
  const attachLength = measured.frontFlyEdgeCm;
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
  const mouth = frontWaist * POCKET_MOUTH_PER_FRONT_WAIST;
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
        placement: vec2(bandLength / 2, WAISTBAND_DEPTH_CM / 2),
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

/** The redrafted starter: pieces plus the assembly resolved from their geometry. */
export interface RedraftedPants {
  readonly pieces: readonly Piece[];
  /** Seam chains resolved per draft — rebuilt on every redraft. */
  readonly assembly: readonly SeamStep[];
}

/**
 * The full starter piece set at the given measurements — adapter legs plus
 * measured-sized auxiliaries — with the seam steps resolved from the fresh
 * draft's geometry. This is the unit the starter project and the
 * measurements panel's live redraft both consume, so a redraft never leaves
 * stale chain indices behind (fixed indices were the UX-15 bug's root
 * cause: Titan's outline topology shifts across the parameter range).
 */
export function redraftPantsStarter(
  measurements: PantMeasurements,
): RedraftedPants {
  const legs = redraftPants(measurements);
  const legPair = { front: legs[0]!, back: legs[1]! };
  const measured = measureLegSeams(legPair.front, legPair.back);
  // The band's bottom edge quarters run [F][B][B][F] (see pantsAuxPieces),
  // so the front waist joins quarter 0 and the back waist quarter 1.
  const assembly = pantsSeamSteps(
    legPair,
    {
      front: { pieceId: 'waistband', startVertex: 0, edgeCount: 1 },
      back: { pieceId: 'waistband', startVertex: 1, edgeCount: 1 },
    },
    RISE_SEAM_EASE,
  );
  return {
    pieces: [...legs, ...pantsAuxPieces(measured)],
    assembly,
  };
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

/**
 * Named edges of the waistband outline (bottom edge split at the quarter
 * points; the centre back sits at the midpoint, where quarters 1 and 2 meet).
 * Structural constants of the hand-authored band — its outline is fixed
 * regardless of the measurements; only the quarter lengths change.
 */
export const WAISTBAND_CHAINS = {
  /** Bottom-left quarter — the front's waist joins here. */
  front: {
    pieceId: 'waistband',
    startVertex: 0,
    edgeCount: 1,
  } satisfies EdgeChain,
  /** Second quarter — the back's waist joins here. */
  back: {
    pieceId: 'waistband',
    startVertex: 1,
    edgeCount: 1,
  } satisfies EdgeChain,
};

export const PANTS_LEARN_CARD =
  "What you'll learn: pants put curves and fit stakes on everything the notebook " +
  'holder taught. Every piece carries a grainline — match it to the selvedge ' +
  'before cutting. You’ll stay-stitch the crotch curves so they hold their shape, ' +
  'ease the seat seam, catch the pocket bags in the side seams, and finish with ' +
  'the waistband so the notches line up. Fit the rise first, then close the long ' +
  'seams — the build order is the lesson.';

/** Indigo twill — the classic first-trousers fabric. */
const PANTS_FABRIC = {
  weave: 'twill',
  weaveScale: 0.12,
  color: '#3e5175',
  weight: 400,
} as const;

let cachedStarter: StarterProject | null = null;

/**
 * The pants starter, validated through createStarterProject (which
 * re-validates pieces, seam-chain bounds, and order monotonicity). Drafted
 * lazily and cached: the Titan draft costs ~40 ms and several test files
 * import this module.
 */
export function pantsStarter(): StarterProject {
  if (cachedStarter === null) {
    const m = TITAN_PANTS_TEMPLATE;
    const drafted = redraftPantsStarter(m);
    cachedStarter = createStarterProject({
      id: 'starter-pants',
      name: 'Pants',
      measurements: {
        waist: m.waistCm,
        hip: m.hipCm,
        inseam: m.inseamCm,
        rise: m.risePct,
        seatEase: m.easePct,
        waistEase: m.waistEasePct,
        kneeEase: m.kneeEasePct,
        crotchDrop: m.crotchDropPct,
      },
      fabric: PANTS_FABRIC,
      pieces: drafted.pieces,
      assembly: drafted.assembly,
      learnCard: PANTS_LEARN_CARD,
    });
  }
  return cachedStarter;
}
