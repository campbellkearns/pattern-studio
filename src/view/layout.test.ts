import { describe, expect, it } from 'vitest';
import { layoutOnMat, placementToWorld } from './layout';
import {
  paperBoundsCm,
  workBoundsCm,
  type BoundsCm,
} from './matSurface';

describe('layoutOnMat', () => {
  const opts = { gapCm: 5, matWidthCm: 100, matDepthCm: 100 };

  it('places pieces left to right in input order', () => {
    const result = layoutOnMat(
      [
        { id: 'a', widthCm: 20, heightCm: 10 },
        { id: 'b', widthCm: 20, heightCm: 10 },
      ],
      opts,
    );
    expect(result).toEqual([
      { id: 'a', xCm: 5, yCm: 5, surface: 'mat' },
      { id: 'b', xCm: 30, yCm: 5, surface: 'mat' },
    ]);
  });

  it('wraps to a new row when the next piece would cross the usable edge', () => {
    const result = layoutOnMat(
      [
        { id: 'a', widthCm: 45, heightCm: 10 },
        { id: 'b', widthCm: 45, heightCm: 10 },
        { id: 'c', widthCm: 20, heightCm: 12 },
      ],
      opts,
    );
    // b would end at 55 + 45 = 100 > 95 usable (mat minus trailing gap) →
    // b starts row 2 and c joins it.
    expect(result[0]).toEqual({ id: 'a', xCm: 5, yCm: 5, surface: 'mat' });
    expect(result[1]).toEqual({ id: 'b', xCm: 5, yCm: 20, surface: 'mat' });
    expect(result[2]).toEqual({ id: 'c', xCm: 55, yCm: 20, surface: 'mat' });
  });

  it('never overlaps pieces and keeps everything within mat bounds', () => {
    const result = layoutOnMat(
      Array.from({ length: 7 }, (_, i) => ({
        id: `p${i}`,
        widthCm: 30,
        heightCm: 18,
      })),
      opts,
    );
    const boxes = result.map((p) => ({
      x: p.xCm,
      y: p.yCm,
      w: 30,
      h: 18,
    }));
    for (const box of boxes) {
      expect(box.x + box.w).toBeLessThanOrEqual(100);
      expect(box.y).toBeGreaterThanOrEqual(0);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlaps =
          a.x < b.x + b.w &&
          b.x < a.x + a.w &&
          a.y < b.y + b.h &&
          b.y < a.y + a.h;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('is deterministic for the same input', () => {
    const inputs = [{ id: 'x', widthCm: 33, heightCm: 7 }];
    expect(layoutOnMat(inputs, opts)).toStrictEqual(layoutOnMat(inputs, opts));
  });
});

describe('depth budget', () => {
  // The 150 × 100 reference mat, gap 6 — and Titan-scale legs (~76 × 121)
  // whose first row alone crosses the mat's far edge.
  const pantsOpts = { gapCm: 6, matWidthCm: 150, matDepthCm: 100 };
  const leg = { id: 'front-leg', widthCm: 76, heightCm: 121 };

  it('prefers the mat: row 1 stays on the mat even when tall pieces cross the far edge', () => {
    const result = layoutOnMat([leg], pantsOpts);
    expect(result).toEqual([
      { id: 'front-leg', xCm: 6, yCm: 6, surface: 'mat' },
    ]);
    // 121 cm of leg on a 100 cm mat: the overrun belongs to the paper
    // surface by design (the paper-roll PR renders it).
    expect(result[0].yCm + 121).toBeGreaterThan(100);
  });

  it('lands row 2 on the paper once the depth budget is spent', () => {
    const result = layoutOnMat([leg, { ...leg, id: 'back-leg' }], pantsOpts);
    expect(result[0]).toEqual({
      id: 'front-leg',
      xCm: 6,
      yCm: 6,
      surface: 'mat',
    });
    expect(result[1]).toEqual({
      id: 'back-leg',
      xCm: 6,
      yCm: 133, // 6 + 121 + 6: the shelf grid continues past the far edge
      surface: 'paper',
    });
  });

  it('keeps every placement inside the declared surface bounds', () => {
    const inputs = [
      leg,
      { ...leg, id: 'back-leg' },
      { id: 'waistband', widthCm: 40, heightCm: 28 },
      { id: 'pocket', widthCm: 18, heightCm: 12 },
    ];
    const result = layoutOnMat(inputs, pantsOpts);

    const work = workBoundsCm(
      result.map((p) => {
        const size = inputs.find((i) => i.id === p.id);
        if (!size) throw new Error(`no size for piece ${p.id}`);
        return {
          xCm: p.xCm,
          yCm: p.yCm,
          widthCm: size.widthCm,
          heightCm: size.heightCm,
        };
      }),
    );
    if (!work) throw new Error('layout produced no work bounds');
    const paper = paperBoundsCm(work);
    const mat: BoundsCm = { minX: 0, minY: 0, maxX: 150, maxY: 100 };

    for (const placement of result) {
      const size = inputs.find((i) => i.id === placement.id);
      if (!size) throw new Error(`no size for piece ${placement.id}`);
      const box = {
        x: placement.xCm,
        y: placement.yCm,
        w: size.widthCm,
        h: size.heightCm,
      };
      const inside = (b: BoundsCm): boolean =>
        box.x >= b.minX &&
        box.y >= b.minY &&
        box.x + box.w <= b.maxX &&
        box.y + box.h <= b.maxY;
      // Nothing floats off all surfaces: each placement sits on the mat
      // or on the auto-extending paper.
      expect(inside(mat) || inside(paper)).toBe(true);
    }
  });

  it('is deterministic when overflow lands on paper', () => {
    const inputs = [
      leg,
      { ...leg, id: 'back-leg' },
      { id: 'waistband', widthCm: 40, heightCm: 28 },
      { id: 'pocket', widthCm: 18, heightCm: 12 },
    ];
    expect(layoutOnMat(inputs, pantsOpts)).toStrictEqual(
      layoutOnMat(inputs, pantsOpts),
    );
  });
});

describe('placementToWorld', () => {
  const MAT_W = 150;
  const MAT_D = 100;

  it('maps the mat centre onto the world origin', () => {
    const world = placementToWorld(
      { id: 'a', xCm: MAT_W / 2, yCm: MAT_D / 2, surface: 'mat' },
      MAT_W,
      MAT_D,
    );
    expect(world.xCm).toBe(0);
    expect(world.zCm).toBe(0);
  });

  it('maps the mat top-left corner to (−width/2, +depth/2)', () => {
    const world = placementToWorld(
      { id: 'a', xCm: 0, yCm: 0, surface: 'mat' },
      MAT_W,
      MAT_D,
    );
    expect(world.xCm).toBe(-75);
    expect(world.zCm).toBe(50);
  });

  it('keeps laid-out pieces on the origin-centred mat', () => {
    const placements = layoutOnMat(
      [
        { id: 'cover', widthCm: 40, heightCm: 28 },
        { id: 'flap', widthCm: 40, heightCm: 14 },
        { id: 'pocket', widthCm: 18, heightCm: 12 },
      ],
      { gapCm: 6, matWidthCm: MAT_W, matDepthCm: MAT_D },
    );
    for (const p of placements) {
      const w = placementToWorld(p, MAT_W, MAT_D);
      // Min-corner must sit inside the centred mat extents.
      expect(Math.abs(w.xCm)).toBeLessThanOrEqual(MAT_W / 2);
      expect(Math.abs(w.zCm)).toBeLessThanOrEqual(MAT_D / 2);
    }
  });
});
