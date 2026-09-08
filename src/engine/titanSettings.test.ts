import { describe, expect, it } from 'vitest';
import { cisMaleAdult40 } from '@freesewing/models';
import {
  PANT_MEASUREMENT_RANGES,
  TITAN_PANTS_TEMPLATE,
  clampMeasurements,
  toTitanSettings,
} from './titanSettings';
import type { PantMeasurements } from './titanSettings';

const measurements = (overrides: Partial<PantMeasurements>): PantMeasurements => ({
  ...TITAN_PANTS_TEMPLATE,
  ...overrides,
});

describe('PANT_MEASUREMENT_RANGES', () => {
  it('caps the panel at the R3 limit of 8 fields', () => {
    expect(Object.keys(PANT_MEASUREMENT_RANGES)).toHaveLength(8);
  });

  it('option ranges come from Titan\'s own option definitions', () => {
    // Titan back.mjs: waistEase/seatEase 0–10, kneeEase 1–25,
    // waistHeight 0–100, crotchDrop 0–15.
    expect(PANT_MEASUREMENT_RANGES.easePct).toEqual({ min: 0, max: 10, step: 0.5 });
    expect(PANT_MEASUREMENT_RANGES.kneeEasePct).toEqual({ min: 1, max: 25, step: 1 });
    expect(PANT_MEASUREMENT_RANGES.risePct).toEqual({ min: 0, max: 100, step: 5 });
    expect(PANT_MEASUREMENT_RANGES.crotchDropPct).toEqual({ min: 0, max: 15, step: 1 });
  });
});

describe('toTitanSettings', () => {
  it('converts panel centimetres to Titan millimetres', () => {
    const { measurements: mm } = toTitanSettings(
      measurements({ waistCm: 84.6, hipCm: 105.2, inseamCm: 79 }),
    );
    expect(mm.waist).toBe(846);
    expect(mm.seat).toBe(1052);
    // 79 cm = 790 mm, added below the fork (depth derived below).
    expect(mm.waistToFloor).toBeGreaterThan(790);
  });

  it('converts panel percents to Titan option fractions', () => {
    const { options } = toTitanSettings(
      measurements({ risePct: 100, easePct: 2, crotchDropPct: 5, kneeEasePct: 6 }),
    );
    expect(options.waistHeight).toBe(1);
    expect(options.seatEase).toBe(0.02);
    expect(options.crotchDrop).toBe(0.05);
    expect(options.kneeEase).toBe(0.06);
  });

  it('template defaults match Titan\'s published option defaults', () => {
    const { options } = toTitanSettings(TITAN_PANTS_TEMPLATE);
    expect(options).toEqual({
      waistHeight: 1,
      crotchDrop: 0.02,
      seatEase: 0.02,
      waistEase: 0.02,
      kneeEase: 0.06,
      // Inseam is delivered exactly through waistToFloor — lengthBonus pinned.
      lengthBonus: 0,
    });
  });

  it('never passes the fitCrossSeam*/fitKnee options (spike gotcha 2)', () => {
    const { options } = toTitanSettings(TITAN_PANTS_TEMPLATE);
    for (const key of Object.keys(options)) {
      expect(key.startsWith('fitCrossSeam') || key === 'fitKnee').toBe(false);
    }
  });

  it('derives crotch depth from the body model scaled by crotchDrop', () => {
    const { derived } = toTitanSettings(measurements({ crotchDropPct: 2 }));
    expect(derived.forkDepthMm).toBeCloseTo(cisMaleAdult40.waistToUpperLeg * 1.02, 6);
  });

  it('sits the hem exactly one inseam below the fork', () => {
    const { derived, measurements: mm } = toTitanSettings(
      measurements({ inseamCm: 79, crotchDropPct: 2 }),
    );
    expect(mm.waistToFloor).toBeCloseTo(derived.forkDepthMm + 790, 6);
  });

  it('keeps the knee proportional along the leg for any inseam', () => {
    const long = toTitanSettings(measurements({ inseamCm: 100 }));
    const short = toTitanSettings(measurements({ inseamCm: 50 }));
    const ratio = (m: ReturnType<typeof toTitanSettings>): number => {
      const leg = m.derived.waistToFloorMm - m.derived.forkDepthMm;
      return (m.measurements.waistToKnee - m.derived.forkDepthMm) / leg;
    };
    expect(ratio(long)).toBeCloseTo(ratio(short), 9);
    // Knee must sit above the hem.
    expect(long.measurements.waistToKnee).toBeLessThan(long.derived.waistToFloorMm);
  });

  it('clamps out-of-range values into the field ranges', () => {
    const clamped = clampMeasurements(
      measurements({
        risePct: 150,
        easePct: -5,
        kneeEasePct: 0.5,
        waistCm: 1000,
        inseamCm: 10,
        crotchDropPct: 99,
        waistEasePct: 42,
        hipCm: 20,
      }),
    );
    expect(clamped.risePct).toBe(100);
    expect(clamped.easePct).toBe(0);
    expect(clamped.kneeEasePct).toBe(1);
    expect(clamped.waistCm).toBe(140);
    expect(clamped.inseamCm).toBe(50);
    expect(clamped.crotchDropPct).toBe(15);
    expect(clamped.waistEasePct).toBe(10);
    expect(clamped.hipCm).toBe(75);
  });

  it('rejects non-finite input instead of drafting NaN geometry', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() =>
        clampMeasurements(measurements({ waistCm: bad })),
      ).toThrow(/waistCm must be finite/);
    }
  });
});
