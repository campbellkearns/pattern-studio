/**
 * Assembly engine: ordered fold-around-seam transforms (blueprint F5, D1).
 *
 * Piece-first and rigid by decision: each seam step folds one piece (the
 * mover) around the anchor's seam edge-chain until it lies on the anchor —
 * deterministic transforms, no physics. The motion is exactly how flat
 * fabric is prepared and sewn:
 *
 * - t = 0 (flat): the mover lies face-down beside the anchor, its seam
 *   chain on the anchor's chain, body extending away — pieces stacked
 *   right-sides-together, ready to sew.
 * - t = 1 (folded): the mover has swung 180° about the hinge line and lies
 *   face-up on the anchor, chain on chain.
 * - Scrubbing t rotates the mover about the hinge between the two.
 *
 * The hinge is the straight line through the anchor chain's endpoint pair.
 * Straight chains (every v1 starter) lie on it exactly; curved chains fold
 * about their endpoint chord, with the correspondence (which chain end
 * meets which) chosen by scoring, weighted with chain midpoints so curved
 * seams pick the alignment where the curves actually meet.
 *
 * World frame: 1 unit = 1 cm, mat plane y = 0, +z toward the viewer. Piece
 * outlines are domain XY (y-up, centimetres) embedded as (x, y, 0); the
 * base flat pose rotates that plane onto the mat the same way the viewport
 * does (rotateX(-π/2)), so engine poses feed straight into three.js.
 *
 * v1 boundaries, fail-loud rather than fold-wrong:
 * - Each piece folds at most once as a mover (anchors may already be
 *   folded and ride their group). Double-mover orders are rejected.
 * - Chains must match in measured length within SEAM_LENGTH_TOLERANCE
 *   (real seams are eased; a strict equality gate would reject
 *   legitimate drafts — see SeamStep's model docs).
 * - Disconnected assemblies (a second anchor group) place their root on
 *   the parking row rather than failing.
 */

import { Matrix4, Vector3 } from 'three';
import type { EdgeChain, Piece, Project, SeamStep } from '../model';
import { distance, vec2 } from '../model';
import type { Vec2 } from '../model';

/**
 * Relative seam-length tolerance: the two chains of a seam may differ by
 * up to this fraction of the longer chain (5% covers easing without
 * accepting authoring mistakes).
 */
export const SEAM_LENGTH_TOLERANCE = 0.05;

/** A full fold: flat (angle π from folded) → folded (angle 0). */
const FOLD_ANGLE_RAD = Math.PI;

/** Curve sampling density, matching the marks renderer (de Casteljau). */
const QUAD_SEGMENTS = 8;
const CUBIC_SEGMENTS = 12;

export interface Hinge {
  /** A point on the hinge line, in world centimetres. */
  readonly origin: Vector3;
  /** Unit direction of the hinge line, in world space. */
  readonly direction: Vector3;
}

export interface AssemblyStepPlan {
  /** The seam being folded, in build order. */
  readonly step: SeamStep;
  /**
   * Pieces that rotate with the mover: the mover itself plus anything
   * already folded onto it (an earlier mover's group rides along).
   */
  readonly moverGroup: readonly string[];
  readonly hinge: Hinge;
  /**
   * Sign of the scrub rotation about the hinge, chosen so the fold sweeps
   * up out of the mat rather than through it.
   */
  readonly sweepSign: 1 | -1;
  /**
   * The anchor's chain sampled in world space at this step's start — the
   * view draws this as the highlighted seam line.
   */
  readonly anchorChainWorld: readonly Vector3[];
}

export interface AssemblyPlan {
  readonly steps: readonly AssemblyStepPlan[];
  /**
   * Pose of every piece before any fold: movers lie open-book flat beside
   * their anchor; pure anchors sit centred on the origin; pieces with no
   * seam are parked in a row (see PlanOptions.parkOrigin).
   */
  readonly basePoses: ReadonlyMap<string, Matrix4>;
}

export interface PlanOptions {
  /**
   * Where the parking row starts, in world centimetres (the view passes
   * its mat's front edge; default is clear of the default camera framing).
   */
  readonly parkOrigin?: { readonly xCm: number; readonly zCm: number };
}

// --- Outline geometry (path stream → vertices and polylines) --------------

/**
 * Anchored vertices of a piece outline, in order. M/L/C/Q each contribute
 * their endpoint; the closed outline's edge i runs vertex i → i+1, with the
 * final edge wrapping back to vertex 0 (the Z close is a straight segment).
 */
