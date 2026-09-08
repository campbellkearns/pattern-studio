/**
 * Ordered assembly steps: how pieces are sewn together, in build order.
 *
 * A seam joins two pieces along one edge chain each — a run of outline edges
 * on the piece's vertex list. The model records references, not geometry:
 * measured-length matching and the fold transform are engine-adapter
 * concerns, because real seams get eased at sew time and a strict equality
 * gate would reject legitimate drafts.
 */
import {
  requireNonEmptyString,
  requireNonNegativeInteger,
  requirePositiveInteger,
} from './assert';

/** A run of edges along a piece outline: edges startVertex … startVertex + edgeCount - 1. */
export interface EdgeChain {
  /** The piece this chain runs along. */
  readonly pieceId: string;
  /** Index of the chain's first edge's start vertex in the piece outline. */
  readonly startVertex: number;
  /** Number of outline edges in the chain (edge i runs vertex s+i → s+i+1). */
  readonly edgeCount: number;
}

export interface SeamStep {
  /** The two pieces joined by this seam. */
  readonly pieces: readonly [string, string];
  /** The matched edge chains, one per piece, in the same side order. */
  readonly edges: readonly [EdgeChain, EdgeChain];
  /** Position in the build order; strictly increasing across a project's assembly. */
  readonly order: number;
  /** The "why" shown to the learner. */
  readonly note: string;
}

export function createEdgeChain(input: EdgeChain): EdgeChain {
  return Object.freeze({
    pieceId: requireNonEmptyString(input.pieceId, 'edge chain pieceId'),
    startVertex: requireNonNegativeInteger(
      input.startVertex,
      'edge chain startVertex',
    ),
    edgeCount: requirePositiveInteger(input.edgeCount, 'edge chain edgeCount'),
  });
}

export function createSeamStep(input: SeamStep): SeamStep {
  const pieceA = requireNonEmptyString(input.pieces[0], 'seam pieces[0]');
  const pieceB = requireNonEmptyString(input.pieces[1], 'seam pieces[1]');
  if (pieceA === pieceB) {
    throw new Error(
      `seam must join two different pieces, got "${pieceA}" on both sides`,
    );
  }

  const edges: readonly [EdgeChain, EdgeChain] = [
    createEdgeChain(input.edges[0]),
    createEdgeChain(input.edges[1]),
  ];
  if (edges[0].pieceId !== pieceA || edges[1].pieceId !== pieceB) {
    throw new Error(
      'seam edge chains must match their side: edges[0] runs along pieces[0], edges[1] along pieces[1]',
    );
  }

  const pieces: readonly [string, string] = [pieceA, pieceB];
  return Object.freeze({
    pieces: Object.freeze(pieces),
    edges: Object.freeze(edges),
    order: requirePositiveInteger(input.order, 'seam order'),
    note: input.note,
  });
}
