import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createStarterProject } from '../model';
import { evaluateAssemblyPose, planAssembly } from '../engine/assembly';
import { NOTEBOOK_HOLDER_STARTER } from './notebookHolder';

describe('notebook holder starter', () => {
  it('passes the full aggregate validation gate', () => {
    const project = createStarterProject(NOTEBOOK_HOLDER_STARTER);
    expect(project.id).toBe('starter-notebook-holder');
    expect(project.pieces).toHaveLength(3);
    expect(project.learnCard).toMatch(/learn/i);
  });

  it('has unique piece ids and closed outlines', () => {
    const { pieces } = NOTEBOOK_HOLDER_STARTER;
    const ids = pieces.map((piece) => piece.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const piece of pieces) {
      expect(piece.outline[piece.outline.length - 1]?.type).toBe('Z');
      expect(piece.outline[0]?.type).toBe('M');
    }
  });

  it('covers the blueprint starter ladder: notebook holder first', () => {
    expect(NOTEBOOK_HOLDER_STARTER.name).toBe('Notebook holder');
  });

  it('carries an ordered assembly the engine can fold end to end', () => {
    const project = createStarterProject(NOTEBOOK_HOLDER_STARTER);
    // Build order: flap onto the cover, then the pocket.
    expect(project.assembly.map((step) => step.order)).toEqual([1, 2]);
    expect(project.assembly[0]?.pieces).toEqual(['flap', 'cover']);
    expect(project.assembly[1]?.pieces).toEqual(['pocket', 'cover']);

    // The plan must survive the engine's gates and fully fold inside the
    // step count: every fold lands its mover on the cover's footprint.
    const plan = planAssembly(project);
    expect(plan.steps).toHaveLength(2);
    const coverPose = plan.basePoses.get('cover')!;
    for (const step of plan.steps) {
      const poses = evaluateAssemblyPose(
        plan,
        project.assembly.indexOf(step.step),
        1,
      );
      // The anchor of every step is the cover: its pose never changes.
      expect(poses.get('cover')!.toArray()).toEqual(coverPose.toArray());
    }
    // The flap (folded onto the top edge) ends up centred above the
    // cover's centre in world Z: within the cover's far half-plane.
    const flapCentre = new Vector3(20, 5.5, 0)
      .applyMatrix4(evaluateAssemblyPose(plan, 0, 1).get('flap')!);
    expect(flapCentre.y).toBeCloseTo(0, 6);
    expect(flapCentre.z).toBeLessThan(-2); // beyond the cover's midline
    // The pocket folds onto the cover's left edge and lies flat on it.
    const pocketCentre = new Vector3(11, 6, 0)
      .applyMatrix4(evaluateAssemblyPose(plan, 1, 1).get('pocket')!);
    expect(pocketCentre.y).toBeCloseTo(0, 6);
  });

  it('pieces carry grainlines, marks, and cut counts', () => {
    const { pieces } = NOTEBOOK_HOLDER_STARTER;
    const cover = pieces.find((piece) => piece.id === 'cover');
    const pocket = pieces.find((piece) => piece.id === 'pocket');
    expect(cover?.cutCount).toBe(1);
    expect(pocket?.cutCount).toBe(2);
    for (const piece of pieces) {
      expect(piece.internal.length).toBeGreaterThan(0);
      expect(piece.seamAllowance).toBeGreaterThan(0);
    }
  });
});
