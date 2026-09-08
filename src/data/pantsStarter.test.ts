import { describe, expect, it } from 'vitest';
import { createPiece, pathVertexCount } from '../model';
import type { Piece } from '../model';
import type { PantMeasurements } from '../engine/titanSettings';
import {
  PANT_MEASUREMENT_RANGES,
  TITAN_PANTS_TEMPLATE,
} from '../engine/titanSettings';
import {
  BACK_CHAINS,
  FRONT_CHAINS,
  LEG_VERTEX_COUNT,
  outlineHeightCm,
  pantsAuxPieces,
  redraftPantsStarter,
} from './pantsStarter';
import { chainLength, outlineVertices } from './pantsGeometry';

function legOf(pieces: readonly Piece[], id: string): Piece {
  const leg = pieces.find((piece) => piece.id === id);
  if (!leg) throw new Error(`missing leg "${id}"`);
  return leg;
}

const STARTER_PIECES = redraftPantsStarter(TITAN_PANTS_TEMPLATE);
const LEGS = STARTER_PIECES.slice(0, 2);
const AUX = pantsAuxPieces(TITAN_PANTS_TEMPLATE);

/** Relative difference of two seam edges — real seams get eased, not equal. */
function lengthGap(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(a, b);
}

describe('pants leg edge anatomy', () => {
  const legs = LEGS;

  it('pins the 7-vertex leg anatomy the seam chains and aux sizing rely on', () => {
    for (const leg of legs) {
      expect(pathVertexCount(leg.outline)).toBe(LEG_VERTEX_COUNT);
    }
  });

  it('measures the two waist edges to about half the eased waist circumference', () => {
    const halfWaist =
      chainLength(legOf(legs, 'pants-front').outline, FRONT_CHAINS.waist) +
      chainLength(legOf(legs, 'pants-back').outline, BACK_CHAINS.waist);
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
    // The rise chains run waist-to-fork on both legs, but the front's is
    // nearly straight while the back's wraps the seat curve — chords diverge
    // well beyond a sewable tolerance. Keep only a gross-wrong-edge guard;
    // the outseam/inseam below carry the real equality signal.
    expect(
      lengthGap(
        chainLength(front.outline, FRONT_CHAINS.rise),
        chainLength(back.outline, BACK_CHAINS.rise),
      ),
    ).toBeLessThan(0.45);
    for (const seam of ['outseam', 'inseam'] as const) {
      expect(
        lengthGap(
          chainLength(front.outline, FRONT_CHAINS[seam]),
          chainLength(back.outline, BACK_CHAINS[seam]),
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
    const bandAfter = pantsAuxPieces(grown).find((p) => p.id === 'waistband')!;
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
    const frontWaist = chainLength(
      legOf(LEGS, 'pants-front').outline,
      FRONT_CHAINS.waist,
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
      const pieces = redraftPantsStarter(measurements);
      expect(pieces).toHaveLength(5);
      for (const piece of pieces) {
        expect(() => createPiece(piece)).not.toThrow();
      }
      // The named chains must stay in bounds at every extreme.
      const front = legOf(pieces, 'pants-front');
      const back = legOf(pieces, 'pants-back');
      for (const chain of Object.values(FRONT_CHAINS)) {
        expect(() => chainLength(front.outline, chain)).not.toThrow();
      }
      for (const chain of Object.values(BACK_CHAINS)) {
        expect(() => chainLength(back.outline, chain)).not.toThrow();
      }
    }
  });

  it('moves the legs when measurements move (front tracks the adapter)', () => {
    const before = legOf(
      redraftPantsStarter(TITAN_PANTS_TEMPLATE),
      'pants-front',
    );
    const after = legOf(
      redraftPantsStarter({
        ...TITAN_PANTS_TEMPLATE,
        inseamCm: TITAN_PANTS_TEMPLATE.inseamCm - 10,
      }),
      'pants-front',
    );
    expect(outlineHeightCm(after.outline)).toBeLessThan(
      outlineHeightCm(before.outline) - 5,
    );
  });
});