export function outlineVertices(piece: Piece): Vec2[] {
  const vertices: Vec2[] = [];
  for (const cmd of piece.outline) {
    if (cmd.type !== 'Z') vertices.push(cmd.point);
  }
  return vertices;
}

function vertexAt(vertices: readonly Vec2[], index: number): Vec2 {
  return vertices[index % vertices.length];
}

/**
 * Sample the chain's edges into a polyline (centimetres, piece-local XY).
 * Q edges take 8 segments and C edges 12, matching the marks renderer so
 * measured lengths agree with what the view draws.
 */
export function chainPolyline(piece: Piece, chain: EdgeChain): Vec2[] {
  const vertices = outlineVertices(piece);
  const vertexCount = vertices.length;
  if (vertexCount === 0) {
    throw new Error(`piece "${piece.name}" has no outline vertices`);
  }
  if (chain.startVertex + chain.edgeCount > vertexCount) {
    throw new Error(
      `piece "${piece.name}": edge chain ${chain.startVertex}+${chain.edgeCount} runs past ${vertexCount} outline vertices`,
    );
  }

  const points: Vec2[] = [vertexAt(vertices, chain.startVertex)];
  for (let i = 0; i < chain.edgeCount; i++) {
    const edgeIndex = chain.startVertex + i;
    const from = vertexAt(vertices, edgeIndex);
    const to = vertexAt(vertices, edgeIndex + 1);
    // Edge i is drawn by outline command i+1; the wrapping edge (last
    // vertex → vertex 0) is the Z close: a straight segment.
    const cmd = edgeIndex < vertexCount - 1 ? piece.outline[edgeIndex + 1] : undefined;
    sampleEdge(from, to, cmd, points);
  }
  return points;
}

function sampleEdge(
  from: Vec2,
  to: Vec2,
  cmd: Piece['outline'][number] | undefined,
  points: Vec2[],
): void {
  if (!cmd || cmd.type === 'L') {
    points.push(to);
    return;
  }
  if (cmd.type === 'Q') {
    for (let s = 1; s <= QUAD_SEGMENTS; s++) {
      const t = s / QUAD_SEGMENTS;
      const u = 1 - t;
      points.push(
        vec2(
          u * u * from.x + 2 * u * t * cmd.control.x + t * t * to.x,
          u * u * from.y + 2 * u * t * cmd.control.y + t * t * to.y,
        ),
      );
    }
    return;
  }
  if (cmd.type === 'C') {
    for (let s = 1; s <= CUBIC_SEGMENTS; s++) {
      const t = s / CUBIC_SEGMENTS;
      const u = 1 - t;
      points.push(
        vec2(
          u * u * u * from.x +
            3 * u * u * t * cmd.control1.x +
            3 * u * t * t * cmd.control2.x +
            t * t * t * to.x,
          u * u * u * from.y +
            3 * u * u * t * cmd.control1.y +
            3 * u * t * t * cmd.control2.y +
            t * t * t * to.y,
        ),
      );
    }
    return;
  }
  throw new Error(`unexpected path command ${cmd.type} in edge chain`);
}

/** Measured length of the chain in centimetres (polyline length). */
export function chainMeasuredLength(piece: Piece, chain: EdgeChain): number {
  const polyline = chainPolyline(piece, chain);
  let length = 0;
  for (let i = 1; i < polyline.length; i++) {
    length += distance(polyline[i - 1], polyline[i]);
  }
  return length;
}

/** Bounding-box centre of the full outline (for placement, not layout). */
function pieceBBoxCentre(piece: Piece): Vec2 {
  const vertices = outlineVertices(piece);
  const closedChain: EdgeChain = {
    pieceId: piece.id,
    startVertex: 0,
    edgeCount: vertices.length,
  };
  const polyline = chainPolyline(piece, closedChain);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polyline) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return vec2((minX + maxX) / 2, (minY + maxY) / 2);
}

// --- Poses -----------------------------------------------------------------

/** Piece-local XY → mat plane: the same rotateX(-π/2) the viewport uses. */
function flatPoseCentredAt(centreWorldX: number, centreWorldZ: number, piece: Piece): Matrix4 {
  const centre = pieceBBoxCentre(piece);
  // Rotate the local plane onto the mat, then re-centre: R·T(-centre).
  const toOrigin = new Matrix4()
    .makeRotationX(-Math.PI / 2)
    .multiply(new Matrix4().makeTranslation(-centre.x, -centre.y, 0));
  return new Matrix4()
    .makeTranslation(centreWorldX, 0, centreWorldZ)
    .multiply(toOrigin);
}

