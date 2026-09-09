/**
 * Walkthrough motion spec (UX-01, resolves PRD open item A3).
 *
 * The seam walkthrough must read as a continuous, reversible fold — never a
 * snap. This module is the single home of the motion policy: durations per
 * seam type and direction, the easing curve, the reduced-motion contract,
 * and the camera framing math that pre-frames the seam about to fold. Full
 * rationale lives in docs/motion-spec.md; the values here are the spec.
 *
 * Everything exported is pure and jsdom-testable: the assembly controls
 * drive their slider tween with these helpers (through an injectable frame
 * scheduler), and the assembly view drives its camera glide with them
 * inside the existing render loop. The pose function itself
 * (evaluateAssemblyPose) stays pure and untouched — motion is a timeline
 * concern, never a pose concern.
 */
import { Box3, Sphere, Vector3 } from 'three';
import { evaluateAssemblyPose } from '../engine/assembly';
import type { AssemblyPlan } from '../engine/assembly';

// --- The spec (docs/motion-spec.md) ---------------------------------------

/**
 * Fold durations in milliseconds. A fold is a rigid 180° swing, so duration
 * is set by readability, not distance: straight seams fold fast and clean;
 * curved seams fold about their endpoint chord, where the correspondence is
 * harder to follow, and get a more deliberate pace. Reverse (Previous) runs
 * quicker than forward everywhere — undo should feel like an undo.
 */
export const FOLD_MS = {
  straightForward: 700,
  straightReverse: 550,
  curvedForward: 900,
  curvedReverse: 700,
} as const;

/**
 * The camera pre-frame glide runs at this fraction of the fold's duration,
 * so the camera settles before the fold's fast middle and the second half
 * of every fold plays fully framed.
 */
export const CAMERA_LEAD_FACTOR = 0.6;

/**
 * Fit margin on the swept-volume bounding sphere: the frame keeps 20% air
 * around the fold so the swinging piece never touches the viewport edge.
 */
export const CAMERA_MARGIN = 1.2;

/**
 * A seam is curved when some point of its chain deviates from the
 * endpoint line by more than this many centimetres (well under the 1 cm
 * seam allowance, well over rasterizer noise).
 */
export const CURVE_TOLERANCE_CM = 0.5;

/** Fold-sweep samples for the framing volume: a 180° swing bounded at eighths. */
const SWEEP_SAMPLES: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

// --- Time + easing ----------------------------------------------------------

/** Injectable clock + frame source, so tests can pump animation frames. */
export interface FrameScheduler {
  nowMs(): number;
  nextFrame(callback: (nowMs: number) => void): void;
}

/** Production scheduler: requestAnimationFrame + performance.now. */
export const rafFrameScheduler: FrameScheduler = {
  nowMs: () => performance.now(),
  nextFrame: (callback) => {
    requestAnimationFrame(() => callback(performance.now()));
  },
};

/**
 * Symmetric ease-in-out cubic: starts at rest, accelerates, lands at rest.
 * A fold is a physical swing — the piece must not launch off the mat (the
 * design system's --ease starts fast, right for chrome, wrong for fabric),
 * and it must not drift into the seam. f(0)=0, f(1)=1, f(0.5)=0.5.
 */
