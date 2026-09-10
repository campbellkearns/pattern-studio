import { describe, expect, it } from 'vitest';
import { vec2 } from '../model';
import {
  ZIGZAG_AMPLITUDE_CM,
  stitchChainPoints,
  zigzagAlong,
} from './stitchGlyph';

/** A 10 cm straight chain along +x. */
const straightChain = [vec2(0, 0), vec2(10, 0)];

/** Signed distance of a point from the x-axis — the cross direction for
 * a chain running along +x. */
const crossOffset = (p: { x: number; y: number }): number => p.y;

describe('stitchChainPoints', () => {
  it('draws straight seams as the chain polyline itself', () => {
    expect(stitchChainPoints('straight', straightChain)).toBe(straightChain);
  });

  it('draws backstitch as the chain polyline — the dash material is the glyph', () => {
    expect(stitchChainPoints('backstitch', straightChain)).toBe(straightChain);
  });

  it('resamples zigzag seams into chevrons', () => {
    const glyph = stitchChainPoints('zigzag', straightChain);
    expect(glyph.length).toBeGreaterThan(2);
    expect(glyph).not.toBe(straightChain);
  });
});

describe('zigzagAlong', () => {
  it('keeps both endpoints on the seam', () => {
    const glyph = zigzagAlong(straightChain);
    expect(glyph[0]).toEqual(vec2(0, 0));
    expect(glyph[glyph.length - 1]).toEqual(vec2(10, 0));
  });

  it('alternates interior vertices across the chain', () => {
    const glyph = zigzagAlong(straightChain);
    const interior = glyph.slice(1, -1);
    expect(interior.length).toBeGreaterThanOrEqual(2);
    const signs = interior.map((p) => Math.sign(crossOffset(p)));
    for (let i = 1; i < signs.length; i++) {
      expect(signs[i]).toBe(-signs[i - 1]);
    }
  });

  it('offsets interior vertices by the amplitude', () => {
    for (const p of zigzagAlong(straightChain).slice(1, -1)) {
      expect(Math.abs(crossOffset(p))).toBeCloseTo(ZIGZAG_AMPLITUDE_CM, 6);
    }
  });

  it('spaces samples at the half-period along a straight chain', () => {
    const glyph = zigzagAlong(straightChain, 2, 0.5);
    // 10 cm at a 2 cm period → 5 periods → 10 half-period steps + endpoints.
    expect(glyph).toHaveLength(11);
  });

  it('tracks a curved chain without dividing by zero', () => {
    // A quarter-circle-ish chain: the arc-length sampler must follow it.
    const curved = [vec2(0, 0), vec2(3, 4), vec2(8, 6), vec2(14, 6)];
    const glyph = zigzagAlong(curved);
    expect(glyph[0]).toEqual(vec2(0, 0));
    expect(glyph[glyph.length - 1]).toEqual(vec2(14, 6));
    for (const p of glyph) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('returns degenerate chains unchanged', () => {
    const degenerate = [vec2(2, 2), vec2(2, 2)];
    expect(zigzagAlong(degenerate)).toEqual(degenerate);
    expect(zigzagAlong([vec2(1, 1)])).toEqual([vec2(1, 1)]);
  });
});
