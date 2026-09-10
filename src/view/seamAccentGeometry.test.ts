/**
 * Accent-geometry update contract (UX-12 regression): three's
 * BufferGeometry.setFromPoints updates an existing position attribute in
 * place, capped at its previous vertex count, so re-pointing one line at
 * a longer polyline silently truncates it (35-point zigzag onto a
 * 2-point straight chain rendered as a stub). applyLinePoints must swap
 * the attribute whenever the count changes.
 */
import { describe, expect, it } from 'vitest';
import { BufferGeometry, Vector3 } from 'three';
import { applyLinePoints } from './seamAccentGeometry';

const line = (xs: number[]): Vector3[] =>
  xs.map((x) => new Vector3(x, 0, -1));

describe('applyLinePoints', () => {
  it('grows a previously shorter attribute instead of truncating', () => {
    const geometry = new BufferGeometry().setFromPoints(line([0, 1]));
    expect(geometry.getAttribute('position').count).toBe(2);

    applyLinePoints(geometry, line([0, 0.5, 1, 1.5, 2]));

    const position = geometry.getAttribute('position');
    expect(position.count).toBe(5);
    expect(Array.from(position.array)).toEqual([
      0, 0, -1, 0.5, 0, -1, 1, 0, -1, 1.5, 0, -1, 2, 0, -1,
    ]);
  });

  it('shrinks a previously longer attribute', () => {
    const geometry = new BufferGeometry().setFromPoints(line([0, 0.5, 1]));
    applyLinePoints(geometry, line([0, 1]));

    expect(geometry.getAttribute('position').count).toBe(2);
    expect(Array.from(geometry.getAttribute('position').array)).toEqual([
      0, 0, -1, 1, 0, -1,
    ]);
  });

  it('updates in place when the count is unchanged', () => {
    const geometry = new BufferGeometry().setFromPoints(line([0, 2]));
    const before = geometry.getAttribute('position');

    applyLinePoints(geometry, line([0, 3]));

    expect(geometry.getAttribute('position')).toBe(before);
    expect(Array.from(before.array)).toEqual([0, 0, -1, 3, 0, -1]);
  });

  it('seeds a geometry with no position attribute', () => {
    const geometry = new BufferGeometry();

    applyLinePoints(geometry, line([0, 1, 2]));

    expect(geometry.getAttribute('position').count).toBe(3);
  });

  it('clears cached bounds so a longer line is not frustum-culled', () => {
    const geometry = new BufferGeometry().setFromPoints(line([0, 1]));
    geometry.computeBoundingSphere();
    expect(geometry.boundingSphere).not.toBeNull();

    applyLinePoints(geometry, line([0, 5, 10]));

    expect(geometry.boundingSphere).toBeNull();
    expect(geometry.boundingBox).toBeNull();
  });
});
