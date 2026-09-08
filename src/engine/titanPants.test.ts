import { describe, expect, it } from 'vitest';
import type { Piece } from '../model';
import { createPiece } from '../model';
import { pieceExtents } from '../view/pieceGeometry';
import { TITAN_PANTS_TEMPLATE } from './titanSettings';
import type { PantMeasurements } from './titanSettings';
import { draftTitanPantsSvg, redraftPants } from './titanPants';

const measurements = (overrides: Partial<PantMeasurements>): PantMeasurements => ({
  ...TITAN_PANTS_TEMPLATE,
  ...overrides,
});

/** Height/width of a piece in cm, from the same sampling the renderer uses. */
function sizeCm(piece: Piece): { width: number; height: number } {
  const e = pieceExtents(piece);
  return { width: e.width, height: e.height };
}

function outlineYs(piece: Piece): number[] {
  return piece.outline.flatMap((cmd) => {
    switch (cmd.type) {
      case 'M':
      case 'L':
        return [cmd.point.y];
      case 'C':
        return [cmd.point.y, cmd.control1.y, cmd.control2.y];
      case 'Q':
        return [cmd.point.y, cmd.control.y];
      case 'Z':
        return [];
    }
  });
}

describe('draftTitanPantsSvg', () => {
  it('renders a deterministic SVG for identical inputs', () => {
    const a = draftTitanPantsSvg(TITAN_PANTS_TEMPLATE);
    const b = draftTitanPantsSvg(TITAN_PANTS_TEMPLATE);
    expect(a).toBe(b);
  });

  it('produces a different draft when a measurement changes', () => {
    const a = draftTitanPantsSvg(TITAN_PANTS_TEMPLATE);
    const b = draftTitanPantsSvg(measurements({ inseamCm: 60 }));
    expect(a).not.toBe(b);
  });
});

describe('redraftPants', () => {
  it('yields the two Titan legs as valid domain pieces', () => {
    const pieces = redraftPants(TITAN_PANTS_TEMPLATE);
    expect(pieces.map((p) => p.id)).toEqual(['pants-front', 'pants-back']);
    expect(pieces.map((p) => p.name)).toEqual(['Front leg', 'Back leg']);
    for (const piece of pieces) {
      // createPiece re-validates: closed outline, finite coords, positive
      // cut count — the adapter output must satisfy the domain invariants.
      expect(() => createPiece(piece)).not.toThrow();
      expect(piece.cutCount).toBe(2);
      expect(piece.seamAllowance).toBe(0);
    }
  });

  it('converts the draft from millimetres to centimetres (÷10)', () => {
    const pieces = redraftPants(TITAN_PANTS_TEMPLATE);
    for (const piece of pieces) {
      const { width, height } = sizeCm(piece);
      // A size-40 trouser leg is ~1.1–1.3 m long and ~25–45 cm wide —
      // centimetre-scale numbers prove the mm→cm conversion happened.
      expect(height).toBeGreaterThan(100);
      expect(height).toBeLessThan(130);
      expect(width).toBeGreaterThan(25);
      expect(width).toBeLessThan(45);
    }
  });

  it('flips Y so pieces run upward (hem at the most negative y)', () => {
    const pieces = redraftPants(TITAN_PANTS_TEMPLATE);
    for (const piece of pieces) {
      const ys = outlineYs(piece);
      expect(Math.max(...ys)).toBeGreaterThan(Math.min(...ys) + 100);
    }
  });

  it('is deterministic: same measurements, deeply equal pieces', () => {
    const a = redraftPants(TITAN_PANTS_TEMPLATE);
    const b = redraftPants(TITAN_PANTS_TEMPLATE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('visibly redrafts: inseam length moves the hem', () => {
    const before = redraftPants(TITAN_PANTS_TEMPLATE);
    const after = redraftPants(measurements({ inseamCm: 60 }));
    const frontBefore = sizeCm(before[0]).height;
    const frontAfter = sizeCm(after[0]).height;
    // 79 → 60 cm inseam shortens the piece by ~19 cm (lengthBonus pinned 0).
    expect(frontBefore - frontAfter).toBeCloseTo(19, 0);
  });

  it('visibly redrafts: hip girth widens the legs', () => {
    const before = sizeCm(redraftPants(TITAN_PANTS_TEMPLATE)[1]);
    const after = sizeCm(redraftPants(measurements({ hipCm: 125 }))[1]);
    expect(after.width).toBeGreaterThan(before.width);
  });

  it('visibly redrafts: lowering the rise drops the waistband edge', () => {
    const before = sizeCm(redraftPants(TITAN_PANTS_TEMPLATE)[0]);
    const after = sizeCm(redraftPants(measurements({ risePct: 40 }))[0]);
    // A lower-rise waistband starts further down the body: shorter piece.
    expect(after.height).toBeLessThan(before.height);
  });

  it('redrafts cleanly across the panel\'s full ranges', () => {
    const edge: PantMeasurements[] = [
      measurements({ waistCm: 60, hipCm: 75, inseamCm: 50 }),
      measurements({ waistCm: 140, hipCm: 160, inseamCm: 100 }),
      measurements({ risePct: 0, crotchDropPct: 15, kneeEasePct: 25 }),
      measurements({ risePct: 100, easePct: 10, waistEasePct: 10 }),
    ];
    for (const m of edge) {
      const pieces = redraftPants(m);
      expect(pieces).toHaveLength(2);
      for (const piece of pieces) {
        const { width, height } = sizeCm(piece);
        expect(Number.isFinite(width)).toBe(true);
        expect(Number.isFinite(height)).toBe(true);
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
      }
    }
  });

  it('carries a grainline mark inside the piece', () => {
    const pieces = redraftPants(TITAN_PANTS_TEMPLATE);
    for (const piece of pieces) {
      expect(piece.internal.length).toBeGreaterThan(0);
      expect(piece.grainline.angle).toBeGreaterThanOrEqual(0);
      expect(piece.grainline.angle).toBeLessThan(180);
      const e = pieceExtents(piece);
      expect(piece.grainline.placement.x).toBeGreaterThanOrEqual(e.minX);
      expect(piece.grainline.placement.x).toBeLessThanOrEqual(e.minX + e.width);
      expect(piece.grainline.placement.y).toBeGreaterThanOrEqual(e.minY);
      expect(piece.grainline.placement.y).toBeLessThanOrEqual(e.minY + e.height);
    }
  });

  it('rejects non-finite measurements instead of drafting NaN geometry', () => {
    // NaN cannot survive clamping, but a programmatic caller can still pass
    // one — the failure must be a thrown error, never empty geometry.
    const broken = { ...TITAN_PANTS_TEMPLATE, inseamCm: Number.NaN };
    expect(() => redraftPants(broken)).toThrow(/inseamCm must be finite/);
  });
});
