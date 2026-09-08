import { describe, expect, it } from 'vitest';
import { add, distance, rotate, scale, vec2 } from './vec2';

describe('vec2 (centimetres)', () => {
  it('rejects non-finite coordinates', () => {
    expect(() => vec2(Number.NaN, 0)).toThrow(/finite/);
    expect(() => vec2(0, Number.POSITIVE_INFINITY)).toThrow(/finite/);
  });

  it('adds component-wise', () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual({ x: 4, y: 6 });
  });

  it('scales by a factor', () => {
    expect(scale(vec2(2, 3), 2)).toEqual({ x: 4, y: 6 });
    expect(scale(vec2(2, 3), 0)).toEqual({ x: 0, y: 0 });
    expect(scale(vec2(2, 3), -1)).toEqual({ x: -2, y: -3 });
  });

  it('rotates counterclockwise by degrees', () => {
    expect(rotate(vec2(3, 0), 90).x).toBeCloseTo(0);
    expect(rotate(vec2(3, 0), 90).y).toBeCloseTo(3);
    expect(rotate(vec2(1, 0), 45).x).toBeCloseTo(Math.SQRT1_2);
    expect(rotate(vec2(1, 0), 45).y).toBeCloseTo(Math.SQRT1_2);
  });

  it('treats negative angles as clockwise and 360° as a full turn', () => {
    expect(rotate(vec2(0, 1), -90).x).toBeCloseTo(1);
    expect(rotate(vec2(0, 1), -90).y).toBeCloseTo(0);
    expect(rotate(vec2(1, 0), 360).x).toBeCloseTo(1);
    expect(rotate(vec2(1, 0), 360).y).toBeCloseTo(0);
  });

  it('measures euclidean distance in centimetres', () => {
    expect(distance(vec2(0, 0), vec2(3, 4))).toBeCloseTo(5);
    expect(distance(vec2(2, 5), vec2(2, 5))).toBe(0);
  });
});
