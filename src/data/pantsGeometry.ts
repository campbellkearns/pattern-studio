/**
 * Read-only outline geometry for starter data — pure functions over PathCmd
 * streams; no mutation, no DOM.
 *
 * Vertex semantics match src/model/path.ts (pathVertexCount): vertex i is
 * command i's endpoint (the M's point is vertex 0), and edge i runs vertex
 * i → vertex i+1. The closing Z runs the last vertex back to vertex 0, which
 * is why a chain may reference an edge starting at the final vertex.
 */
import type { EdgeChain, PathCmd, Vec2 } from '../model';

/** Endpoints of every drawing command, in order — index = vertex index. */
export function outlineVertices(outline: readonly PathCmd[]): Vec2[] {
  const vertices: Vec2[] = [];
  for (const cmd of outline) {
    if (
      cmd.type === 'M' ||
      cmd.type === 'L' ||
      cmd.type === 'C' ||
      cmd.type === 'Q'
    ) {
      vertices.push(cmd.point);
    }
  }
  return vertices;
}

function chord(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Straight-line length of an edge chain: the sum of vertex-to-vertex chords.
 * Bézier edges measure as their chords — near-exact on the straight edges
 * this module sizes (waist, hem, side seams), slightly conservative on
 * curves, which suits the eased-seam tolerances starter data works with.
 */
export function chainLength(
  outline: readonly PathCmd[],
  chain: EdgeChain,
): number {
  const vertices = outlineVertices(outline);
  let total = 0;
  for (let i = 0; i < chain.edgeCount; i++) {
    const start = vertices[chain.startVertex + i];
    // The edge after the final vertex is the closing Z edge (last vertex → 0).
    const end =
      chain.startVertex + i + 1 === vertices.length
        ? vertices[0]
        : vertices[chain.startVertex + i + 1];
    if (!start || !end) {
      throw new Error(
        `edge chain [startVertex ${chain.startVertex}, edgeCount ${chain.edgeCount}] runs past the outline's ${vertices.length} vertices`,
      );
    }
    total += chord(start, end);
  }
  return total;
}