function chainWorld(points: readonly Vec2[], pose: Matrix4): Vector3[] {
  return points.map((p) => new Vector3(p.x, p.y, 0).applyMatrix4(pose));
}

function hingeFromChain(chainWorldPoints: readonly Vector3[]): Hinge {
  const origin = chainWorldPoints[0].clone();
  const direction = chainWorldPoints[chainWorldPoints.length - 1]
    .clone()
    .sub(origin);
  if (direction.lengthSq() < 1e-12) {
    throw new Error('seam chain is degenerate: start and end coincide');
  }
  return { origin, direction: direction.normalize() };
}

/** Rotation about the hinge line (origin + unit direction) by angle. */
function rotationAbout(hinge: Hinge, angle: number): Matrix4 {
  const rot = new Matrix4().makeRotationAxis(hinge.direction, angle);
  const toOrigin = new Matrix4().makeTranslation(
    -hinge.origin.x,
    -hinge.origin.y,
    -hinge.origin.z,
  );
  const fromOrigin = new Matrix4().makeTranslation(
    hinge.origin.x,
    hinge.origin.y,
    hinge.origin.z,
  );
  return fromOrigin.multiply(rot).multiply(toOrigin);
}

/**
 * Rigid pose mapping the mover's chain onto the anchor's world chain,
 * mover printed face up against the anchor's plane (the folded state).
 * `reversed` swaps which chain endpoints meet.
 */
function foldedPoseCandidate(
  moverChainLocal: readonly Vector3[],
  anchorChainWorld: readonly Vector3[],
  anchorNormalWorld: Vector3,
  reversed: boolean,
): Matrix4 {
  const localStart = moverChainLocal[0];
  const localEnd = moverChainLocal[moverChainLocal.length - 1];
  const worldStart = (reversed
    ? anchorChainWorld[anchorChainWorld.length - 1]
    : anchorChainWorld[0]
  ).clone();
  const worldEnd = (reversed ? anchorChainWorld[0] : anchorChainWorld[anchorChainWorld.length - 1]).clone();

  const localU = localEnd.clone().sub(localStart).normalize();
  const worldU = worldEnd.clone().sub(worldStart).normalize();
  const localN = new Vector3(0, 0, 1); // piece-local plane normal
  const worldN = anchorNormalWorld.clone().normalize();

  const localFrame = new Matrix4().makeBasis(
    localU,
    new Vector3().crossVectors(localN, localU),
    localN,
  );
  const worldFrame = new Matrix4().makeBasis(
    worldU,
    new Vector3().crossVectors(worldN, worldU),
    worldN,
  );
  const rotation = worldFrame.multiply(localFrame.transpose());

  const rotatedStart = localStart.clone().applyMatrix4(rotation);
  const translation = worldStart.sub(rotatedStart);
  return new Matrix4()
    .makeTranslation(translation.x, translation.y, translation.z)
    .multiply(rotation);
}

interface ScoredFold {
  readonly folded: Matrix4;
  readonly hinge: Hinge;
  readonly score: number;
}

/**
 * Pick the folded pose: try both chain correspondences and keep the one
 * whose folded body lands closest to the anchor's body (midpoints of the
 * chains included, which disambiguates curved seams). Ties resolve to the
 * forward correspondence — deterministic for symmetric pieces.
 */
function scoreFold(
  moverChainLocal: readonly Vector3[],
  anchorChainWorld: readonly Vector3[],
  anchorPose: Matrix4,
  moverCentreLocal: Vector3,
  anchorCentreWorld: Vector3,
  hinge: Hinge,
): ScoredFold {
  const anchorNormalWorld = new Vector3(0, 0, 1)
    .applyMatrix4(anchorPose)
    .sub(new Vector3(0, 0, 0).applyMatrix4(anchorPose));

  const anchorChainMid = anchorChainWorld[Math.floor(anchorChainWorld.length / 2)].clone();

  let best: ScoredFold | null = null;
  for (const reversed of [false, true]) {
    const folded = foldedPoseCandidate(
      moverChainLocal,
      anchorChainWorld,
      anchorNormalWorld,
      reversed,
    );
    const foldedCentre = moverCentreLocal.clone().applyMatrix4(folded);
    const foldedMid = moverChainLocal[Math.floor(moverChainLocal.length / 2)]
      .clone()
      .applyMatrix4(folded);
    const score =
      foldedCentre.distanceTo(anchorCentreWorld) +
      foldedMid.distanceTo(anchorChainMid);
    if (best === null || score < best.score - 1e-9) {
      best = { folded, hinge, score };
    }
  }
  if (best === null) throw new Error('fold scoring failed: no candidates');
  return best;
}