export function easeInOutCubic(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Eased progress in [0, 1] for an animation of durationMs after elapsedMs. */
export function easedProgress01(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return easeInOutCubic(elapsedMs / durationMs);
}

/** Fold duration for a seam: by direction and straight/curved type. */
export function foldDurationMs(forward: boolean, curved: boolean): number {
  if (curved) return forward ? FOLD_MS.curvedForward : FOLD_MS.curvedReverse;
  return forward ? FOLD_MS.straightForward : FOLD_MS.straightReverse;
}

/** Camera pre-frame duration for a fold of foldMs (arrives before mid-fold). */
export function cameraDurationMs(foldMs: number): number {
  return foldMs * CAMERA_LEAD_FACTOR;
}

/**
 * Reduced-motion contract (UX-01): walkthrough controls land instantly on
 * the legible boundary frame — full flat or full folded, never a tween
 * through mid-fold limbo. Manual scrubbing stays available; the media query
 * limits motion the system plays, not control the user drives.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// --- Seam classification ---------------------------------------------------

/**
 * Seam type from geometry: a chain is curved when any intermediate sample
 * bows away from the endpoint line. All v1 starters are straight; curved
 * chains fold about their endpoint chord (see the assembly engine), which
 * is why they get their own duration row.
 */
export function seamIsCurved(chainWorld: readonly Vector3[]): boolean {
  if (chainWorld.length < 3) return false;
  const start = chainWorld[0];
  const span = chainWorld[chainWorld.length - 1].clone().sub(start);
  const length = span.length();
  if (length < 1e-9) return false;
  span.divideScalar(length);
  for (let i = 1; i < chainWorld.length - 1; i++) {
    const offset = chainWorld[i].clone().sub(start);
    const along = offset.dot(span);
    const deviation = offset.add(span.clone().multiplyScalar(-along)).length();
    if (deviation > CURVE_TOLERANCE_CM) return true;
  }
  return false;
}

// --- Camera framing ---------------------------------------------------------

/** The default viewing direction (the view's opening camera, normalized). */
const DEFAULT_VIEW_DIRECTION = new Vector3(10, 95, 140).normalize();

export interface SeamFrameInput {
  readonly plan: AssemblyPlan;
  readonly stepIndex: number;
  /** Piece-local bounding boxes, keyed by piece id (the view's geometries). */
  readonly localBoxes: ReadonlyMap<string, Box3>;
  /** Vertical field of view in radians. */
  readonly fovYRad: number;
  /** Viewport aspect ratio (width / height). */
  readonly aspect: number;
  /** Current camera placement — only its direction is preserved. */
  readonly cameraPosition: Vector3;
  readonly cameraTarget: Vector3;
  readonly minDistance: number;
  readonly maxDistance: number;
}

export interface SeamFrame {
  /** Orbit target: the centre of the fold's swept volume. */
  readonly target: Vector3;
  /** Camera position on the preserved viewing direction, fit to the frame. */
  readonly position: Vector3;
}

/**
 * Frame for the seam about to fold: the bounding sphere of everything that
 * moves during the step (the mover group sampled through its sweep) plus
 * the anchor chain, fit to the narrower of the vertical/horizontal fields
 * of view with the spec margin. The camera keeps the user's viewing angle —
 * only distance and target move — so pre-framing never yanks the viewpoint.
 *
 * Returns null when the step does not exist or nothing sweeps (no framing
 * possible), so callers can keep the camera as the user left it.
 */
export function computeSeamFrame(input: SeamFrameInput): SeamFrame | null {
  const step = input.plan.steps[input.stepIndex];
  if (!step) return null;

  const box = new Box3();
  const corner = new Vector3();
  for (const sampleT of SWEEP_SAMPLES) {
    const poses = evaluateAssemblyPose(input.plan, input.stepIndex, sampleT);
    for (const id of step.moverGroup) {
      const local = input.localBoxes.get(id);
      const pose = poses.get(id);
      if (!local || !pose) continue;
      for (let i = 0; i < 8; i++) {
        corner.set(
          (i & 1 ? local.max.x : local.min.x),
          (i & 2 ? local.max.y : local.min.y),
          (i & 4 ? local.max.z : local.min.z),
        );
        box.expandByPoint(corner.applyMatrix4(pose));
      }
    }
  }
  for (const point of step.anchorChainWorld) box.expandByPoint(point);
  if (box.isEmpty()) return null;

  const sphere = box.getBoundingSphere(new Sphere());
  const halfFovY = input.fovYRad / 2;
  const halfFovX = Math.atan(Math.tan(halfFovY) * input.aspect);
  const halfFov = Math.min(halfFovY, halfFovX);
  const distance = clamp(
    (sphere.radius * CAMERA_MARGIN) / Math.sin(halfFov),
    input.minDistance,
    input.maxDistance,
  );

  const direction = input.cameraPosition.clone().sub(input.cameraTarget);
  if (direction.lengthSq() < 1e-12) direction.copy(DEFAULT_VIEW_DIRECTION);
  direction.normalize();

  return {
    target: sphere.center.clone(),
    position: sphere.center.clone().addScaledVector(direction, distance),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
