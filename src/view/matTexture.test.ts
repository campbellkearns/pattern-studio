import { describe, expect, it } from 'vitest';
import { MAT_TILE_CM, matGridLines } from './matTexture';

describe('matGridLines', () => {
  it('tiers the default 10 cm tile: 1 cm minor, 5 cm medium, 10 cm major', () => {
    const grid = matGridLines();
    expect(grid.major).toEqual([0, 10]);
    expect(grid.medium).toEqual([5]);
    expect(grid.minor).toEqual([1, 2, 3, 4, 6, 7, 8, 9]);
  });

  it('keeps every line in exactly one tier', () => {
    const grid = matGridLines();
    const all = [...grid.major, ...grid.medium, ...grid.minor];
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort((a, b) => a - b)).toEqual(
      Array.from({ length: MAT_TILE_CM + 1 }, (_, i) => i),
    );
  });

  it('honours a custom tier spec', () => {
    const grid = matGridLines({
      base: '#000000',
      minorEveryCm: 1,
      mediumEveryCm: 2,
      majorEveryCm: 4,
    });
    expect(grid.major).toEqual([0, 4, 8]);
    // 10 misses the major tier and falls to medium.
    expect(grid.medium).toEqual([2, 6, 10]);
    expect(grid.minor).toEqual([1, 3, 5, 7, 9]);
  });
});