/**
 * Sweep direction: the fold must lift the mover out of the mat, not swing
 * it through the mat. Compare mid-fold centroid heights for both signs.
 */
function pickSweepSign(
  flatPose: Matrix4,
  hinge: Hinge,
  moverCentreLocal: Vector3,
): 1 | -1 {
  const half = Math.PI / 2;
  const midPositive = moverCentreLocal
    .clone()
    .applyMatrix4(flatPose)
    .applyMatrix4(rotationAbout(hinge, half));
  const midNegative = moverCentreLocal
    .clone()
    .applyMatrix4(flatPose)
    .applyMatrix4(rotationAbout(hinge, -half));
  return midPositive.y >= midNegative.y ? 1 : -1;
}

// --- Planning ----------------------------------------------------------------

function unionRoot(roots: Map<string, string>, id: string): string {
  const parent = roots.get(id);
  if (parent === undefined) throw new Error(`piece "${id}" is untracked`);
  if (parent === id) return id;
  const root = unionRoot(roots, parent);
  roots.set(id, root);
  return root;
}

/**
 * Compute the full assembly plan for a project. Throws with a clear
 * message when the seam list cannot be folded as ordered (length mismatch,
 * anchor not yet placed, or a piece asked to fold twice).
 */
export function planAssembly(project: Project, options: PlanOptions = {}): AssemblyPlan {
  const parkOrigin = options.parkOrigin ?? { xCm: 0, zCm: 70 };
  const piecesById = new Map(project.pieces.map((piece) => [piece.id, piece]));

  const placed = new Map<string, Matrix4>();
  /** Pieces that have folded as a mover (anchors may still fold later). */
  const foldedAsMover = new Set<string>();
  const roots = new Map<string, string>();
  for (const piece of project.pieces) roots.set(piece.id, piece.id);

  const basePoses = new Map<string, Matrix4>();
  const moverFlatPose = new Map<string, Matrix4>();
  const stepPlans: AssemblyStepPlan[] = [];

  let rootAnchorsPlaced = 0;
  let parkCursorX = parkOrigin.xCm;

  const parkPiece = (piece: Piece): void => {
    const centre = pieceBBoxCentre(piece);
    // Simple shelf: advance the cursor by the piece's world width + gap.
    const halfWidth = Math.abs(centre.x) + 1; // conservative: centre-offset half-extent
    basePoses.set(
      piece.id,
      flatPoseCentredAt(parkCursorX + halfWidth, parkOrigin.zCm, piece),
    );
    parkCursorX += 2 * halfWidth + 6;
  };

  for (const step of project.assembly) {
    const [moverId, anchorId] = step.pieces;
    const mover = piecesById.get(moverId);
    const anchor = piecesById.get(anchorId);
    if (!mover || !anchor) {
      throw new Error(
        `seam step ${step.order} references a piece outside the project`,
      );
    }

    // Measured-length gate: eased seams tolerated, authoring errors not.
    const moverLength = chainMeasuredLength(mover, step.edges[0]);
    const anchorLength = chainMeasuredLength(anchor, step.edges[1]);
    const longest = Math.max(moverLength, anchorLength);
    if (
      !Number.isFinite(longest) ||
      longest <= 0 ||
      Math.abs(moverLength - anchorLength) > SEAM_LENGTH_TOLERANCE * longest
    ) {
      throw new Error(
        `seam step ${step.order}: seam chains differ in measured length by more than ${SEAM_LENGTH_TOLERANCE * 100}% — mover ${moverLength.toFixed(2)} cm vs anchor ${anchorLength.toFixed(2)} cm`,
      );
    }

    let anchorPose = placed.get(anchorId);
    if (!anchorPose) {
      // A new connected component roots here: the first assembly is
      // centred on the origin, later ones park in the row below.
      const rootX = rootAnchorsPlaced === 0 ? 0 : parkCursorX + 10;
      const rootZ = rootAnchorsPlaced === 0 ? 0 : parkOrigin.zCm;
      basePoses.set(anchorId, flatPoseCentredAt(rootX, rootZ, anchor));
      if (rootAnchorsPlaced > 0) {
        parkCursorX += 2 * (Math.abs(pieceBBoxCentre(anchor).x) + 1) + 6;
      }
      anchorPose = basePoses.get(anchorId)!;
      placed.set(anchorId, anchorPose);
      rootAnchorsPlaced += 1;
    }
    if (foldedAsMover.has(moverId)) {
      throw new Error(
        `seam step ${step.order}: piece "${mover.name}" already folded as a mover — v1 folds each piece as a mover at most once`,
      );
    }

    const moverChainLocal = chainPolyline(mover, step.edges[0]).map(
      (p) => new Vector3(p.x, p.y, 0),
    );
    const anchorChainWorldPoints = chainWorld(
      chainPolyline(anchor, step.edges[1]),
      anchorPose,
    );
    const hinge = hingeFromChain(anchorChainWorldPoints);

    const moverCentreLocal = new Vector3(
      pieceBBoxCentre(mover).x,
      pieceBBoxCentre(mover).y,
      0,
    );
    const anchorCentreWorld = new Vector3(
      pieceBBoxCentre(anchor).x,
      pieceBBoxCentre(anchor).y,
      0,
    ).applyMatrix4(anchorPose);

    const best = scoreFold(
      moverChainLocal,
      anchorChainWorldPoints,
      anchorPose,
      moverCentreLocal,
      anchorCentreWorld,
      hinge,
    );

    // Flat pose: the folded pose swung 180° about the hinge — the mover
    // lies face-down extending away, right-sides-together with the anchor.
    const flatPose = rotationAbout(hinge, FOLD_ANGLE_RAD).multiply(best.folded);

    const group: string[] = [];
    const moverRoot = unionRoot(roots, moverId);
    for (const id of roots.keys()) {
      if (unionRoot(roots, id) === moverRoot) group.push(id);
    }
    moverFlatPose.set(moverId, flatPose);
    foldedAsMover.add(moverId);
    placed.set(moverId, best.folded);
    roots.set(moverId, anchorId);

    stepPlans.push({
      step,
      moverGroup: group,
      hinge,
      sweepSign: pickSweepSign(flatPose, hinge, moverCentreLocal),
      anchorChainWorld: anchorChainWorldPoints,
    });
  }

  // Base poses: root anchors are set as components root (above); movers
  // lie flat beside their anchor; everything else parks.
  for (const step of project.assembly) {
    const mover = piecesById.get(step.pieces[0]);
    if (mover && moverFlatPose.has(mover.id)) {
      basePoses.set(mover.id, moverFlatPose.get(mover.id)!);
    }
  }
  for (const piece of project.pieces) {
    if (!basePoses.has(piece.id)) parkPiece(piece);
  }

  return { steps: stepPlans, basePoses };
}

