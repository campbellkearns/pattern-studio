import { describe, expect, it } from 'vitest';
import {
  chainMeasuredLength,
  planAssembly,
  SEAM_LENGTH_TOLERANCE,
} from '../engine/assembly';
import {
  PANTS_PARAMETERS,
  TITAN_PANTS_TEMPLATE,
  toPantMeasurements,
} from '../engine/titanSettings';
import { pantsStarter, redraftPantsStarter } from './pantsStarter';
import { SeamResolutionError } from './pantsSeams';
import type { PantMeasurements } from '../engine/titanSettings';

/** Every corner of the range (each axis at min/max) plus each axis alone. */
function parameterSweep(): PantMeasurements[] {
  const combos: Record<string, number>[] = [];
  const keys = PANTS_PARAMETERS.map((p) => (p as unknown as { key: string }).key);
  const walk = (i: number, acc: Record<string, number>) => {
    if (i === keys.length) {
      combos.push({ ...acc });
      return;
    }
    const spec = PANTS_PARAMETERS[i]! as unknown as { min: number; max: number };
    acc[keys[i]!] = spec.min;
    walk(i + 1, acc);
    acc[keys[i]!] = spec.max;
    walk(i + 1, acc);
  };
  walk(0, {});
  const singles: Record<string, number>[] = [];
  for (let i = 0; i < keys.length; i++) {
    const spec = PANTS_PARAMETERS[i]! as unknown as { min: number; max: number };
    for (const bound of [spec.min, spec.max]) {
      singles.push({ ...TITAN_PANTS_TEMPLATE, [keys[i]!]: bound });
    }
  }
  return [...singles, ...combos].map(
    (values) => toPantMeasurements(values as never),
  );
}

