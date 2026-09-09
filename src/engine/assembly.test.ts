/**
 * Fold-math tests: the rectangle fold must land exactly (epsilon-tested),
 * the scrub states must be pure and reversible, and the plan gates must
 * reject authoring mistakes with clear messages.
 */
import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import {
  chainMeasuredLength,
  evaluateAssemblyPose,
  planAssembly,
} from './assembly';
import { closePath, lineTo, moveTo, quadTo } from '../model';
import type { EdgeChain, Piece, Project, SeamStep } from '../model';
import { createPiece, createProject, vec2 } from '../model';

/** Rectangle piece: vertices v0(0,0) v1(w,0) v2(w,h) v3(0,h), closed. */
function rectPiece(id: string, width: number, height: number): Piece {
  return createPiece({
    id,
    name: id,
    outline: [
      moveTo(vec2(0, 0)),
      lineTo(vec2(width, 0)),
      lineTo(vec2(width, height)),
      lineTo(vec2(0, height)),
      closePath(),
    ],
    internal: [],
    grainline: { angle: 0, placement: vec2(width / 2, height / 2) },
    seamAllowance: 1,
    cutCount: 1,
  });
}

function seam(
  mover: string,
  moverChain: EdgeChain,
  anchor: string,
  anchorChain: EdgeChain,
  order: number,
): SeamStep {
  return {
    pieces: [mover, anchor],
    edges: [moverChain, anchorChain],
    order,
    note: `step ${order}`,
  };
}

function projectOf(pieces: Piece[], steps: SeamStep[]): Project {
  return createProject({
    id: 'p',
    name: 'test',
    measurements: {},
    fabric: { weave: 'plain', weaveScale: 0.1, color: '#5b7553', weight: 200 },
    pieces,
    assembly: steps,
  });
}

const EPS = 1e-6;

function pointAt(pose: Matrix4, p: Vector3): Vector3 {
  return p.clone().applyMatrix4(pose);
}

/** Transform the local plane normal (0,0,1) as a direction (no translation). */
function normalOf(pose: Matrix4): Vector3 {
  return new Vector3(0, 0, 1)
    .applyMatrix4(pose)
    .sub(new Vector3(0, 0, 0).applyMatrix4(pose))
    .normalize();
}


describe('chain measurement', () => {
  it('measures straight edges exactly, including the wrapping close', () => {
    const piece = rectPiece('r', 10, 20);
    const rightEdge: EdgeChain = { pieceId: 'r', startVertex: 1, edgeCount: 1 };
    const wrappingLeftEdge: EdgeChain = {
      pieceId: 'r',
      startVertex: 3,
      edgeCount: 1,
    };
    expect(chainMeasuredLength(piece, rightEdge)).toBeCloseTo(20, 9);
    expect(chainMeasuredLength(piece, wrappingLeftEdge)).toBeCloseTo(20, 9);
  });

  it('measures curved edges along the sampled curve, not the chord', () => {
    const piece = createPiece({
      id: 'q',
      name: 'quad',
      outline: [
        moveTo(vec2(0, 0)),
        quadTo(vec2(4, 5), vec2(0, 10)),
        lineTo(vec2(10, 10)),
        closePath(),
      ],
      internal: [],
      grainline: { angle: 0, placement: vec2(1, 1) },
      seamAllowance: 1,
      cutCount: 1,
    });
    const quadEdge: EdgeChain = { pieceId: 'q', startVertex: 0, edgeCount: 1 };
    const length = chainMeasuredLength(piece, quadEdge);
    expect(length).toBeGreaterThan(10); // chord is 10; the curve bulges
    expect(length).toBeLessThan(12);
  });
});

