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
  requireFinite,
  requireNonEmptyString,
  requireNonNegativeInteger,
  requirePositiveInteger,
} from './assert';
import { requireHexColor } from './fabric';

/** The curated stitch set (UX-12): the three seams a beginner meets first. */
export const STITCH_TYPES = ['straight', 'zigzag', 'backstitch'] as const;

export type StitchType = (typeof STITCH_TYPES)[number];

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
  /**
   * Learner-facing seam name (UX-07: seams name themselves in place), e.g.
   * "Rise seam". Optional: projects predating the vocabulary layer simply
   * omit it, and surfaces fall back to the joined piece names.
   */
  readonly name?: string;
  /**
   * Declared relative measured-length ease for this seam, as a fraction of
   * the longer chain (e.g. 0.15 = the chains may differ up to 15%). Real
   * seams are eased at sew time by amounts that are properties of the seam
   * itself — a seat curve absorbs far more ease than a straight side seam —
   * so a seam whose two sides legitimately differ beyond the engine's
   * default tolerance declares the amount it will be eased here. The
   * assembly engine gates each step at `ease ?? SEAM_LENGTH_TOLERANCE`;
   * omitted means the default gate, so authoring mistakes still fail loudly.
   */
  readonly ease?: number;
  /**
   * UX-12 design layer: the stitch this seam is sewn with, shown as the
   * seam line's glyph (straight solid, zigzag chevron, backstitch long-
   * dash). Optional and validated only when present — projects predating
   * the design layer omit it, and the engine never reads it.
   */
  readonly stitch?: StitchType;
  /**
   * UX-12 design layer: the thread color as a hex string (`#rgb` or
   * `#rrggbb` — the same rule as a FabricSpec color), painted on the
   * seam's accent line. Optional; omitted means the default seam check
   * color. Purely decorative — the engine never reads it.
   */
  readonly threadColor?: string;
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
    name:
      input.name === undefined
        ? undefined
        : requireNonEmptyString(input.name, 'seam name'),
    ease: input.ease === undefined ? undefined : requireEase(input.ease),
    stitch:
      input.stitch === undefined ? undefined : requireStitchType(input.stitch),
    threadColor:
      input.threadColor === undefined
        ? undefined
        : requireHexColor(input.threadColor, 'seam threadColor'),
  });
}

/** Only the curated set is accepted — a typo'd stitch fails loudly. */
function requireStitchType(stitch: StitchType): StitchType {
  if (!STITCH_TYPES.includes(stitch)) {
    throw new Error(
      `seam stitch must be one of ${STITCH_TYPES.join(' | ')}, got "${String(stitch)}"`,
    );
  }
  return stitch;
}

/** A declared ease is a fraction of the longer chain — strictly between 0 and 1. */
function requireEase(ease: number): number {
  requireFinite(ease, 'seam ease');
  if (ease <= 0 || ease >= 1) {
    throw new Error(`seam ease must be strictly between 0 and 1, got ${ease}`);
  }
  return ease;
}
