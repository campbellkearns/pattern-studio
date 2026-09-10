import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { orderReviewRows } from '../appState';
import { createStarterProject } from '../model';
import type { PathCmd, StarterProject } from '../model';
import { evaluateAssemblyPose, planAssembly } from '../engine/assembly';
import { TITAN_PANTS_TEMPLATE } from '../engine/titanSettings';
import { STARTERS, starterById } from './starters';
import { TOILETRY_ROLLUP_STARTER } from './toiletryRollup';
import { TOTE_STARTER } from './tote';

/**
 * Shared invariants for the two fixed-size starters (D5 ladder rungs 2–3):
 * data soundness, cut counts per the authored spec, seam steps that resolve
 * against real pieces, and an assembly the engine can fold end to end.
 */
function expectFixedSizeStarterInvariants(
  starter: StarterProject,
  cutCounts: Record<string, number>,
): void {
  // The full aggregate validation gate re-derives every nested value.
  const project = createStarterProject(starter);
  expect(project.id).toBe(starter.id);
  expect(project.learnCard).toMatch(/learn/i);
  // Fixed-size by blueprint: the starter spec defines no dimensions.
  expect(Object.keys(project.measurements)).toEqual([]);

  // Piece ids are unique and every outline is a closed M…Z path.
  const ids = project.pieces.map((piece) => piece.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const piece of project.pieces) {
    expect(piece.outline[0]?.type).toBe('M');
    expect(piece.outline[piece.outline.length - 1]?.type).toBe('Z');
  }

  // Cut counts match the authored spec; every piece carries marks,
  // a grainline, and a positive seam allowance.
  for (const piece of project.pieces) {
    expect(piece.cutCount).toBe(cutCounts[piece.id]);
    expect(piece.internal.length).toBeGreaterThan(0);
    expect(piece.seamAllowance).toBeGreaterThan(0);
  }

  // Seam steps reference existing pieces and run in a strict order.
  const pieceIds = new Set(ids);
  const orders = project.assembly.map((step) => step.order);
  for (const step of project.assembly) {
    expect(pieceIds.has(step.pieces[0])).toBe(true);
    expect(pieceIds.has(step.pieces[1])).toBe(true);
  }
  expect([...orders].sort((a, b) => a - b)).toEqual(orders);

  // The engine folds the sequence end to end; the anchor (every step's
  // second piece) never moves.
  const plan = planAssembly(project);
  expect(plan.steps).toHaveLength(project.assembly.length);
  for (let i = 0; i < project.assembly.length; i++) {
    const anchorId = project.assembly[i]!.pieces[1];
    const anchorPose = plan.basePoses.get(anchorId)!;
    const poses = evaluateAssemblyPose(plan, i, 1);
    expect(poses.get(anchorId)!.toArray()).toEqual(anchorPose.toArray());
  }
}

describe('toiletry rollup starter (ladder rung 2)', () => {
  it('meets the fixed-size starter invariants', () => {
    expectFixedSizeStarterInvariants(TOILETRY_ROLLUP_STARTER, {
      body: 1,
      pocket: 1,
      flap: 1,
    });
    expect(TOILETRY_ROLLUP_STARTER.name).toBe('Toiletry rollup');
    expect(TOILETRY_ROLLUP_STARTER.pieces.map((p) => p.id)).toEqual([
      'body',
      'pocket',
      'flap',
    ]);
  });

  it('folds the pocket down and the flap up onto a static body', () => {
    const project = createStarterProject(TOILETRY_ROLLUP_STARTER);
    expect(project.assembly.map((step) => step.order)).toEqual([1, 2]);
    expect(project.assembly[0]?.pieces).toEqual(['pocket', 'body']);
    expect(project.assembly[1]?.pieces).toEqual(['flap', 'body']);

    // Both movers land on the body: the pocket covers it from the top
    // edge, the flap from the bottom edge.
    const plan = planAssembly(project);
    const bodyPose = plan.basePoses.get('body')!;
    const pocketCentre = new Vector3(13, 7, 0).applyMatrix4(
      evaluateAssemblyPose(plan, 0, 1).get('pocket')!,
    );
    expect(pocketCentre.y).toBeCloseTo(0, 6);
    expect(pocketCentre.z).toBeLessThan(-1); // folded over the body
    const flapCentre = new Vector3(13, 5, 0).applyMatrix4(
      evaluateAssemblyPose(plan, 1, 1).get('flap')!,
    );
    expect(flapCentre.y).toBeCloseTo(0, 6);
    expect(flapCentre.z).toBeGreaterThan(1); // folded up from the bottom
    expect(evaluateAssemblyPose(plan, 1, 1).get('body')!.toArray()).toEqual(
      bodyPose.toArray(),
    );
  });
});