describe('two-piece rectangle fold', () => {
  // A folds its right edge onto B's left edge — a 10x20 rectangle pair.
  const a = rectPiece('a', 10, 20);
  const b = rectPiece('b', 10, 20);
  const project = projectOf(
    [a, b],
    [
      seam(
        'a',
        { pieceId: 'a', startVertex: 1, edgeCount: 1 },
        'b',
        { pieceId: 'b', startVertex: 3, edgeCount: 1 },
        1,
      ),
    ],
  );
  const plan = planAssembly(project);

  it('plans one step and roots the anchor at the origin', () => {
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.moverGroup).toEqual(['a']);
    // B's centre should sit at the world origin.
    const centre = pointAt(plan.basePoses.get('b')!, new Vector3(5, 10, 0));
    expect(centre.x).toBeCloseTo(0, 9);
    expect(centre.y).toBeCloseTo(0, 9);
    expect(centre.z).toBeCloseTo(0, 9);
  });

  it('folded (t=1): the mover chain coincides with the anchor chain within epsilon', () => {
    const poses = evaluateAssemblyPose(plan, 0, 1);
    const poseA = poses.get('a')!;
    const foldedEnds = [
      pointAt(poseA, new Vector3(10, 0, 0)),
      pointAt(poseA, new Vector3(10, 20, 0)),
    ];
    const anchorEnds = [
      pointAt(poses.get('b')!, new Vector3(0, 20, 0)),
      pointAt(poses.get('b')!, new Vector3(0, 0, 0)),
    ];
    // Correspondence may run either way along the chain; as a set the
    // endpoints must coincide.
    for (const end of foldedEnds) {
      const nearest = anchorEnds.reduce(
        (best, candidate) =>
          candidate.distanceTo(end) < best.distanceTo(end) ? candidate : best,
        anchorEnds[0]!,
      );
      expect(nearest.distanceTo(end)).toBeLessThan(EPS);
    }
  });

  it('folded (t=1): the mover lies flat on the anchor, printed face up', () => {
    const poses = evaluateAssemblyPose(plan, 0, 1);
    const normal = normalOf(poses.get('a')!);
    expect(normal.x).toBeCloseTo(0, 6);
    expect(normal.y).toBeCloseTo(1, 6);
    expect(normal.z).toBeCloseTo(0, 6);
    // Centred on the anchor's footprint, on the mat plane.
    const centre = pointAt(poses.get('a')!, new Vector3(5, 10, 0));
    expect(centre.distanceTo(new Vector3(0, 0, 0))).toBeLessThan(EPS);
  });

  it('flat (t=0): the mover waits face-down on the far side of the hinge', () => {
    const poses = evaluateAssemblyPose(plan, 0, 0);
    const normal = normalOf(poses.get('a')!);
    expect(normal.y).toBeCloseTo(-1, 6); // face-down: right sides together
    const centre = pointAt(poses.get('a')!, new Vector3(5, 10, 0));
    expect(centre.x).toBeLessThan(-5 + EPS); // beyond B's left edge
    expect(centre.y).toBeCloseTo(0, 6); // lying on the mat
  });

  it('scrubs upright at mid-fold, sweeping up out of the mat', () => {
    const poses = evaluateAssemblyPose(plan, 0, 0.5);
    const centre = pointAt(poses.get('a')!, new Vector3(5, 10, 0));
    expect(centre.y).toBeCloseTo(5, 6); // hinge-to-centroid distance is 5
    expect(centre.x).toBeCloseTo(-5, 6); // directly above the hinge
  });

  it('is reversible: folding a second 180° returns the flat pose', () => {
    const folded = evaluateAssemblyPose(plan, 0, 1).get('a')!;
    const flat = evaluateAssemblyPose(plan, 0, 0).get('a')!;
    const hinge = plan.steps[0]!.hinge;
    const rot = new Matrix4()
      .makeTranslation(hinge.origin.x, hinge.origin.y, hinge.origin.z)
      .multiply(new Matrix4().makeRotationAxis(hinge.direction, Math.PI))
      .multiply(
        new Matrix4().makeTranslation(
          -hinge.origin.x,
          -hinge.origin.y,
          -hinge.origin.z,
        ),
      );
    const backAgain = folded.clone().premultiply(rot);
    // Two consecutive 180° rotations reconstruct the flat pose up to
    // floating-point drift (~1e-16), so compare element-wise.
    backAgain
      .toArray()
      .forEach((element, index) =>
        expect(element).toBeCloseTo(flat.toArray()[index]!, 9),
      );
  });
  it('is deterministic: the same state evaluates to the same matrices', () => {
    const first = evaluateAssemblyPose(plan, 0, 0.37).get('a')!.toArray();
    const second = evaluateAssemblyPose(plan, 0, 0.37).get('a')!.toArray();
    expect(first).toEqual(second);
  });
});

