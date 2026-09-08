import { describe, expect, it } from 'vitest';
import { cubicTo, lineTo, moveTo, quadTo } from '../model';
import { closePath } from '../model';
import { vec2 } from '../model';
import {
  marksGeometry,
  pieceExtents,
  shapeFromPathCmds,
} from './pieceGeometry';

function rectPath(width: number, height: number) {
  return [
    moveTo(vec2(0, 0)),
    lineTo(vec2(width, 0)),
    lineTo(vec2(width, height)),
    lineTo(vec2(0, height)),
    closePath(),
  ];
}

describe('shapeFromPathCmds', () => {
  it('builds a closed shape from a rectangle path', () => {
    const shape = shapeFromPathCmds(rectPath(10, 5));
    const points = shape.getPoints(1);
    expect(points.length).toBeGreaterThanOrEqual(4);
    expect(points[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('maps cubic and quadratic segments onto the shape', () => {
    const shape = shapeFromPathCmds([
      moveTo(vec2(0, 0)),
      cubicTo(vec2(2, 4), vec2(8, 4), vec2(10, 0)),
      quadTo(vec2(5, -3), vec2(0, 0)),
      closePath(),
    ]);
    const points = shape.getPoints(12);
    // Sampled points stay finite and within the control hull.
    for (const p of points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.y).toBeLessThanOrEqual(4.01);
    }
  });
});

describe('pieceExtents', () => {
  it('returns the axis-aligned bounding box in centimetres', () => {
    const piece = {
      id: 'r',
      name: 'Rect',
      outline: rectPath(40, 28),
      internal: [],
      grainline: { angle: 0, placement: vec2(0, 0) },
      seamAllowance: 0,
      cutCount: 1,
    } as const;
    const extents = pieceExtents(piece);
    expect(extents.width).toBeCloseTo(40, 3);
    expect(extents.height).toBeCloseTo(28, 3);
    expect(extents.minX).toBeCloseTo(0, 3);
    expect(extents.minY).toBeCloseTo(0, 3);
  });

  it('samples curves rather than trusting control points', () => {
    // Control point reaches x=100 but the curve itself never does.
    const cmds = [
      moveTo(vec2(0, 0)),
      quadTo(vec2(100, 0), vec2(10, 0)),
      closePath(),
    ];
    const shape = shapeFromPathCmds(cmds);
    const points = shape.getPoints(24);
    let maxX = -Infinity;
    for (const p of points) maxX = Math.max(maxX, p.x);
    expect(maxX).toBeGreaterThan(10); // curve bulges past its endpoint
    expect(maxX).toBeLessThan(100); // but far short of the control point
  });
});

describe('marksGeometry', () => {
  it('emits separate subpaths without phantom connecting lines', () => {
    // Two disconnected strokes: A→B and C→D.
    const geometry = marksGeometry([
      moveTo(vec2(0, 0)),
      lineTo(vec2(1, 0)),
      moveTo(vec2(5, 5)),
      lineTo(vec2(6, 5)),
    ]);
    const positions = geometry.getAttribute('position');
    // 2 segments × 2 vertices × 3 floats = 12; a phantom B→C line would
    // push this to 18.
    expect(positions.count).toBe(4);
    const seen = new Set<string>();
    for (let i = 0; i < positions.count; i++) {
      seen.add(`${positions.getX(i)},${positions.getY(i)}`);
    }
    expect(seen).toEqual(new Set(['0,0', '1,0', '5,5', '6,5']));
  });

  it('samples quadratics at 8 subdivisions', () => {
    const geometry = marksGeometry([
      moveTo(vec2(0, 0)),
      quadTo(vec2(5, 5), vec2(10, 0)),
    ]);
    // 1 start point + 8 samples = 9 points → 8 segments → 16 vertices.
    expect(geometry.getAttribute('position').count).toBe(16);
  });

  it('samples cubics at 12 subdivisions', () => {
    const geometry = marksGeometry([
      moveTo(vec2(0, 0)),
      cubicTo(vec2(5, 5), vec2(5, -5), vec2(10, 0)),
    ]);
    // 1 start point + 12 samples = 13 points → 12 segments → 24 vertices.
    expect(geometry.getAttribute('position').count).toBe(24);
  });
});
