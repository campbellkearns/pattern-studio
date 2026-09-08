import { describe, expect, it } from 'vitest';
import {
  MAT_DEPTH_CM,
  MAT_TILE_CM,
  MAT_WIDTH_CM,
  PAPER_MARGIN_CM,
  paperBoundsCm,
  workBoundsCm,
} from './matSurface';

describe('mat surface constants', () => {
  it('pins the fixed reference mat the whole app leans on', () => {
    expect(MAT_WIDTH_CM).toBe(150);
    expect(MAT_DEPTH_CM).toBe(100);
    expect(MAT_TILE_CM).toBe(10);
  });
});

describe('workBoundsCm', () => {
  it('returns null for an empty project', () => {
    expect(workBoundsCm([])).toBeNull();
  });

  it('is the piece box itself for a single piece', () => {
    expect(
      workBoundsCm([{ xCm: 6, yCm: 6, widthCm: 76, heightCm: 121 }]),
    ).toEqual({ minX: 6, minY: 6, maxX: 82, maxY: 127 });
  });

  it('unions piece boxes into overall work bounds', () => {
    expect(
      workBoundsCm([
        { xCm: 6, yCm: 6, widthCm: 76, heightCm: 121 },
        { xCm: 88, yCm: 133, widthCm: 40, heightCm: 28 },
      ]),
    ).toEqual({ minX: 6, minY: 6, maxX: 128, maxY: 161 });
  });
});

describe('paperBoundsCm', () => {
  it('grows the work bounds by the paper margin on every side', () => {
    const work = { minX: 6, minY: 6, maxX: 128, maxY: 272 };
    const paper = paperBoundsCm(work);
    expect(paper.minX).toBe(work.minX - PAPER_MARGIN_CM);
    expect(paper.minY).toBe(work.minY - PAPER_MARGIN_CM);
    expect(paper.maxX).toBe(work.maxX + PAPER_MARGIN_CM);
    expect(paper.maxY).toBe(work.maxY + PAPER_MARGIN_CM);
  });
});
