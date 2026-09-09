/**
 * Dynamic seam-chain resolution for the pants starter (UX-15): the legs'
 * seam chains are read off the actual draft geometry at draft time instead
 * of fixed vertex indices.
 *
 * Why: Titan's leg-outline topology shifts across the measurement panel's
 * range — at several extremes the draft renders an eighth vertex that
 * splits the outseam at hip level — so a fixed startVertex index can point
 * at the wrong edge after a redraft and the assembly gate mis-measures the
 * seam. Landmarks located by geometry are invariant under that topology
 * class:
 *
 * - hem vertices: the two lowest outline vertices (Titan's floor points);
 * - waist vertices: the two highest;
 * - fork: the deepest remaining vertex — on any sewable draft the crotch
 *   point is the lowest interior point. The panel's extreme corners can
 *   break that (an eased hip bulge or an inverted waist/hip ratio puts a
 *   non-fork vertex deepest); the resolver then throws and the app
 *   narrates the failure — those drafts are not sewable.
 *
 * Walking the outline cycle between the landmarks yields the seam arcs —
 * waist, outseam (one or more edges), hem, inseam, and the rise from the
 * fork back to the waist. Every step is validated: when the draft's
 * geometry does not have exactly the expected landmark structure the
 * resolver throws instead of guessing, because a silently wrong chain
 * would mis-seam (the same fail-loud contract as the engine's gates).
 *
 * Chains index the piece outline's raw vertex cycle (the closing Z runs
 * the last vertex back to vertex 0 — see src/model/path.ts); a trailing
 * vertex that coincides with vertex 0 (Titan closes every part on its
 * start point) is dropped from the analysis, and the runs it yields index
 * the raw cycle identically because the duplicate is trailing.
 */
import type { EdgeChain, Piece, SeamStep } from '../model';
import { createSeamStep } from '../model';
import { chainMeasuredLength } from '../engine/assembly';
import { outlineVertices } from './pantsGeometry';

/** Thrown when a leg outline's geometry has no unambiguous seam anatomy. */
export class SeamResolutionError extends Error {}

/** Coincident-vertex tolerance (cm) when dropping a trailing duplicate. */
const COINCIDENT_CM = 1e-6;

/** A run of outline edges: edges startVertex … startVertex + edgeCount - 1. */
interface EdgeRun {
  readonly startVertex: number;
  readonly edgeCount: number;
}

/** The legs' seam chains, resolved from the draft geometry. */
export interface LegChains {
  /** Waist edge between the two waist corners. */
  readonly waist: EdgeChain;
  /** Side seam, waist corner down to the hem (one or more edges). */
  readonly outseam: EdgeChain;
  /** Hem edge between the two floor corners. */
  readonly hem: EdgeChain;
  /** Inner-leg seam, hem corner up to the fork (one or more edges). */
  readonly inseam: EdgeChain;
  /** Crotch seam, fork up to the waist corner (one or more edges). */
  readonly rise: EdgeChain;
}

/** The front leg's chains, plus the fly-extension edge the shield joins. */
export interface FrontChains extends LegChains {
  /**
   * The crotch-curve edge (fork → where the fly placket begins) — the
   * front's rise arc must be exactly the two-edge crotch + CF anatomy for
   * this to be well-defined, and the resolver enforces that.
   */
  readonly flyExtension: EdgeChain;
}

/**
 * Measured seam-edge lengths (cm, sampled exactly as the assembly engine
 * measures them) that aux pieces must be sized from, so their attach edges
 * track the live draft instead of a closed-form approximation of it.
 */
export interface MeasuredLegSeams {
  readonly frontWaistCm: number;
  readonly backWaistCm: number;
  /** The front's crotch-curve edge — the fly shield's attach edge. */
  readonly frontFlyEdgeCm: number;
}

function fail(reason: string): never {
  throw new SeamResolutionError(`pants leg anatomy: ${reason}`);
}

/** Forward arc from vertex `from` to vertex `to` along the vertex cycle. */
function runBetween(from: number, to: number, vertexCount: number): EdgeRun {
  return { startVertex: from, edgeCount: (to - from + vertexCount) % vertexCount };
}

/**
 * Classify the outline arcs between consecutive landmarks for one fork
 * candidate. Each seam class (waist, hem, outseam, inseam, rise, crotch)
 * must appear at most once for the anatomy to be clean; a repeated class
 * means the candidate is not the fork and the outline would not split
 * into five seam arcs — reported as `null` so the caller can try the
 * next candidate instead of committing to a wrong anatomy.
 */
