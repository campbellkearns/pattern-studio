/**
 * Camera framing math for the cutting mat — pure and jsdom-safe, the same
 * contract as layout.ts and matSurface.ts: the viewports apply the results
 * to three.js objects, this module never touches a scene.
 *
 * Three concerns live here:
 * - fitCameraToWork: the animated pose that frames the work bounds (mat +
 *   paper) with margin — a bounding-sphere fit along the 3D preset's
 *   direction, so orbiting after the fit keeps the whole work in frame.
 * - shadow frustum sizing: the sun's ortho box follows the declared
 *   surfaces (and, for the assembly view, the posed pieces) so oversized
 *   layouts never clip their shadows.
 * - createFitController: the when-to-fit decision from the blueprint's
 *   States table — fit on load, re-fit on a redraft only when the overflow
 *   state flips, and never fight the user's hand; an explicit refit
 *   always fits and re-arms the auto-fit.
 *
 * All distances are world centimetres (1 unit = 1 cm).
 */

import {
  MAT_DEPTH_CM,
  MAT_WIDTH_CM,
  paperSurfaceExtentCm,
  workOverflowsMat,
  type BoundsCm,
} from './matSurface';

/**
 * Framing margin around the work, as a fraction of the work's larger
 * ground dimension, added on every side before fitting.
 */
export const FIT_MARGIN_FRACTION = 0.15;

/**
 * The fitted view looks along the 3D preset's direction — the same
 * three-quarter, over-the-shoulder angle the Top/3D buttons produce.
 */
export const FIT_VIEW_DIRECTION = { x: 95, y: 135, z: 150 } as const;

/**
 * Ground margin added beyond the surfaces (or posed pieces) the shadow
 * frustum must cover, so shadows near a surface edge stay un-clipped.
 */
export const SHADOW_MARGIN_CM = 20;

/** Defensive floor for the framed radius; real pieces are far larger. */
const MIN_FRAMED_RADIUS_CM = 1;

/** A pose delta below this is a tap, not a camera move (0.1 mm). */
const GESTURE_MOVE_EPS_CM = 0.01;

/** A world-space point, in centimetres. */
export interface PointCm {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Camera pose: eye position + orbit target, world centimetres. */
export interface CameraPoseCm {
  readonly position: PointCm;
  readonly target: PointCm;
}

/** Axis-aligned rectangle on the world XZ ground plane, in centimetres. */
export interface WorldRectCm {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Mat-space bounds (origin: the mat's top-left corner) → world XZ rect,
 * the same mapping placementToWorld uses for pieces: mat-down (+yCm) is
 * world −Z, and the centred mat spans x ∈ [−75, 75], z ∈ [−50, 50].
 */
export function workRectToWorldCm(work: BoundsCm): WorldRectCm {
  return {
    minX: work.minX - MAT_WIDTH_CM / 2,
    maxX: work.maxX - MAT_WIDTH_CM / 2,
    minZ: MAT_DEPTH_CM / 2 - work.maxY,
    maxZ: MAT_DEPTH_CM / 2 - work.minY,
  };
}

/**
 * The world XZ rect covering the declared surfaces for a project: the mat
 * plus the paper roll's rendered extent (a minimal apron when the work is
 * null or fits on the mat). Null work keeps the mat covered.
 */
export function surfacesWorldRectCm(work: BoundsCm | null): WorldRectCm {
  return unionRectsCm([
    workRectToWorldCm({
      minX: 0,
      minY: 0,
      maxX: MAT_WIDTH_CM,
      maxY: MAT_DEPTH_CM,
    }),
    workRectToWorldCm(paperSurfaceExtentCm(work)),
  ]);
}

export interface FitOptions {
  /** The perspective camera's vertical field of view, degrees (0, 180). */
  readonly fovDeg: number;
  /** Viewport width / height, > 0. */
  readonly aspect: number;
}

/**
 * The camera pose that frames the work bounds (ground plane, mat + paper)
 * with margin. The work's grown rect is enclosed by a ground circle, and
 * the circle is framed through the tighter of the vertical/horizontal
 * frustums — portrait tablets bind on width. Throws on a nonsense fov or
 * aspect rather than silently producing a NaN pose.
 */
export function fitCameraToWork(
  work: BoundsCm,
  options: FitOptions,
): CameraPoseCm {
  const { fovDeg, aspect } = options;
  if (!Number.isFinite(fovDeg) || fovDeg <= 0 || fovDeg >= 180) {
    throw new RangeError(`fov must be within (0, 180) degrees, got ${fovDeg}`);
  }
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new RangeError(`aspect must be positive, got ${aspect}`);
  }

  const base = workRectToWorldCm(work);
  const margin =
    FIT_MARGIN_FRACTION *
    Math.max(base.maxX - base.minX, base.maxZ - base.minZ);
  const rect = growRectCm(base, margin);

  const centreX = (rect.minX + rect.maxX) / 2;
  const centreZ = (rect.minZ + rect.maxZ) / 2;
  const radius = Math.max(
    MIN_FRAMED_RADIUS_CM,
    Math.hypot(rect.maxX - rect.minX, rect.maxZ - rect.minZ) / 2,
  );

  const fovV = (fovDeg * Math.PI) / 180;
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect);
  const distance = radius / Math.sin(Math.min(fovV, fovH) / 2);

