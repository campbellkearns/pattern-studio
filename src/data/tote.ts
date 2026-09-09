/**
 * D5 starter ladder rung 3: the box tote. Still all straight seams, but the
 * build order now teaches bag-making vocabulary — a facing that binds the
 * top edge to the inside and a base band that boxes the bottom — the rung
 * below pants. The blueprint's starter spec defines no dimensions for this
 * rung, so the starter ships fixed-size in centimetres; webbing handles are
 * cut by length and have no pattern piece.
 *
 * Coordinates are centimetres, y-up (the domain convention; SVG imports
 * flip y at the pipeline boundary, see src/pipeline/svgShape.ts).
 */
import { closePath, lineTo, moveTo, quadTo } from '../model';
import type { Piece, SeamStep, StarterProject } from '../model';
import { createSeamStep, vec2 } from '../model';

function totePieces(): Piece[] {
  const seamAllowance = 1.5;

  // Tote body: 40 x 46 cm rectangle (cut 2 — front and back). Both 40 cm
  // horizontal edges are seam edges — the facing sews to the top, the base
  // band to the bottom — so the rectangle stays unrounded.
  const bodyOutline = [
    moveTo(vec2(0, 46)),
    lineTo(vec2(40, 46)),
    lineTo(vec2(40, 0)),
    lineTo(vec2(0, 0)),
    closePath(),
  ];
  const bodyMarks = [
    // Grainline arrow, vertical, parallel to the 46 cm side (angle 90°).
    moveTo(vec2(20, 14)),
    lineTo(vec2(20, 30)),
    moveTo(vec2(20, 30)),
    lineTo(vec2(18.6, 28.2)),
    moveTo(vec2(20, 30)),
    lineTo(vec2(21.4, 28.2)),
    // Cut-2 tick: the body is cut twice (front and back).
    moveTo(vec2(2, 2)),
    lineTo(vec2(8, 2)),
  ];

  // Facing band: 40 x 8 cm (cut 1). The top 40 cm edge is the seam; the
  // band folds down to the inside and binds the bag's top edge.
  const facingOutline = [
    moveTo(vec2(0, 8)),
    lineTo(vec2(40, 8)),
    lineTo(vec2(40, 0)),
    lineTo(vec2(0, 0)),
    closePath(),
  ];
  const facingMarks = [
    // Grainline arrow along the 40 cm width (angle 0°).
    moveTo(vec2(8, 4)),
    lineTo(vec2(32, 4)),
    moveTo(vec2(32, 4)),
    lineTo(vec2(30.2, 2.6)),
    moveTo(vec2(32, 4)),
    lineTo(vec2(30.2, 5.4)),
  ];

  // Base band: 40 x 10 cm (cut 1). The top 40 cm edge is the seam; the
  // band folds up from the body's bottom edge and boxes the base.
  const baseOutline = [
    moveTo(vec2(0, 10)),
    lineTo(vec2(40, 10)),
    lineTo(vec2(40, 2)),
    quadTo(vec2(40, 0), vec2(38, 0)),
    lineTo(vec2(2, 0)),
    quadTo(vec2(0, 0), vec2(0, 2)),
    closePath(),
  ];
  const baseMarks = [
    // Grainline arrow along the 40 cm width (angle 0°).
    moveTo(vec2(8, 5)),
    lineTo(vec2(32, 5)),
    moveTo(vec2(32, 5)),
    lineTo(vec2(30.2, 3.6)),
    moveTo(vec2(32, 5)),
    lineTo(vec2(30.2, 6.4)),
  ];

  return [
    {
      id: 'body',
      name: 'Tote body',
      outline: bodyOutline,
      internal: bodyMarks,
      grainline: { angle: 90, placement: vec2(20, 22) },
      seamAllowance,
      cutCount: 2,
    },
    {
      id: 'facing',
      name: 'Top facing',
      outline: facingOutline,
      internal: facingMarks,
      grainline: { angle: 0, placement: vec2(20, 4) },
      seamAllowance,
      cutCount: 1,
    },
    {
      id: 'base',
      name: 'Base band',
      outline: baseOutline,
      internal: baseMarks,
      grainline: { angle: 0, placement: vec2(20, 5) },
      seamAllowance,
      cutCount: 1,
    },
  ];
}

/**
 * Build order: the facing sews to the body's top edge and folds down
 * inside; the base band sews to the body's bottom edge and folds up.
 * Both seam chains are matched 40 cm straight edges, so the engine can
 * fold the sequence end to end.
 */
function toteAssembly(): SeamStep[] {
  return [
    createSeamStep({
      pieces: ['facing', 'body'],
      edges: [
        // Facing's top edge (40 cm) onto the body's top edge.
        { pieceId: 'facing', startVertex: 0, edgeCount: 1 },
        { pieceId: 'body', startVertex: 0, edgeCount: 1 },
      ],
      order: 1,
      name: 'Facing seam',
      note:
        'Sew the facing to the body along the top edge, then fold it down ' +
        'to the inside — it binds the raw edge at the opening.',
    }),
    createSeamStep({
      pieces: ['base', 'body'],
      edges: [
        // Base band's top edge (40 cm) onto the body's bottom edge.
        { pieceId: 'base', startVertex: 0, edgeCount: 1 },
        { pieceId: 'body', startVertex: 2, edgeCount: 1 },
      ],
      order: 2,
      name: 'Base band seam',
      note:
        'Sew the base band to the body along the bottom edge and fold it ' +
        'up — press the side seams flat and the flat pieces become a box.',
    }),
  ];
}

export const TOTE_STARTER: StarterProject = {
  id: 'starter-tote',
  name: 'Tote',
  // Fixed-size starter: the blueprint's starter spec defines no dimensions,
  // so measurements stay empty and the redraft is a no-op on purpose.
  measurements: {},
  fabric: {
    weave: 'plain',
    weaveScale: 0.16,
    color: '#c9b38a',
    weight: 420,
  },
  pieces: totePieces(),
  assembly: toteAssembly(),
  learnCard:
    "What you'll learn: a tote is rectangles with intent — the facing binds " +
    'the top edge, the base band boxes the bottom, and pressing the side ' +
    'seams flat turns flat pieces into a box. Webbing handles are cut by ' +
    "length, so there's no pattern piece for them.",
};