describe('pose continuity across step boundaries (UX-01)', () => {
  // Chain a→b→c: two folds. Step 0 folds a onto b; step 1 folds c onto b's
  // far edge. The walkthrough tweens across the step boundary, so the pose
  // at the END of step 0 must equal the pose at the START of step 1 —
  // otherwise every Next/Prev click would pop.
  const a = rectPiece('a', 10, 20);
  const b = rectPiece('b', 10, 20);
  const c = rectPiece('c', 10, 20);
  const project = projectOf(
    [a, b, c],
    [
      seam(
        'a',
        { pieceId: 'a', startVertex: 1, edgeCount: 1 },
        'b',
        { pieceId: 'b', startVertex: 3, edgeCount: 1 },
        1,
      ),
      seam(
        'c',
        { pieceId: 'c', startVertex: 3, edgeCount: 1 },
        'b',
        { pieceId: 'b', startVertex: 1, edgeCount: 1 },
        2,
      ),
    ],
  );
  const chainPlan = planAssembly(project);

  it('plans two steps', () => {
    expect(chainPlan.steps).toHaveLength(2);
    expect(chainPlan.steps[0]!.moverGroup).toEqual(['a']);
    expect(chainPlan.steps[1]!.moverGroup).toEqual(['c']);
  });

  it('the end of step 0 is exactly the start of step 1 (no snap at the boundary)', () => {
    const atEndOfStep0 = evaluateAssemblyPose(chainPlan, 0, 1);
    const atStartOfStep1 = evaluateAssemblyPose(chainPlan, 1, 0);
    for (const pieceId of ['a', 'b', 'c']) {
      const before = atEndOfStep0.get(pieceId)!.toArray();
      const after = atStartOfStep1.get(pieceId)!.toArray();
      before.forEach((element, index) =>
        expect(element).toBeCloseTo(after[index]!, 9),
      );
    }
  });

  it('walking backward retraces the forward fold (Prev undoes Next)', () => {
    // Walking backward from the end through the reversed fold passes every
    // forward pose: at each sampled t, pose(1-t) must be the forward pose
    // mirrored through the hinge rotation by sweepSign·(1-2t)·π.
    const step = chainPlan.steps[1]!;
    const hinge = step.hinge;
    for (const t of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const reversed = evaluateAssemblyPose(chainPlan, 1, 1 - t).get('c')!;
      const forward = evaluateAssemblyPose(chainPlan, 1, t).get('c')!;
      // pose(1-t) = R(sweepSign·(1-2t)·π) applied to pose(t) about the hinge.
      const rotation = new Matrix4()
        .makeTranslation(hinge.origin.x, hinge.origin.y, hinge.origin.z)
        .multiply(
          new Matrix4().makeRotationAxis(
            hinge.direction,
            step.sweepSign * (1 - 2 * t) * Math.PI,
          ),
        )
        .multiply(
          new Matrix4().makeTranslation(
            -hinge.origin.x,
            -hinge.origin.y,
            -hinge.origin.z,
          ),
        );
      const mirrored = forward.clone().premultiply(rotation);
      mirrored
        .toArray()
        .forEach((element, index) =>
          expect(element).toBeCloseTo(reversed.toArray()[index]!, 9),
        );
    }
  });

  it('is pure: evaluating a pose never mutates the plan', () => {
    const snapshot = chainPlan.steps.map((stepPlan) => ({
      hingeOrigin: stepPlan.hinge.origin.toArray(),
      hingeDirection: stepPlan.hinge.direction.toArray(),
      basePoses: [...chainPlan.basePoses.entries()].map(
        ([id, matrix]) => [id, matrix.toArray()] as const,
      ),
    }));
    evaluateAssemblyPose(chainPlan, 0, 0.42);
    evaluateAssemblyPose(chainPlan, 1, 0.17);
    chainPlan.steps.forEach((stepPlan, index) => {
      const expected = snapshot[index]!;
      expect(stepPlan.hinge.origin.toArray()).toEqual(expected.hingeOrigin);
      expect(stepPlan.hinge.direction.toArray()).toEqual(
        expected.hingeDirection,
      );
      for (const [id, matrix] of expected.basePoses) {
        expect(chainPlan.basePoses.get(id)!.toArray()).toEqual(matrix);
      }
    });
  });
});

