/**
 * Vector path command stream — the M/L/C/Q/Z-style source of truth for piece
 * outlines and internal marks. Coordinates are centimetres (see vec2.ts).
 * The three.js renderer and the SVG exporter both read this same stream;
 * nothing here touches the DOM.
 */
import type { Vec2 } from './vec2';
import { assertFiniteVec2 } from './vec2';

export type PathCmd =
  | { readonly type: 'M'; readonly point: Vec2 }
  | { readonly type: 'L'; readonly point: Vec2 }
  | {
      readonly type: 'C';
      readonly control1: Vec2;
      readonly control2: Vec2;
      readonly point: Vec2;
    }
  | { readonly type: 'Q'; readonly control: Vec2; readonly point: Vec2 }
  | { readonly type: 'Z' };

export function moveTo(point: Vec2): PathCmd {
  assertFiniteVec2(point, 'moveTo');
  const cmd: PathCmd = { type: 'M', point };
  return Object.freeze(cmd);
}

export function lineTo(point: Vec2): PathCmd {
  assertFiniteVec2(point, 'lineTo');
  const cmd: PathCmd = { type: 'L', point };
  return Object.freeze(cmd);
}

export function cubicTo(control1: Vec2, control2: Vec2, point: Vec2): PathCmd {
  assertFiniteVec2(control1, 'cubicTo control1');
  assertFiniteVec2(control2, 'cubicTo control2');
  assertFiniteVec2(point, 'cubicTo point');
  const cmd: PathCmd = { type: 'C', control1, control2, point };
  return Object.freeze(cmd);
}

export function quadTo(control: Vec2, point: Vec2): PathCmd {
  assertFiniteVec2(control, 'quadTo control');
  assertFiniteVec2(point, 'quadTo point');
  const cmd: PathCmd = { type: 'Q', control, point };
  return Object.freeze(cmd);
}

export function closePath(): PathCmd {
  const cmd: PathCmd = { type: 'Z' };
  return Object.freeze(cmd);
}

export interface PathRules {
  /**
   * Piece outlines are a single closed subpath: they must end with Z, and Z
   * is only valid as that final command. Internal marks are open but may
   * hold several subpaths (grainline, notches, fold marks in one stream) —
   * there a Z must always be followed by a new M, mirroring SVG paths.
   */
  readonly closed: boolean;
}

/**
 * Structural validation shared by outlines (closed) and internal marks
 * (open): non-empty, starts with M, every coordinate finite, well-formed
 * subpaths, and (for outlines) a trailing Z. Command factories already
 * enforce finiteness; re-checking here means hand-assembled streams (e.g.
 * deserialized JSON) cannot bypass it.
 */
export function validatePath(
  path: readonly PathCmd[],
  rules: PathRules,
  label: string,
): void {
  if (path.length === 0) {
    throw new Error(`${label}: path must not be empty`);
  }
  if (path[0].type !== 'M') {
    throw new Error(
      `${label}: path must start with M (moveTo), got ${path[0].type}`,
    );
  }
  for (let i = 0; i < path.length; i++) {
    const cmd = path[i];
    assertCmdFinite(cmd, label);
    if (cmd.type === 'Z' && i !== path.length - 1) {
      if (rules.closed) {
        throw new Error(
          `${label}: Z (closePath) is only allowed as the final command`,
        );
      }
      if (path[i + 1].type !== 'M') {
        throw new Error(
          `${label}: Z (closePath) must be followed by M (moveTo)`,
        );
      }
    }
  }
  if (rules.closed && path[path.length - 1].type !== 'Z') {
    throw new Error(`${label}: closed path must end with Z (closePath)`);
  }
}

function assertCmdFinite(cmd: PathCmd, label: string): void {
  switch (cmd.type) {
    case 'M':
    case 'L':
      assertFiniteVec2(cmd.point, label);
      break;
    case 'C':
      assertFiniteVec2(cmd.control1, `${label} control1`);
      assertFiniteVec2(cmd.control2, `${label} control2`);
      assertFiniteVec2(cmd.point, `${label} point`);
      break;
    case 'Q':
      assertFiniteVec2(cmd.control, `${label} control`);
      assertFiniteVec2(cmd.point, `${label} point`);
      break;
    case 'Z':
      break;
  }
}

/**
 * Number of anchored vertices in the path: M/L/C/Q each contribute their
 * endpoint, Z contributes none. Edge chains in seam steps index into this
 * vertex list (see EdgeChain).
 */
export function pathVertexCount(path: readonly PathCmd[]): number {
  let count = 0;
  for (const cmd of path) {
    switch (cmd.type) {
      case 'M':
      case 'L':
      case 'C':
      case 'Q':
        count += 1;
        break;
      case 'Z':
        break;
      default: {
        const unreachable: never = cmd;
        throw new Error(`unknown path command: ${JSON.stringify(unreachable)}`);
      }
    }
  }
  return count;
}