function buildLandmarkArcs(
  hemIdx: readonly number[],
  waistIdx: readonly number[],
  fork: number,
  count: number,
): Map<string, EdgeRun> | null {
  const roleOf = (index: number): 'hem' | 'waist' | 'fork' =>
    hemIdx.includes(index) ? 'hem' : waistIdx.includes(index) ? 'waist' : 'fork';
  const landmarks = [...hemIdx, ...waistIdx, fork].sort((a, b) => a - b);

  const arcs = new Map<string, EdgeRun>();
  for (let i = 0; i < landmarks.length; i++) {
    const from = landmarks[i]!;
    const to = landmarks[(i + 1) % landmarks.length]!;
    const roles = [roleOf(from), roleOf(to)].sort().join('+');
    if (arcs.has(roles)) return null;
    arcs.set(roles, runBetween(from, to, count));
  }
  return arcs;
}

/**
 * Resolve one leg's seam chains from its outline. Pure; throws
 * SeamResolutionError when no landmark structure yields a clean leg
 * anatomy (exactly two hem vertices, two waist vertices, and a fork
 * candidate whose arcs cover the outline once per seam class).
 *
 * `requiredRiseEdges` — when set (the front's 2-edge crotch + fly rise),
 * a candidate whose rise arc does not have that many edges is rejected
 * during the search instead of after it. The front needs this: at the hip
 * maximum the hip-split vertex is class-valid as a fork (its misread arcs
 * remain unique) and only the rise anatomy distinguishes it from the
 * crotch.
 */
export function resolveLegChains(
  piece: Piece,
  requiredRiseEdges?: number,
): LegChains {
  const raw = outlineVertices(piece.outline);
  if (raw.length < 6) {
    fail(`"${piece.name}" has ${raw.length} vertices — too few for a leg`);
  }
  // Titan closes each part on its start point; drop the trailing duplicate
  // so the cycle carries each corner once. (Runs on the deduped cycle
  // index the raw cycle identically — the duplicate is trailing.)
  const last = raw[raw.length - 1]!;
  const first = raw[0]!;
  const vertices =
    Math.abs(last.x - first.x) < COINCIDENT_CM &&
    Math.abs(last.y - first.y) < COINCIDENT_CM
      ? raw.slice(0, -1)
      : raw;
  const count = vertices.length;

  // Landmarks by rank, not by tolerance bands: the waist is a diagonal (the
  // side corner sits below the centre-front corner), and the two hem
  // corners tie on Titan's floor. Sorts make both cases robust.
  const byY = vertices
    .map((v, i) => ({ i, y: v.y }))
    .sort((a, b) => a.y - b.y);
  const hemIdx = [byY[0]!.i, byY[1]!.i];
  const waistIdx = [byY[count - 2]!.i, byY[count - 1]!.i];

  // The fork: try the classic candidates in order and accept the first
  // whose landmark structure validates — 1) the deepest remaining vertex
  // (on any sewable draft the crotch point is the lowest interior point),
  // then 2) the vertex furthest from the waist line's centre in x (the
  // crotch extension pokes past the centre-front in either mirror
  // orientation; the back leg is drafted mirrored). One rule is not
  // enough: at the hip maximum the hip-split vertex sits deeper than the
  // crotch, and with heavy ease an outseam bulge can swing further from
  // the waist centre than the crotch reaches. A draft where neither
  // candidate yields a clean anatomy is not sewable — the resolver throws
  // and the app narrates the failure with the last valid draft intact.
  const waistCentreX =
    (vertices[waistIdx[0]!]!.x + vertices[waistIdx[1]!]!.x) / 2;
  let deepestIdx = -1;
  let deepest = Infinity;
  let extremalIdx = -1;
  let reach = -1;
  for (let i = 0; i < count; i++) {
    if (hemIdx.includes(i) || waistIdx.includes(i)) continue;
    if (vertices[i]!.y < deepest) {
      deepest = vertices[i]!.y;
      deepestIdx = i;
    }
    const reachOf = Math.abs(vertices[i]!.x - waistCentreX);
    if (reachOf > reach) {
      reach = reachOf;
      extremalIdx = i;
    }
  }
  if (deepestIdx === -1) fail(`"${piece.name}" has no fork candidate`);
  const forkCandidates =
    extremalIdx === -1 || extremalIdx === deepestIdx
      ? [deepestIdx]
      : [deepestIdx, extremalIdx];

  let arcs: Map<string, EdgeRun> | null = null;
  for (const fork of forkCandidates) {
    const built = buildLandmarkArcs(hemIdx, waistIdx, fork, count);
    if (!built) continue;
    if (requiredRiseEdges !== undefined) {
      const rise = built.get('fork+waist');
      if (!rise || rise.edgeCount !== requiredRiseEdges) continue;
    }
    arcs = built;
    break;
  }
  if (!arcs) {
    fail(
      requiredRiseEdges === undefined
        ? `"${piece.name}" has no fork candidate with a clean leg anatomy`
        : `"${piece.name}" has no fork candidate with the ${requiredRiseEdges}-edge crotch + fly rise anatomy`,
    );
  }

  const arc = (roles: string): EdgeRun => {
    const found = arcs!.get(roles);
    if (!found) fail(`"${piece.name}" has no ${roles} arc`);
    return found;
  };

  return {
    waist: { ...arc('waist+waist'), pieceId: piece.id },
    hem: { ...arc('hem+hem'), pieceId: piece.id },
    outseam: { ...arc('hem+waist'), pieceId: piece.id },
    inseam: { ...arc('fork+hem'), pieceId: piece.id },
    rise: { ...arc('fork+waist'), pieceId: piece.id },
  };
}