  const direction = FIT_VIEW_DIRECTION;
  const length = Math.hypot(direction.x, direction.y, direction.z);

  return {
    position: {
      x: centreX + (direction.x / length) * distance,
      y: (direction.y / length) * distance,
      z: centreZ + (direction.z / length) * distance,
    },
    target: { x: centreX, y: 0, z: centreZ },
  };
}

/**
 * Half-extent of the sun's square ortho shadow frustum so the declared
 * surfaces (mat ∪ paper) plus a margin stay inside it. Square and sized
 * to the covered rect's half-diagonal: a directional light's frustum is
 * oriented along the light, so the tight bound is the diagonal, not
 * either side.
 */
export function shadowFrustumHalfExtentCm(work: BoundsCm | null): number {
  return shadowFrustumHalfExtentForRectsCm([surfacesWorldRectCm(work)]);
}

/**
 * Same sizing for caller-measured world rects — the assembly view poses
 * pieces around the mat and passes their flat footprint here alongside
 * the surfaces' rect.
 */
export function shadowFrustumHalfExtentForRectsCm(
  rects: readonly WorldRectCm[],
): number {
  const grown = growRectCm(unionRectsCm(rects), SHADOW_MARGIN_CM);
  return Math.hypot(grown.maxX - grown.minX, grown.maxZ - grown.minZ) / 2;
}

/** Ease-in-out cubic — the fit animation's pacing. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function growRectCm(rect: WorldRectCm, margin: number): WorldRectCm {
  return {
    minX: rect.minX - margin,
    maxX: rect.maxX + margin,
    minZ: rect.minZ - margin,
    maxZ: rect.maxZ + margin,
  };
}

function unionRectsCm(rects: readonly WorldRectCm[]): WorldRectCm {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.minX);
    maxX = Math.max(maxX, rect.maxX);
    minZ = Math.min(minZ, rect.minZ);
    maxZ = Math.max(maxZ, rect.maxZ);
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * Decides when the camera auto-fits (blueprint States table): fit on
 * load; on a redraft, only when the overflow state flips; and never
 * while the user's hand is driving — a real orbit/zoom mutes auto-fit
 * until an explicit refit re-arms it. Pure state, no three.js: the
 * viewport reports gestures and applies the decisions.
 */
export interface FitController {
  /**
   * The view loaded (or a starter swapped in): always fit, and re-arm
   * auto-fit. Returns false only when there is no work to frame.
   */
  load(work: BoundsCm | null): boolean;
  /**
   * The piece set was replaced (parametric redraft): fit only when the
   * overflow state flipped and the camera is still on autopilot.
   */
  workChanged(work: BoundsCm | null): boolean;
  /** The user grabbed the camera — an orbit/zoom/pan gesture began. */
  gestureBegan(pose: CameraPoseCm): void;
  /**
   * The gesture ended: a pose delta marks the camera as hand-driven; a
   * motionless tap (selection) does not.
   */
  gestureEnded(pose: CameraPoseCm): void;
  /** An explicit view command landed (preset) — the hand is driving. */
  commandApplied(): void;
  /** Explicit refit: always fits, and re-arms the auto-fit. */
  refit(): boolean;
}

export function createFitController(): FitController {
  let lastOverflow: boolean | null = null;
  let handDriven = false;
  let gestureStart: CameraPoseCm | null = null;

  return {
    load(work) {
      lastOverflow = workOverflowsMat(work);
      handDriven = false;
      return work !== null;
    },
    workChanged(work) {
      const overflow = workOverflowsMat(work);
      const changed = lastOverflow !== null && overflow !== lastOverflow;
      lastOverflow = overflow;
      return changed && !handDriven && work !== null;
    },
    gestureBegan(pose) {
      gestureStart = pose;
    },
    gestureEnded(pose) {
      if (gestureStart && poseMovedCm(gestureStart, pose)) {
        handDriven = true;
      }
      gestureStart = null;
    },
    commandApplied() {
      handDriven = true;
    },
    refit() {
      handDriven = false;
      return true;
    },
  };
}

function poseMovedCm(a: CameraPoseCm, b: CameraPoseCm): boolean {
  const moved = (p: PointCm, q: PointCm): boolean =>
    Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > GESTURE_MOVE_EPS_CM;
  return moved(a.position, b.position) || moved(a.target, b.target);
}