describe('tote starter (ladder rung 3)', () => {
  it('meets the fixed-size starter invariants', () => {
    expectFixedSizeStarterInvariants(TOTE_STARTER, {
      body: 2,
      facing: 1,
      base: 1,
    });
    expect(TOTE_STARTER.name).toBe('Tote');
    expect(TOTE_STARTER.pieces.map((p) => p.id)).toEqual([
      'body',
      'facing',
      'base',
    ]);
  });

  it('folds the facing down and the base band up onto a static body', () => {
    const project = createStarterProject(TOTE_STARTER);
    expect(project.assembly.map((step) => step.order)).toEqual([1, 2]);
    expect(project.assembly[0]?.pieces).toEqual(['facing', 'body']);
    expect(project.assembly[1]?.pieces).toEqual(['base', 'body']);

    const plan = planAssembly(project);
    const bodyPose = plan.basePoses.get('body')!;
    const facingCentre = new Vector3(20, 4, 0).applyMatrix4(
      evaluateAssemblyPose(plan, 0, 1).get('facing')!,
    );
    expect(facingCentre.y).toBeCloseTo(0, 6);
    expect(facingCentre.z).toBeLessThan(-1); // folded down inside
    const baseCentre = new Vector3(20, 5, 0).applyMatrix4(
      evaluateAssemblyPose(plan, 1, 1).get('base')!,
    );
    expect(baseCentre.y).toBeCloseTo(0, 6);
    expect(baseCentre.z).toBeGreaterThan(1); // folded up from the bottom
    expect(evaluateAssemblyPose(plan, 1, 1).get('body')!.toArray()).toEqual(
      bodyPose.toArray(),
    );
  });
});

describe('starter registry ladder', () => {
  it('orders the picker along the D5 difficulty ladder', () => {
    expect(STARTERS.map((entry) => entry.id)).toEqual([
      'starter-notebook-holder',
      'starter-toiletry-rollup',
      'starter-tote',
      'starter-pants',
    ]);
  });

  it('resolves every entry by id; rebuilt entries hand out fresh objects', () => {
    for (const entry of STARTERS) {
      expect(starterById(entry.id)?.id).toBe(entry.id);
      const first = entry.build();
      const second = entry.build();
      expect(second.name).toBe(first.name);
      if (entry.id === 'starter-pants') {
        // The pants factory deliberately caches its ~40 ms Titan draft —
        // main's contract, kept. Content equality is the guarantee there.
        expect(second).toBe(first);
      } else {
        expect(second).not.toBe(first);
      }
    }
  });

  it('names every seam (UX-07): seams name themselves in place', () => {
    for (const entry of STARTERS) {
      const project = entry.build();
      for (const step of project.assembly) {
        expect(step.name).toEqual(
          expect.stringMatching(/\S/),
        );
      }
    }
  });

  it('the UX-10 review list renders exactly project.assembly order for every starter', () => {
    // The order-review surface's rows come from orderReviewRows — the same
    // pure builder the shell renders. For every registry entry (the coaster
    // included when UX-11 lands) the list must be the assembly, verbatim and
    // in build order: what the user reviews is what the walkthrough folds.
    for (const entry of STARTERS) {
      const project = entry.build();
      const rows = orderReviewRows(project);
      expect(rows).toHaveLength(project.assembly.length);
      project.assembly.forEach((step, i) => {
        expect(rows[i]!.order).toBe(step.order);
        expect(rows[i]!.title).toBe(step.name);
        expect(rows[i]!.note).toBe(step.note);
      });
      // A starter with seams reviews a list it can then stitch; the order
      // field is strictly increasing (validated by the model) so the review
      // reads 1, 2, 3… without re-sorting.
      expect(rows.map((row) => row.order)).toEqual(
        [...rows.map((row) => row.order)].sort((a, b) => a - b),
      );
    }
  });

  /** X-extent of an outline (for asserting parametric resizing). */
  function outlineMaxX(outline: readonly PathCmd[]): number {
    const xs: number[] = [];
    for (const cmd of outline) {
      if (cmd.type !== 'Z') xs.push(cmd.point.x);
      if (cmd.type === 'C') xs.push(cmd.control1.x, cmd.control2.x);
    }
    return Math.max(...xs);
  }

  describe('parameter schemas (UX-03)', () => {
    it('declares redraft exactly when parameters exist', () => {
      for (const entry of STARTERS) {
        if (entry.parameters.length > 0) {
          expect(entry.redraft).toBeTypeOf('function');
        } else {
          expect(entry.redraft).toBeUndefined();
        }
      }
    });

    it('the notebook holder declares no parameters — no pants fields, ever', () => {
      // The reported bug: pants measurements showed while the notebook
      // holder was selected. Its schema must stay empty.
      const entry = starterById('starter-notebook-holder')!;
      expect(entry.parameters).toHaveLength(0);
    });

    it('the pants starter declares exactly the eight Titan parameters', () => {
      const entry = starterById('starter-pants')!;
      expect(entry.parameters.map((spec) => spec.key)).toEqual(
        Object.keys(TITAN_PANTS_TEMPLATE),
      );
    });

    it('pants redraft consumes schema-keyed values and resizes the waistband', () => {
      const entry = starterById('starter-pants')!;
      const values: Record<string, number> = {};
      for (const spec of entry.parameters) values[spec.key] = spec.value;
      const pieces = entry.redraft!(values);
      expect(pieces.map((piece) => piece.id)).toContain('waistband');

      const band = pieces.find((piece) => piece.id === 'waistband')!;
      const wideBand = entry
        .redraft!({ ...values, waistCm: 140 })
        .find((piece) => piece.id === 'waistband')!;
      expect(outlineMaxX(wideBand.outline)).toBeGreaterThan(
        outlineMaxX(band.outline),
      );
    });

    it('pants redraft fails loudly on a missing schema key, not silently', () => {
      const entry = starterById('starter-pants')!;
      // A value map missing a declared key cannot draft — the MeasurementError
      // is what keeps the last valid pattern on the mat.
      expect(() => entry.redraft!({ waistCm: 90 })).toThrow(/must be finite/);
    });
  });
});
