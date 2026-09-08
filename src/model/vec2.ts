/**
 * 2D vector and measurement math for the Pattern Studio domain layer.
 *
 * UNITS: all coordinates and distances are centimetres. FreeSewing/Titan
 * drafts in millimetres (see docs/spike-freesewing.md) — mm→cm conversion
 * belongs to the future engine adapter (parametric-redraft task), never to
 * this layer.
 *
 * The domain angle unit is degrees (see `rotate` and `Grainline.angle`);
 * engines convert to radians at their own boundary.
 */
import { requireFinite } from './assert';

/** Position or direction in project space, in centimetres. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export function vec2(x: number, y: number): Vec2 {
  requireFinite(x, 'vec2 x');
  requireFinite(y, 'vec2 y');
  return Object.freeze({ x, y });
}

export function isFiniteVec2(v: Vec2): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y);
}

export function assertFiniteVec2(v: Vec2, label: string): void {
  requireFinite(v.x, `${label} x`);
  requireFinite(v.y, `${label} y`);
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(v: Vec2, k: number): Vec2 {
  return { x: v.x * k, y: v.y * k };
}

/** Rotate counterclockwise about the origin. `angleDeg` is in degrees. */
export function rotate(v: Vec2, angleDeg: number): Vec2 {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

/** Euclidean distance in centimetres. */
export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
