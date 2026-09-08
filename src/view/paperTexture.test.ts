import { describe, expect, it } from 'vitest';
import { MAT_TILE_CM } from './matSurface';
import type { BoundsCm } from './matSurface';
import {
  PAPER_CROSS_EVERY_CM,
  PAPER_DOT_EVERY_CM,
  paperLabel,
  paperLabelPos,
  paperTileMarks,
} from './paperTexture';

describe('paperTileMarks', () => {
  it('pins the paper cadence to the mat ladder: dots at 5 cm, crosses at 10 cm', () => {
    // The spot-and-cross lattice must read as one system with the mat's
    // 1/5/10 grid — dots on the medium tier, crosses on the major tier.
    expect(PAPER_DOT_EVERY_CM).toBe(5);
    expect(PAPER_CROSS_EVERY_CM).toBe(MAT_TILE_CM);
  });

  it('stamps crosses at all four tile corners so repeats complete them', () => {
    const { crosses } = paperTileMarks();
    const t = PAPER_CROSS_EVERY_CM;
    expect(crosses).toEqual([
      [0, 0],
      [t, 0],
      [0, t],
      [t, t],
    ]);
  });

  it('stamps edge dots on both sides of each tile edge and the centre dot', () => {
    const { dots } = paperTileMarks();
    const t = PAPER_CROSS_EVERY_CM;
    const d = PAPER_DOT_EVERY_CM;
    expect(dots).toEqual([
      [0, d],
      [t, d],
      [d, 0],
      [d, t],
      [d, d],
    ]);
  });

  it('keeps every mark inside the tile', () => {
    const { crosses, dots } = paperTileMarks();
    for (const [x, y] of [...crosses, ...dots]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(PAPER_CROSS_EVERY_CM);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(PAPER_CROSS_EVERY_CM);
    }
  });
});

describe('paperLabel', () => {
  it('formats the roll’s rendered extent with its own dimensions', () => {
    const extent: BoundsCm = { minX: -4, maxX: 124.8, minY: 100, maxY: 172.75 };
    const label = paperLabel(extent);
    expect(label.text).toBe('128.8 × 72.8 cm');
    expect(label.sub).toBe('spot-and-cross pattern paper');
  });

  it('rounds to a tenth of a centimetre', () => {
    const label = paperLabel({ minX: 0, maxX: 100.05, minY: 0, maxY: 50 });
    expect(label.text).toBe('100.1 × 50 cm');
  });
});

describe('paperLabelPos', () => {
  it('centres across the roll, just inside its near edge', () => {
    const extent: BoundsCm = { minX: -4, maxX: 124.8, minY: 100, maxY: 172.75 };
    const pos = paperLabelPos(extent);
    expect(pos.xCm).toBeCloseTo(60.4, 6);
    // Overflow pieces fill from the mat's far edge outward — the label
    // hugs the near edge so it stays clear of them.
    expect(pos.yCm).toBeCloseTo(106, 6);
    expect(pos.yCm).toBeLessThan(extent.maxY);
  });
});
