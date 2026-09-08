import { describe, expect, it } from 'vitest';
import { cubicTo, lineTo, moveTo, quadTo } from '../model';
import { closePath } from '../model';
import { vec2 } from '../model';
import type { Piece } from '../model';
import {
  applyGrainlineUVs,
  marksGeometry,
  pieceExtents,
  pieceOutlineGeometry,
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

describe('applyGrainlineUVs', () => {
  function rectPiece(angle: number): Piece {
    return {
      id: 'r',
      name: 'Rect',
      outline: rectPath(40, 28),
      internal: [],
      grainline: { angle, placement: vec2(0, 0) },
      seamAllowance: 0,
      cutCount: 1,
    };
  }

  it('leaves UVs untouched at grainline angle 0', () => {
    const piece = rectPiece(0);
    const geometry = pieceOutlineGeometry(piece);
    const before = geometry.getAttribute('uv').clone();
    applyGrainlineUVs(geometry, piece);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(before.getX(i), 9);
      expect(uv.getY(i)).toBeCloseTo(before.getY(i), 9);
    }
  });

  it('rotates UVs by −grainline angle: exact 90° mapping', () => {
    const piece = rectPiece(90);
    const geometry = pieceOutlineGeometry(piece);
    // ShapeGeometry UVs are the shape coordinates themselves (cm).
    const uv0 = geometry.getAttribute('uv').clone();
    applyGrainlineUVs(geometry, piece);
    const uv = geometry.getAttribute('uv');

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < uv0.count; i++) {
      minX = Math.min(minX, uv0.getX(i));
      minY = Math.min(minY, uv0.getY(i));
      maxX = Math.max(maxX, uv0.getX(i));
      maxY = Math.max(maxY, uv0.getY(i));
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    for (let i = 0; i < uv.count; i++) {
      // R(−90°)(d) = (dy, −dx): warp axis lands on the +y grain.
      expect(uv.getX(i)).toBeCloseTo(cx + (uv0.getY(i) - cy), 9);
      expect(uv.getY(i)).toBeCloseTo(cy - (uv0.getX(i) - cx), 9);
    }
  });

  it('is a sign-correct rotation for an off-axis grain (37°)', () => {
    const theta = 37;
    const piece = rectPiece(theta);
    const geometry = pieceOutlineGeometry(piece);
    const uv0 = geometry.getAttribute('uv').clone();
    applyGrainlineUVs(geometry, piece);
    const uv = geometry.getAttribute('uv');
    const pos = geometry.getAttribute('position');

    // uv bbox centre (the rotation centre).
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < uv0.count; i++) {
      minX = Math.min(minX, uv0.getX(i));
      minY = Math.min(minY, uv0.getY(i));
      maxX = Math.max(maxX, uv0.getX(i));
      maxY = Math.max(maxY, uv0.getY(i));
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // Semantic property of the lock: piece point p samples the texture at
    // uv' = R(−θ)(p − c) + c, so a texture-space step along +u (the warp /
    // stripe direction) lands in piece space at θ° CCW from +x — the
    // grainline. Rotating each uv' back by +θ must recover the position:
    // pos − c = R(θ)·(uv' − c).
    const rad = (theta * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    for (let i = 0; i < uv.count; i++) {
      const ux = uv.getX(i) - cx;
      const uy = uv.getY(i) - cy;
      // UVs are Float32, so the round-trip carries ~1e-7 cm of noise.
      expect(pos.getX(i)).toBeCloseTo(cx + ux * cos - uy * sin, 4);
      expect(pos.getY(i)).toBeCloseTo(cy + ux * sin + uy * cos, 4);
    }
  });

  it('throws on geometry without a uv attribute', () => {
    const piece = rectPiece(0);
    const geometry = pieceOutlineGeometry(piece);
    geometry.deleteAttribute('uv');
    expect(() => applyGrainlineUVs(geometry, piece)).toThrow(/no uv attribute/);
  });
});
