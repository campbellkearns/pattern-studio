import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createStarterProject } from '../model';
import type { StarterProject } from '../model';
import { evaluateAssemblyPose, planAssembly } from '../engine/assembly';
import type { PantMeasurements } from '../engine/titanSettings';
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

  it('redrafts the fixed-size starters to identical fresh geometry', () => {
    // The blueprint defines no dimensions for these rungs, so every
    // measurement yields the same validated pieces — new objects each call
    // (redraft swaps the live pieces, so sharing would alias mutations).
    const small: PantMeasurements = TITAN_PANTS_TEMPLATE;
    const large: PantMeasurements = {
      ...TITAN_PANTS_TEMPLATE,
      waistCm: 140,
      hipCm: 160,
      inseamCm: 50,
    };
    for (const id of ['starter-toiletry-rollup', 'starter-tote']) {
      const entry = starterById(id)!;
      const atSmall = entry.redraft(small);
      const atLarge = entry.redraft(large);
      expect(JSON.stringify(atLarge)).toEqual(JSON.stringify(atSmall));
      expect(atLarge[0]).not.toBe(atSmall[0]);
    }
  });
});