// --- Evaluation --------------------------------------------------------------

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Poses of every piece at scrub state (stepIndex, t): steps before
 * stepIndex are fully folded; stepIndex's fold is at parameter t (0 = flat,
 * 1 = folded); later movers wait flat in their sewing position; pieces
 * with no seam stay parked. Pure and deterministic.
 */
export function evaluateAssemblyPose(
  plan: AssemblyPlan,
  stepIndex: number,
  t: number,
): Map<string, Matrix4> {
  const poses = new Map(plan.basePoses);
  const count = plan.steps.length;
  if (count === 0) return poses;

  const k = Math.min(Math.max(Math.trunc(stepIndex), 0), count - 1);
  const scrubbed = clamp01(t);

  for (let j = 0; j <= k; j++) {
    const stepPlan = plan.steps[j];
    const angle =
      j < k
        ? stepPlan.sweepSign * FOLD_ANGLE_RAD
        : stepPlan.sweepSign * scrubbed * FOLD_ANGLE_RAD;
    const rotation = rotationAbout(stepPlan.hinge, angle);
    for (const id of stepPlan.moverGroup) {
      const pose = poses.get(id);
      if (!pose) {
        throw new Error(`assembly plan has no base pose for piece "${id}"`);
      }
      poses.set(id, new Matrix4().multiplyMatrices(rotation, pose));
    }
  }
  return poses;
}