/** The front leg's chains: the resolver enforces the 2-edge rise anatomy. */
export function resolveFrontChains(front: Piece): FrontChains {
  const chains = resolveLegChains(front, 2);
  return {
    ...chains,
    flyExtension: {
      pieceId: front.id,
      startVertex: chains.rise.startVertex,
      edgeCount: 1,
    },
  };
}

/** Sample the seam-edge lengths the aux pieces are sized from. */
export function measureLegSeams(front: Piece, back: Piece): MeasuredLegSeams {
  const frontChains = resolveFrontChains(front);
  const backChains = resolveLegChains(back);
  return {
    frontWaistCm: chainMeasuredLength(front, frontChains.waist),
    backWaistCm: chainMeasuredLength(back, backChains.waist),
    frontFlyEdgeCm: chainMeasuredLength(front, frontChains.flyExtension),
  };
}

/** The two drafted legs, front first — the order redraftPants returns. */
export interface LegPair {
  readonly front: Piece;
  readonly back: Piece;
}

/**
 * The pants starter's six seam steps, in sewing order, with every chain
 * resolved from the current draft's geometry. Fly first (it is built on
 * the front before any joins), then the rise, the long seams with the
 * pocket bags caught in the outseam, and the waistband last so the
 * notches line up. After the rise folds the front onto the back, the
 * side seams and inseam sew in place on the already-folded pair (the
 * planner keeps the steps for narration but moves nothing); the
 * waistband is the mover for both of its steps — folding the joined
 * legs onto the band would drag the whole assembly. The pocket bag has
 * no step of its own — it is caught in the outseam; EdgeChain
 * granularity is whole outline edges, and the block drafts no separate
 * pocket-mouth edge to reference.
 *
 * `riseEase` declares the rise seam's eased measured-length tolerance
 * (see SeamStep.ease): Titan fits the front crotch seam and the back
 * cross seam to different targets, so the two rise traces legitimately
 * differ beyond the default gate — the step's note carries the same
 * instruction ("ease the front gently around the seat").
 */
export function pantsSeamSteps(
  legs: LegPair,
  waistbandChains: { readonly front: EdgeChain; readonly back: EdgeChain },
  riseEase: number,
): SeamStep[] {
  const front = resolveFrontChains(legs.front);
  const back = resolveLegChains(legs.back);
  const frontId = legs.front.id;
  const backId = legs.back.id;

  // The fly shield's attach chain: its long top edge (vertex 0 → 1).
  const shieldAttach: EdgeChain = { pieceId: 'fly-shield', startVertex: 0, edgeCount: 1 };

  return [
    createSeamStep({
      pieces: ['fly-shield', frontId],
      edges: [shieldAttach, front.flyExtension],
      order: 1,
      name: 'Fly shield seam',
      note:
        'Baste the fly shield behind the front’s fly extension first — it backs ' +
        'the buttonhole placket and keeps the fly from gaping.',
    }),
    createSeamStep({
      pieces: [frontId, backId],
      edges: [front.rise, back.rise],
      order: 2,
      name: 'Rise seam',
      ease: riseEase,
      note:
        'Stay-stitch both crotch curves before joining — this rise seam sets the ' +
        'fit, and a stretched curve here is the most common beginner fault. Ease ' +
        'the front gently around the seat rather than stretching it flat.',
    }),
    createSeamStep({
      pieces: [frontId, backId],
      edges: [front.outseam, back.outseam],
      order: 3,
      name: 'Side seams',
      note:
        'Sew the side seams next and the legs become tubes. The pocket bags are ' +
        'caught in this seam — their notches mark where the mouth opens.',
    }),
    createSeamStep({
      pieces: [frontId, backId],
      edges: [front.inseam, back.inseam],
      order: 4,
      name: 'Inseam',
      note:
        'The inseam curves around the inner leg; ease it to the back piece ' +
        'rather than stretching it flat.',
    }),
    createSeamStep({
      // The band is the mover: folding the already-placed back onto it
      // would drag the joined legs across the table.
      pieces: ['waistband', frontId],
      edges: [waistbandChains.front, front.waist],
      order: 5,
      name: 'Waistband front',
      note:
        'Right sides together along the front waist. The band’s grainline runs ' +
        'parallel to the waist so it stays firm and the notches meet.',
    }),
    createSeamStep({
      // Sew-in-place: the band already lies on the front waist, and its
      // back quarter lines up with the back waist of the joined pair.
      pieces: ['waistband', backId],
      edges: [waistbandChains.back, back.waist],
      order: 6,
      name: 'Waistband back',
      note:
        'Join the back half the same way — centre the band’s centre-back notch ' +
        'at the centre back before stitching.',
    }),
  ];
}
