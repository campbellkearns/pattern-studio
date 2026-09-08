import { describe, expect, it } from 'vitest';
import { layoutOnMat } from './layout';

describe('layoutOnMat', () => {
  const opts = { gapCm: 5, matWidthCm: 100 };

  it('places pieces left to right in input order', () => {
    const result = layoutOnMat(
      [
        { id: 'a', widthCm: 20, heightCm: 10 },
        { id: 'b', widthCm: 20, heightCm: 10 },
      ],
      opts,
    );
    expect(result).toEqual([
      { id: 'a', xCm: 5, yCm: 5 },
      { id: 'b', xCm: 30, yCm: 5 },
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
    expect(result[0]).toEqual({ id: 'a', xCm: 5, yCm: 5 });
    expect(result[1]).toEqual({ id: 'b', xCm: 5, yCm: 20 });
    expect(result[2]).toEqual({ id: 'c', xCm: 55, yCm: 20 });
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
