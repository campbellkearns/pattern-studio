/**
 * UX-01 motion spec tests: the easing curve, the per-type/direction duration
 * table, seam classification from geometry, and the camera pre-frame fit.
 * The frame test asserts the property that matters — every point of the
 * fold's swept volume projects inside the viewport — rather than re-deriving
 * the formula.
 */
import { describe, expect, it } from 'vitest';
import { Box3, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import type { AssemblyPlan, AssemblyStepPlan } from '../engine/assembly';
import {
  CAMERA_LEAD_FACTOR,
  FOLD_MS,
  cameraDurationMs,
  computeSeamFrame,
  easeInOutCubic,
  easedProgress01,
  foldDurationMs,
  seamIsCurved,
} from './walkthroughMotion';
import type { SeamStep } from '../model';

/** A step plan whose mover swings 180° about the x-axis hinge at the origin. */
function swingPlan(): AssemblyPlan {
  const step: SeamStep = {
    pieces: ['m', 'anchor'],
    edges: [
      { pieceId: 'm', startVertex: 0, edgeCount: 1 },
      { pieceId: 'anchor', startVertex: 0, edgeCount: 1 },
    ],
    order: 1,
    note: 'test seam',
  };
  const stepPlan: AssemblyStepPlan = {
    step,
    moverGroup: ['m'],
    hinge: { origin: new Vector3(0, 0, 0), direction: new Vector3(1, 0, 0) },
    sweepSign: 1,
    anchorChainWorld: [new Vector3(-10, 0, 0), new Vector3(10, 0, 0)],
  };
  return {
    steps: [stepPlan],
    basePoses: new Map<string, Matrix4>([
      // The mover lies flat on the mat, 30 cm off the hinge (its local box
      // below is 20×20 and thin) — the fold sweeps it through a half-circle.
      ['m', new Matrix4().makeTranslation(0, 0, -30)],
      ['anchor', new Matrix4()],
    ]),
  };
}

/** Thin 20×20 plate centred on the local origin. */
const MOVER_BOX = new Box3(
  new Vector3(-10, -10, -0.05),
  new Vector3(10, 10, 0.05),
);

function frameInput(
  overrides: Partial<Parameters<typeof computeSeamFrame>[0]> = {},
) {
  return {
    plan: swingPlan(),
    stepIndex: 0,
    localBoxes: new Map<string, Box3>([['m', MOVER_BOX]]),
    fovYRad: (40 * Math.PI) / 180,
    aspect: 2,
    cameraPosition: new Vector3(0, 100, 150),
    cameraTarget: new Vector3(0, 0, 0),
    minDistance: 15,
    maxDistance: 900,
    ...overrides,
  };
}

describe('easeInOutCubic', () => {
  it('is anchored at 0, 0.5, and 1', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('starts at rest and lands at rest (slow–fast–slow)', () => {
    expect(easeInOutCubic(0.25)).toBeCloseTo(0.0625, 12);
    expect(easeInOutCubic(0.75)).toBeCloseTo(0.9375, 12);
    // Monotonic throughout: a fold never doubles back.
    let previous = 0;
    for (let i = 1; i <= 20; i++) {
      const value = easeInOutCubic(i / 20);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it('clamps inputs outside [0, 1]', () => {
    expect(easeInOutCubic(-0.5)).toBe(0);
    expect(easeInOutCubic(1.5)).toBe(1);
  });
});

describe('easedProgress01', () => {
  it('returns 1 immediately when the duration is zero (reduced motion)', () => {
    expect(easedProgress01(0, 0)).toBe(1);
    expect(easedProgress01(0, -5)).toBe(1);
  });

  it('clamps elapsed time before easing', () => {
    expect(easedProgress01(-100, 700)).toBe(0);
    expect(easedProgress01(9999, 700)).toBe(1);
    expect(easedProgress01(350, 700)).toBe(0.5);
  });
});

describe('foldDurationMs (the spec table)', () => {
  it('matches the spec rows for every type and direction', () => {
    expect(foldDurationMs(true, false)).toBe(FOLD_MS.straightForward);
    expect(foldDurationMs(false, false)).toBe(FOLD_MS.straightReverse);
    expect(foldDurationMs(true, true)).toBe(FOLD_MS.curvedForward);
    expect(foldDurationMs(false, true)).toBe(FOLD_MS.curvedReverse);
  });

  it('gives reverse the quicker undo and curved the more deliberate pace', () => {
    expect(FOLD_MS.straightReverse).toBeLessThan(FOLD_MS.straightForward);
    expect(FOLD_MS.curvedReverse).toBeLessThan(FOLD_MS.curvedForward);
    expect(FOLD_MS.curvedForward).toBeGreaterThan(FOLD_MS.straightForward);
  });

  it('runs the camera at 0.6× the fold duration', () => {
    expect(cameraDurationMs(700)).toBeCloseTo(700 * CAMERA_LEAD_FACTOR, 9);
  });
});

describe('seamIsCurved', () => {
  it('reads collinear chains as straight', () => {
    const chain = [
      new Vector3(0, 0, 0),
      new Vector3(1, 0, 0),
      new Vector3(2, 0, 0),
      new Vector3(3, 0, 0),
    ];
    expect(seamIsCurved(chain)).toBe(false);
  });

  it('accepts sub-tolerance bows as straight', () => {
    const chain = [
      new Vector3(0, 0, 0),
      new Vector3(1.5, 0.1, 0),
      new Vector3(3, 0, 0),
    ];
    expect(seamIsCurved(chain)).toBe(false);
  });

  it('flags a chain bowing past the tolerance', () => {
    const chain = [
      new Vector3(0, 0, 0),
      new Vector3(1.5, 1, 0),
      new Vector3(3, 0, 0),
    ];
    expect(seamIsCurved(chain)).toBe(true);
  });

  it('a two-point chain is always straight', () => {
    expect(seamIsCurved([new Vector3(0, 0, 0), new Vector3(5, 5, 0)])).toBe(
      false,
    );
  });
});

describe('computeSeamFrame', () => {
  it('keeps every point of the fold sweep inside the viewport', () => {
    const plan = swingPlan();
    const frame = computeSeamFrame(frameInput())!;
    expect(frame).not.toBeNull();

    // Reproduce the swept points independently: sample the mover's corners
    // through the swing and the anchor chain, then project them through a
    // camera placed at the frame. All must land in NDC [-1, 1].
    const camera = new PerspectiveCamera(40, 2, 0.5, 4000);
    camera.position.copy(frame.position);
    camera.lookAt(frame.target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    const corner = new Vector3();
    const projected: Vector3[] = [];
    for (const sampleT of [0, 0.25, 0.5, 0.75, 1]) {
      const pose = new Matrix4()
        .makeRotationAxis(new Vector3(1, 0, 0), sampleT * Math.PI)
        .multiply(plan.basePoses.get('m')!);
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? 10 : -10, i & 2 ? 10 : -10, i & 4 ? 0.05 : -0.05);
        projected.push(corner.clone().applyMatrix4(pose).project(camera));
      }
    }
    for (const point of plan.steps[0]!.anchorChainWorld) {
      projected.push(point.clone().project(camera));
    }
    for (const point of projected) {
      expect(point.x).toBeGreaterThanOrEqual(-1);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(-1);
      expect(point.y).toBeLessThanOrEqual(1);
    }
  });

  it('preserves the camera direction (only target and distance move)', () => {
    const input = frameInput();
    const frame = computeSeamFrame(input)!;
    const beforeDirection = input.cameraPosition
      .clone()
      .sub(input.cameraTarget)
      .normalize();
    const afterDirection = frame.position
      .clone()
      .sub(frame.target)
      .normalize();
    expect(afterDirection.distanceTo(beforeDirection)).toBeLessThan(1e-9);
  });

  it('clamps the fit distance to the orbit limits', () => {
    const frame = computeSeamFrame(frameInput({ maxDistance: 50 }))!;
    expect(frame.position.distanceTo(frame.target)).toBeCloseTo(50, 6);
    const far = computeSeamFrame(
      frameInput({ minDistance: 9000, maxDistance: 9000 }),
    )!;
    expect(far.position.distanceTo(far.target)).toBeCloseTo(9000, 6);
  });

  it('returns null for a missing step so the camera stays put', () => {
    expect(computeSeamFrame(frameInput({ stepIndex: 3 }))).toBeNull();
  });
});