describe('plan gates', () => {
  it('rejects chains whose measured lengths differ beyond tolerance', () => {
    const a = rectPiece('a', 10, 20);
    const b = rectPiece('b', 10, 20);
    // A's bottom edge (10 cm) against B's left edge (20 cm).
    const project = projectOf(
      [a, b],
      [
        seam(
          'a',
          { pieceId: 'a', startVertex: 0, edgeCount: 1 },
          'b',
          { pieceId: 'b', startVertex: 3, edgeCount: 1 },
          1,
        ),
      ],
    );
    expect(() => planAssembly(project)).toThrowError(/measured length/);
  });

  it('accepts eased seams within tolerance', () => {
    const a = rectPiece('a', 10, 20.5); // 2.5% longer — inside the 5% gate
    const b = rectPiece('b', 10, 20);
    const project = projectOf(
      [a, b],
      [
        seam(
          'a',
          { pieceId: 'a', startVertex: 1, edgeCount: 1 },
          'b',
          { pieceId: 'b', startVertex: 3, edgeCount: 1 },
          1,
        ),
      ],
    );
    expect(planAssembly(project).steps).toHaveLength(1);
  });

  it('rejects a piece asked to fold twice', () => {
    const a = rectPiece('a', 10, 20);
    const b = rectPiece('b', 10, 20);
    const c = rectPiece('c', 10, 20);
    const rightOf = (id: string): EdgeChain => ({
      pieceId: id,
      startVertex: 1,
      edgeCount: 1,
    });
    const leftOf = (id: string): EdgeChain => ({
      pieceId: id,
      startVertex: 3,
      edgeCount: 1,
    });
    const project = projectOf([a, b, c], [
      seam('a', rightOf('a'), 'b', leftOf('b'), 1),
      seam('a', rightOf('a'), 'c', leftOf('c'), 2),
    ]);
    expect(() => planAssembly(project)).toThrowError(/at most once/);
  });

  it('sews a further seam of the same join in place (nothing moves)', () => {
    // Garment sewing order sews several seams of one joined pair: after
    // the rise folds a onto b, a second a→b seam sews on the already-
    // folded pair. The step is kept for narration and camera framing,
    // but places nothing — sweepSign 0 means the pose never changes.
    const a = rectPiece('a', 10, 20);
    const b = rectPiece('b', 10, 20);
    const project = projectOf([a, b], [
      seam(
        'a',
        { pieceId: 'a', startVertex: 1, edgeCount: 1 },
        'b',
        { pieceId: 'b', startVertex: 3, edgeCount: 1 },
        1,
      ),
      seam(
        'a',
        { pieceId: 'a', startVertex: 2, edgeCount: 1 },
        'b',
        { pieceId: 'b', startVertex: 0, edgeCount: 1 },
        2,
      ),
    ]);
    const plan = planAssembly(project);
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[1]!.moverGroup).toEqual(['a']);
    expect(plan.steps[1]!.sweepSign).toBe(0);

    // Scrubbing the sew-in-place step moves nothing: the pose at the end
    // of step 2 (fully folded) equals the pose after step 1, at any t.
    const afterStep1 = evaluateAssemblyPose(plan, 0, 1);
    for (const t of [0, 0.5, 1]) {
      const atT = evaluateAssemblyPose(plan, 1, t);
      expect(pointAt(atT.get('a')!, new Vector3(3, 10, 0))).toEqual(
        pointAt(afterStep1.get('a')!, new Vector3(3, 10, 0)),
      );
      expect(pointAt(atT.get('b')!, new Vector3(5, 10, 0))).toEqual(
        pointAt(afterStep1.get('b')!, new Vector3(5, 10, 0)),
      );
    }
  });
});

describe('fold groups', () => {
  it('carries already-folded pieces when their group folds again', () => {
    // Pocket folds onto the cover (step 1); cover+pocket then fold onto
    // the flap (step 2). The pocket must ride along.
    const cover = rectPiece('cover', 10, 20);
    const pocket = rectPiece('pocket', 6, 20);
    const flap = rectPiece('flap', 10, 20);
    const project = projectOf([cover, pocket, flap], [
      seam(
        'pocket',
        { pieceId: 'pocket', startVertex: 1, edgeCount: 1 },
        'cover',
        { pieceId: 'cover', startVertex: 3, edgeCount: 1 },
        1,
      ),
      seam(
        'cover',
        { pieceId: 'cover', startVertex: 1, edgeCount: 1 },
        'flap',
        { pieceId: 'flap', startVertex: 3, edgeCount: 1 },
        2,
      ),
    ]);
    const plan = planAssembly(project);

    expect(plan.steps[0]!.moverGroup).toEqual(['pocket']);
    expect([...plan.steps[1]!.moverGroup].sort()).toEqual(['cover', 'pocket']);

    // Rigid-body invariant: the pocket stays the same distance from the
    // cover centroid before and after the second fold.
    const afterStep1 = evaluateAssemblyPose(plan, 0, 1);
    const afterStep2 = evaluateAssemblyPose(plan, 1, 1);
    const pocket1 = pointAt(afterStep1.get('pocket')!, new Vector3(3, 10, 0));
    const cover1 = pointAt(afterStep1.get('cover')!, new Vector3(5, 10, 0));
    const pocket2 = pointAt(afterStep2.get('pocket')!, new Vector3(3, 10, 0));
    const cover2 = pointAt(afterStep2.get('cover')!, new Vector3(5, 10, 0));
    expect(pocket2.distanceTo(cover2)).toBeCloseTo(
      pocket1.distanceTo(cover1),
      6,
    );
  });
});

describe('pieces with no seam', () => {
  it('parks uninvolved pieces without affecting the assembly', () => {
    const a = rectPiece('a', 10, 20);
    const b = rectPiece('b', 10, 20);
    const loose = rectPiece('loose', 5, 5);
    const project = projectOf([a, b, loose], [
      seam(
        'a',
        { pieceId: 'a', startVertex: 1, edgeCount: 1 },
        'b',
        { pieceId: 'b', startVertex: 3, edgeCount: 1 },
        1,
      ),
    ]);
    const plan = planAssembly(project);
    expect(plan.steps).toHaveLength(1);
    expect(plan.basePoses.has('loose')).toBe(true);
    const poses = evaluateAssemblyPose(plan, 0, 1);
    // The loose piece never moves.
    expect(poses.get('loose')!.toArray()).toEqual(
      plan.basePoses.get('loose')!.toArray(),
    );
  });
});
