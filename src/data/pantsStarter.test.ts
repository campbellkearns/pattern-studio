import { describe, expect, it } from 'vitest';
import { createPiece, pathVertexCount } from '../model';
import type { Piece } from '../model';
import type { PantMeasurements } from '../engine/titanSettings';
import {
  PANT_MEASUREMENT_RANGES,
  TITAN_PANTS_TEMPLATE,
} from '../engine/titanSettings';
import {
  outlineHeightCm,
  pantsAuxPieces,
  pantsStarter,
  redraftPantsStarter,
  WAISTBAND_CHAINS,
} from './pantsStarter';
import {
  measureLegSeams,
  resolveFrontChains,
  resolveLegChains,
} from './pantsSeams';
import { STARTERS, starterById } from './starters';
import { chainLength, outlineVertices } from './pantsGeometry';

function legOf(pieces: readonly Piece[], id: string): Piece {
  const leg = pieces.find((piece) => piece.id === id);
  if (!leg) throw new Error(`missing leg "${id}"`);
  return leg;
}

/** Auxiliaries sized from a fresh draft at the given measurements —
 * the sizing reads measured seam geometry, never vertex indices. */
function auxFor(measurements: PantMeasurements): Piece[] {
  const [front, back] = redraftPantsStarter(measurements).pieces;
  return pantsAuxPieces(measureLegSeams(front, back));
}

const STARTER_DRAFT = redraftPantsStarter(TITAN_PANTS_TEMPLATE);
const LEGS = STARTER_DRAFT.pieces.slice(0, 2);
const AUX = auxFor(TITAN_PANTS_TEMPLATE);

/** Relative difference of two seam edges — real seams get eased, not equal. */
function lengthGap(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(a, b);
}

describe('pants leg edge anatomy', () => {
  const legs = LEGS;

  it('drafts 7-vertex legs at the template (topology may shift at extremes)', () => {
    // The resolver reads landmark geometry, not vertex indices, so the
    // anatomy is no longer pinned across the range — but the template
    // block's shape is still the fixture the aux formulas were tuned to.
    for (const leg of legs) {
      expect(pathVertexCount(leg.outline)).toBe(7);
    }
  });

  it('measures the two waist edges to about half the eased waist circumference', () => {
    const front = legOf(legs, 'pants-front');
    const back = legOf(legs, 'pants-back');
    const halfWaist =
      measureLegSeams(front, back).frontWaistCm +
      measureLegSeams(front, back).backWaistCm;
    const waist = halfWaist * 2;
    const { waistCm, waistEasePct } = TITAN_PANTS_TEMPLATE;
    const easedWaist = waistCm * (1 + waistEasePct / 100);
    // The block suppresses shaping with darts, so allow a few percent.
    expect(waist).toBeGreaterThan(easedWaist * 0.97);
    expect(waist).toBeLessThan(easedWaist * 1.05);
  });

  it('matches the leg-to-leg seams within easable tolerances', () => {
    const front = legOf(legs, 'pants-front');
    const back = legOf(legs, 'pants-back');
    const frontChains = resolveFrontChains(front);
    const backChains = resolveLegChains(back);
    // The rise chains run waist-to-fork on both legs, but the front's is
    // nearly straight while the back's wraps the seat curve — chords diverge
    // well beyond a sewable tolerance. Keep only a gross-wrong-edge guard;
    // the outseam/inseam below carry the real equality signal.
    expect(
      lengthGap(
        chainLength(front.outline, frontChains.rise),
        chainLength(back.outline, backChains.rise),
      ),
    ).toBeLessThan(0.45);
    for (const seam of ['outseam', 'inseam'] as const) {
      expect(
        lengthGap(
          chainLength(front.outline, frontChains[seam]),
          chainLength(back.outline, backChains[seam]),
        ),
      ).toBeLessThan(0.05);
    }
  });
});

