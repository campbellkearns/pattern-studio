import { describe, expect, it } from 'vitest';
import {
  MAT_DEPTH_CM,
  MAT_TILE_CM,
  MAT_WIDTH_CM,
  PAPER_MARGIN_CM,
  PAPER_SURFACE_Y_CM,
  MAT_SURFACE_Y_CM,
  paperBoundsCm,
  paperSurfaceExtentCm,
  surfaceHeightCm,
  workBoundsCm,
  workOverflowsMat,
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

describe('workOverflowsMat', () => {
  it('is false when there is no work', () => {
    expect(workOverflowsMat(null)).toBe(false);
  });

  it('is false while the work sits inside the mat, edge included', () => {
    expect(workOverflowsMat({ minX: 6, minY: 6, maxX: 82, maxY: 100 })).toBe(
      false,
    );
  });

  it('is true when the work crosses the mat’s far edge onto the paper', () => {
    expect(workOverflowsMat({ minX: 6, minY: 6, maxX: 82, maxY: 127 })).toBe(
      true,
    );
  });

  it('is true on any side overflow, not just the far edge', () => {
    expect(
      workOverflowsMat({
        minX: 0,
        minY: 0,
        maxX: MAT_WIDTH_CM + 1,
        maxY: 50,
      }),
    ).toBe(true);
    expect(workOverflowsMat({ minX: -2, minY: 0, maxX: 40, maxY: 50 })).toBe(
      true,
    );
    expect(workOverflowsMat({ minX: 0, minY: -2, maxX: 40, maxY: 50 })).toBe(
      true,
    );
  });
});

describe('surfaceHeightCm', () => {
  it('keeps the mat at the world floor and the paper a step below', () => {
    expect(MAT_SURFACE_Y_CM).toBe(0);
    expect(PAPER_SURFACE_Y_CM).toBe(-0.15);
    expect(surfaceHeightCm('mat')).toBe(MAT_SURFACE_Y_CM);
    expect(surfaceHeightCm('paper')).toBe(PAPER_SURFACE_Y_CM);
  });
});

describe('paperSurfaceExtentCm', () => {
  it('is a minimal apron beyond the far edge when there is no work', () => {
    expect(paperSurfaceExtentCm(null)).toEqual({
      minX: 0,
      minY: MAT_DEPTH_CM,
      maxX: MAT_WIDTH_CM,
      maxY: MAT_DEPTH_CM + PAPER_MARGIN_CM,
    });
  });

  it('starts at the mat’s far edge, never inside the mat', () => {
    const extent = paperSurfaceExtentCm({
      minX: 6,
      minY: 6,
      maxX: 82,
      maxY: 127,
    });
    expect(extent.minY).toBe(MAT_DEPTH_CM);
  });

  it('follows the paper bounds’ side margins and far side', () => {
    const work = { minX: 6, minY: 6, maxX: 82, maxY: 127 };
    const paper = paperBoundsCm(work);
    const extent = paperSurfaceExtentCm(work);
    expect(extent.minX).toBe(paper.minX);
    expect(extent.maxX).toBe(paper.maxX);
    expect(extent.maxY).toBe(paper.maxY);
  });

  it('keeps a minimal apron when the work fits inside the mat', () => {
    const extent = paperSurfaceExtentCm({
      minX: 10,
      minY: 10,
      maxX: 40,
      maxY: 60,
    });
    expect(extent.minY).toBe(MAT_DEPTH_CM);
    expect(extent.maxY).toBe(MAT_DEPTH_CM + PAPER_MARGIN_CM);
  });
});