describe('pants assembly entry across the parameter range', () => {
  it('redrafts and resolves every seam chain at template measurements', () => {
    // The UX-15 regression: assembly entry threw at template measurements —
    // "mover 16.52 cm vs anchor 17.77 cm" — because the fly shield's attach
    // edge was sized from a fork-depth formula while the front's fly edge
    // measured the draft. Sizing from measured geometry closes the gap.
    const { pieces, assembly } = redraftPantsStarter(TITAN_PANTS_TEMPLATE);
    const byId = new Map(pieces.map((piece) => [piece.id, piece]));
    for (const step of assembly) {
      const mover = byId.get(step.pieces[0])!;
      const anchor = byId.get(step.pieces[1])!;
      const tolerance = step.ease ?? SEAM_LENGTH_TOLERANCE;
      const moverLength = chainMeasuredLength(mover, step.edges[0]);
      const anchorLength = chainMeasuredLength(anchor, step.edges[1]);
      const longest = Math.max(moverLength, anchorLength);
      expect(
        Math.abs(moverLength - anchorLength),
        `seam step ${step.order} (${step.name})`,
      ).toBeLessThanOrEqual(tolerance * longest);
    }
  });

  it('measures every seam chain within its gate across the range and corners', () => {
    // The same gate the assembly engine applies, checked over every corner
    // of the measurement panel's range (including the topology-shifting
    // extremes that render an eighth outline vertex). Chains are resolved
    // from the fresh draft, so no fixed index can go stale.
    //
    // The contract across the range is pass-or-fail-loud: a corner either
    // drafts a sewable leg and clears every seam gate, or it is refused —
    // by seam resolution (SeamResolutionError) or by the seam-length gate
    // the assembly planner applies at entry. Either way the app narrates
    // the failure and keeps the last valid draft; nothing proceeds
    // silently. Both refusal sets are pinned so they cannot widen
    // unnoticed.
    const unresolved: PantMeasurements[] = [];
    const gateRefused: PantMeasurements[] = [];
    for (const measurements of parameterSweep()) {
      let failed: unknown = null;
      let drafted: ReturnType<typeof redraftPantsStarter> | null = null;
      try {
        drafted = redraftPantsStarter(measurements);
      } catch (error) {
        failed = error;
      }
      if (failed !== null) {
        expect(
          failed instanceof SeamResolutionError,
          `non-resolution failure at ${JSON.stringify(measurements)}`,
        ).toBe(true);
        unresolved.push(measurements);
        continue;
      }
      if (!allSeamsWithinGate(drafted!)) gateRefused.push(measurements);
    }

    // Titan's waist≫hip inverted figure (waist 140 on hip 75): the front's
    // fly anatomy collapses (the rise loses its crotch + fly split), so no
    // leg anatomy is readable. The panel still offers the corner; the
    // resolver refuses it loudly and the app keeps the last valid draft.
    expect(unresolved).toHaveLength(2);
    for (const measurements of unresolved) {
      expect(measurements.waistCm).toBe(140);
      expect(measurements.hipCm).toBe(75);
    }

    // The hip≫waist inverted figure (waist 60 on hip 160 — a 2.67:1 ratio,
    // beyond any real body): the eased outseam bulge outranks or shadows
    // the true waist corners in every measured dimension, so the ranked
    // landmarks misread the leg and the seam gate refuses the plan at
    // entry. Loud, narrated, mat preserved — but pinned.
    expect(gateRefused).toHaveLength(10);
    for (const measurements of gateRefused) {
      expect(measurements.waistCm).toBe(60);
      expect(measurements.hipCm).toBe(160);
    }
  });

  it('plans the full six-step assembly end to end wherever the draft is sewable', () => {
    // Entry is eager: buildAssemblyScene plans every step before the mode
    // switch. The choreography (further seams of the joined pair sew in
    // place; the waistband is its own mover) must therefore survive the
    // planner itself, not just the measured-length gates.
    const starter = pantsStarter();
    expect(() => planAssembly(starter)).not.toThrow();

    let planned = 0;
    for (const measurements of parameterSweep()) {
      let drafted: ReturnType<typeof redraftPantsStarter>;
      try {
        drafted = redraftPantsStarter(measurements);
      } catch {
        continue; // refused loudly by the resolver; pinned above
      }
      if (!allSeamsWithinGate(drafted)) continue; // refused by the gate; pinned above
      const project = {
        ...starter,
        pieces: drafted.pieces,
        assembly: drafted.assembly,
      };
      expect(() => planAssembly(project)).not.toThrow();
      planned += 1;
    }
    // 272 sweep corners minus the 2 resolver refusals and 10 gate refusals.
    expect(planned).toBe(260);
  });

  it('keeps the six named steps with the fold/sew choreography at template', () => {
    const plan = planAssembly(pantsStarter());
    // Movers in order: the shield, the front (rise fold, then two
    // sew-in-place seams), and the waistband (fold, then sew its back
    // quarter in place). No piece folds as a mover twice.
    expect(plan.steps.map((step) => step.moverGroup[0])).toEqual([
      'fly-shield',
      'pants-front',
      'pants-front',
      'pants-front',
      'waistband',
      'waistband',
    ]);
    // 0 marks the sew-in-place steps — the side seams and inseam on the
    // rise-folded pair, and the band's back quarter. The fold steps' ±1
    // sweep direction is the planner's choice (up out of the mat) and is
    // pinned by the engine's own tests.
    expect(plan.steps.map((step) => step.sweepSign === 0)).toEqual([
      false,
      false,
      true,
      true,
      false,
      true,
    ]);
  });
});

/** Re-measure every seam step of one draft; false when any breaches its gate. */
function allSeamsWithinGate(
  drafted: ReturnType<typeof redraftPantsStarter>,
): boolean {
  const { pieces, assembly } = drafted;
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  for (const step of assembly) {
    const mover = byId.get(step.pieces[0])!;
    const anchor = byId.get(step.pieces[1])!;
    const tolerance = step.ease ?? SEAM_LENGTH_TOLERANCE;
    const moverLength = chainMeasuredLength(mover, step.edges[0]);
    const anchorLength = chainMeasuredLength(anchor, step.edges[1]);
    const longest = Math.max(moverLength, anchorLength);
    if (!Number.isFinite(longest) || longest <= 0) return false;
    if (Math.abs(moverLength - anchorLength) > tolerance * longest) return false;
  }
  return true;
}
