/**
 * Model → three.js adapter: PathCmd streams (the domain's source of truth,
 * already centimetres) become THREE.Shape outlines and line geometry for
 * internal marks. Coordinates pass through untouched — 1 world unit = 1 cm
 * by contract; unit conversion belongs to engine boundaries (see
 * src/pipeline/svgShape.ts for the millimetre SVG side).
 */
import {
  BufferGeometry,
  Float32BufferAttribute,
  Shape,
  ShapeGeometry,
} from 'three';
import type { Piece } from '../model';
import type { PathCmd } from '../model';
import type { Vec2 } from '../model';

/** Convert a validated PathCmd stream into a three.js Shape. */
export function shapeFromPathCmds(cmds: readonly PathCmd[]): Shape {
  const shape = new Shape();
  for (const cmd of cmds) {
    switch (cmd.type) {
      case 'M':
        shape.moveTo(cmd.point.x, cmd.point.y);
        break;
      case 'L':
        shape.lineTo(cmd.point.x, cmd.point.y);
        break;
      case 'C':
        shape.bezierCurveTo(
          cmd.control1.x,
          cmd.control1.y,
          cmd.control2.x,
          cmd.control2.y,
          cmd.point.x,
          cmd.point.y,
        );
        break;
      case 'Q':
        shape.quadraticCurveTo(
          cmd.control.x,
          cmd.control.y,
          cmd.point.x,
          cmd.point.y,
        );
        break;
      case 'Z':
        shape.closePath();
        break;
    }
  }
  return shape;
}

/** Flat filled outline for a piece, in the XY plane. */
export function pieceOutlineGeometry(piece: Piece): ShapeGeometry {
  return new ShapeGeometry(shapeFromPathCmds(piece.outline));
}

export interface Extents {
  readonly width: number;
  readonly height: number;
  readonly minX: number;
  readonly minY: number;
}

/** Bounding box of a piece's outline in piece-local centimetres. */
export function pieceExtents(piece: Piece): Extents {
  // Curve control points can overshoot the curve; sample the shape the way
  // tessellation will (12 segments per curve) so layout matches the render.
  const pts = shapeFromPathCmds(piece.outline).getPoints(12);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { width: maxX - minX, height: maxY - minY, minX, minY };
}

/**
 * Internal marks (grainline arrows, notches, fold symbols) as line-segment
 * geometry. Open streams may hold several subpaths; sampling per subpath
 * keeps the inter-subpath jump from becoming a phantom line the way
 * Path.getPoints() would.
 */
export function marksGeometry(cmds: readonly PathCmd[]): BufferGeometry {
  const segments: number[] = [];
  let current: Vec2[] = [];

  const flush = (): void => {
    for (let i = 0; i + 1 < current.length; i++) {
      segments.push(
        current[i].x,
        current[i].y,
        0,
        current[i + 1].x,
        current[i + 1].y,
        0,
      );
    }
    current = [];
  };

  const sample = (from: Vec2, to: Vec2, steps: number): void => {
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      current.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      });
    }
  };

  for (const cmd of cmds) {
    switch (cmd.type) {
      case 'M':
        flush();
        current.push(cmd.point);
        break;
      case 'L':
        sample(current[current.length - 1], cmd.point, 1);
        break;
      case 'Q': {
        const from = current[current.length - 1];
        // De Casteljau interpolation of the quadratic between from and point.
        for (let s = 1; s <= 8; s++) {
          const t = s / 8;
          const u = 1 - t;
          current.push({
            x: u * u * from.x + 2 * u * t * cmd.control.x + t * t * cmd.point.x,
            y: u * u * from.y + 2 * u * t * cmd.control.y + t * t * cmd.point.y,
          });
        }
        break;
      }
      case 'C': {
        const from = current[current.length - 1];
        for (let s = 1; s <= 12; s++) {
          const t = s / 12;
          const u = 1 - t;
          current.push({
            x:
              u * u * u * from.x +
              3 * u * u * t * cmd.control1.x +
              3 * u * t * t * cmd.control2.x +
              t * t * t * cmd.point.x,
            y:
              u * u * u * from.y +
              3 * u * u * t * cmd.control1.y +
              3 * u * t * t * cmd.control2.y +
              t * t * t * cmd.point.y,
          });
        }
        break;
      }
      case 'Z':
        flush();
        break;
    }
  }
  flush();

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(segments, 3));
  return geometry;
}