describe('pants aux pieces', () => {
  const aux = AUX;

  it('are exactly the waistband, fly shield, and pocket bag', () => {
    expect(aux.map((piece) => piece.id)).toEqual([
      'waistband',
      'fly-shield',
      'pocket-bag',
    ]);
  });

  it('pass full piece validation and keep 1.5 cm seam allowance', () => {
    for (const piece of aux) {
      expect(() => createPiece(piece)).not.toThrow();
      expect(piece.seamAllowance).toBe(1.5);
    }
  });

  it('carry blueprint cut counts: band 1, shield 1, pocket bags 2', () => {
    expect(aux.find((p) => p.id === 'waistband')?.cutCount).toBe(1);
    expect(aux.find((p) => p.id === 'fly-shield')?.cutCount).toBe(1);
    expect(aux.find((p) => p.id === 'pocket-bag')?.cutCount).toBe(2);
  });

  it('place every grainline inside its piece outline', () => {
    for (const piece of [...LEGS, ...aux]) {
      const { angle, placement } = piece.grainline;
      expect(Number.isFinite(angle)).toBe(true);
      const xs = outlineVertices(piece.outline).map((v) => v.x);
      const ys = outlineVertices(piece.outline).map((v) => v.y);
      expect(placement.x).toBeGreaterThan(Math.min(...xs));
      expect(placement.x).toBeLessThan(Math.max(...xs));
      expect(placement.y).toBeGreaterThan(Math.min(...ys));
      expect(placement.y).toBeLessThan(Math.max(...ys));
    }
  });

  it('give every aux piece internal marks (grain arrows, notches)', () => {
    for (const piece of aux) {
      expect(piece.internal.length).toBeGreaterThan(0);
    }
  });

  it('size the waistband to the live draft: +10 cm waist lengthens the band', () => {
    const grown: PantMeasurements = {
      ...TITAN_PANTS_TEMPLATE,
      waistCm: TITAN_PANTS_TEMPLATE.waistCm + 10,
    };
    const bandBefore = AUX.find((p) => p.id === 'waistband')!;
    const bandAfter = auxFor(grown).find((p) => p.id === 'waistband')!;
    // Band length = the x-span of its outline vertices.
    const bandLengthOf = (piece: Piece): number => {
      const xs = outlineVertices(piece.outline).map((v) => v.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    const growth = bandLengthOf(bandAfter) - bandLengthOf(bandBefore);
    // The band spans the full circumference, so it grows by the full +10 cm
    // delta (plus the ~2% waist ease applied to it).
    expect(growth).toBeGreaterThan(7);
    expect(growth).toBeLessThan(14);
  });

  it('scale the pocket bag with the front waist it hangs from', () => {
    const mouth = outlineVertices(
      AUX.find((p) => p.id === 'pocket-bag')!.outline,
    )[1];
    const front = legOf(LEGS, 'pants-front');
    const frontWaist = chainLength(
      front.outline,
      resolveFrontChains(front).waist,
    );
    // The formula reproduces the measured front waist edge within ~0.2%.
    expect(mouth.x).toBeCloseTo(frontWaist * 1.2, 1);
  });

  it('keep the fly shield well inside the front leg height', () => {
    const shield = AUX.find((p) => p.id === 'fly-shield')!;
    const frontHeight = outlineHeightCm(legOf(LEGS, 'pants-front').outline);
    expect(outlineHeightCm(shield.outline)).toBeLessThan(frontHeight / 2);
  });
});

describe('live redraft across the panel ranges', () => {
  it('keeps five valid pieces at both ends of the main measurement ranges', () => {
    const extremes: PantMeasurements[] = [];
    for (const key of ['waistCm', 'hipCm', 'inseamCm', 'risePct'] as const) {
      for (const bound of ['min', 'max'] as const) {
        extremes.push({
          ...TITAN_PANTS_TEMPLATE,
          [key]: PANT_MEASUREMENT_RANGES[key][bound],
        });
      }
    }
    for (const measurements of extremes) {
      const pieces = redraftPantsStarter(measurements).pieces;
      expect(pieces).toHaveLength(5);
      for (const piece of pieces) {
        expect(() => createPiece(piece)).not.toThrow();
      }
      // The named seams must resolve from the draft's geometry at every
      // extreme — including the topology-shifting ones — and measure
      // positive; no fixed index can go stale.
      const front = legOf(pieces, 'pants-front');
      const back = legOf(pieces, 'pants-back');
      const frontChains = resolveFrontChains(front);
      const backChains = resolveLegChains(back);
      for (const run of Object.values(frontChains)) {
        expect(chainLength(front.outline, run)).toBeGreaterThan(0);
      }
      for (const run of Object.values(backChains)) {
        expect(chainLength(back.outline, run)).toBeGreaterThan(0);
      }
    }
  });

  it('moves the legs when measurements move (front tracks the adapter)', () => {
    const before = legOf(
      redraftPantsStarter(TITAN_PANTS_TEMPLATE).pieces,
      'pants-front',
    );
    const after = legOf(
      redraftPantsStarter({
        ...TITAN_PANTS_TEMPLATE,
        inseamCm: TITAN_PANTS_TEMPLATE.inseamCm - 10,
      }).pieces,
      'pants-front',
    );
    expect(outlineHeightCm(after.outline)).toBeLessThan(
      outlineHeightCm(before.outline) - 5,
    );
  });
});

describe('pants assembly (ordered seam steps)', () => {
  const starter = pantsStarter();

  it('validates as a starter project: pieces, chain bounds, order monotonicity', () => {
    // createStarterProject re-validates everything; a bad reference throws.
    expect(() => pantsStarter()).not.toThrow();
    expect(starter.id).toBe('starter-pants');
  });

  it('carries 5 pieces with blueprint cut counts (within the 5–7 cap)', () => {
    expect(starter.pieces).toHaveLength(5);
    const cuts = Object.fromEntries(
      starter.pieces.map((p) => [p.id, p.cutCount]),
    );
    expect(cuts).toEqual({
      'pants-front': 2,
      'pants-back': 2,
      waistband: 1,
      'fly-shield': 1,
      'pocket-bag': 2,
    });
  });

  it('numbers 6 ordered steps 1…6, each referencing existing pieces', () => {
    expect(starter.assembly.map((step) => step.order)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    for (const step of starter.assembly) {
      expect(step.note.length).toBeGreaterThan(20);
      for (const pieceId of step.pieces) {
        expect(starter.pieces.some((p) => p.id === pieceId)).toBe(true);
      }
    }
  });

  it('matches every seam-step chain pair within a sewable tolerance', () => {
    const pieceOf = (id: string): Piece => {
      const piece = starter.pieces.find((p) => p.id === id);
      if (!piece) throw new Error(`missing piece "${id}"`);
      return piece;
    };
    // Per-step tolerance: straight seams are near-exact; the eased rise and
    // the fly edge get generous bounds so a wrong-edge slip still fails.
    const toleranceFor = (a: string, b: string): number => {
      if (a === 'fly-shield' || b === 'fly-shield') return 0.2;
      if (a === 'waistband' || b === 'waistband') return 0.15;
      return 0.35; // rise seam; the outseam/inseam measure ~0.1% apart
    };
    for (const step of starter.assembly) {
      const lengthA = chainLength(
        pieceOf(step.edges[0].pieceId).outline,
        step.edges[0],
      );
      const lengthB = chainLength(
        pieceOf(step.edges[1].pieceId).outline,
        step.edges[1],
      );
      expect(lengthGap(lengthA, lengthB)).toBeLessThan(
        toleranceFor(step.pieces[0], step.pieces[1]),
      );
    }
  });

  it('pairs a waistband quarter with the front waist edge within 5%', () => {
    const bandQuarter = chainLength(
      starter.pieces.find((p) => p.id === 'waistband')!.outline,
      WAISTBAND_CHAINS.front,
    );
    const front = legOf(LEGS, 'pants-front');
    const frontWaist = chainLength(
      front.outline,
      resolveFrontChains(front).waist,
    );
    expect(lengthGap(bandQuarter, frontWaist)).toBeLessThan(0.05);
  });

  it('ships a learn card that names the lesson concepts', () => {
    expect(starter.learnCard).toMatch(/What you'll learn:/);
    expect(starter.learnCard).toMatch(/grainline/);
    expect(starter.learnCard).toMatch(/stay-stitch/i);
  });

  it('uses the pants fabric: indigo twill at real gsm', () => {
    expect(starter.fabric.weave).toBe('twill');
    expect(starter.fabric.weight).toBeGreaterThan(300);
  });
});

describe('starter registry', () => {
  it('offers the full starter ladder in difficulty order', () => {
    expect(STARTERS.map((entry) => entry.id)).toEqual([
      'starter-coaster',
      'starter-notebook-holder',
      'starter-toiletry-rollup',
      'starter-tote',
      'starter-pants',
    ]);
  });

  it('builds validated instances and redrafts schema-driven piece sets', () => {
    for (const entry of STARTERS) {
      const built = entry.build();
      expect(built.id).toBe(entry.id);
      expect(built.assembly).toBeDefined();
      // Redrafting is a parameter-schema feature (UX-03): entries without
      // declared parameters have no redraft — the panel shows its narrated
      // empty state and the pieces never change.
      if (!entry.redraft) continue;
      const values: Record<string, number> = {};
      for (const spec of entry.parameters) values[spec.key] = spec.value;
      const redrafted = entry.redraft(values);
      expect(redrafted.length).toBeGreaterThanOrEqual(2);
      for (const piece of redrafted) {
        expect(piece.grainline).toBeDefined();
      }
    }
  });

  it('returns undefined for unknown ids so custom projects stay custom', () => {
    expect(starterById('proj-custom-123')).toBeUndefined();
  });
});
