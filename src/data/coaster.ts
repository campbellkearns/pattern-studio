/**
 * D5 starter ladder rung 0: the coaster. The whole craft in miniature —
 * two 10 cm squares joined by exactly one straight seam, so a total
 * beginner finishes a real thing in a single fold. The blueprint's
 * starter spec defines no dimensions for this rung, so the starter ships
 * fixed-size in centimetres.
 *
 * Coordinates are centimetres, y-up (the domain convention; SVG imports
 * flip y at the pipeline boundary, see src/pipeline/svgShape.ts).
 */
import { closePath, lineTo, moveTo } from '../model';
import type { Piece, SeamStep, StarterProject } from '../model';
import { createSeamStep, vec2 } from '../model';

function squarePiece(id: string, name: string): Piece {
  const seamAllowance = 1.5;

  // 10 x 10 cm square. Both seam edges are straight — exactly one of them
  // (edge 0, the first 10 cm side) is sewn, so the outline stays unrounded.
  const outline = [
    moveTo(vec2(0, 10)),
    lineTo(vec2(10, 10)),
    lineTo(vec2(10, 0)),
    lineTo(vec2(0, 0)),
    closePath(),
  ];

  return {
    id,
    name,
    outline,
    internal: [
      // Grainline arrow, vertical, parallel to the 10 cm side (angle 90°).
      moveTo(vec2(5, 3)),
      lineTo(vec2(5, 7)),
      moveTo(vec2(5, 7)),
      lineTo(vec2(4.2, 5.8)),
      moveTo(vec2(5, 7)),
      lineTo(vec2(5.8, 5.8)),
    ],
    grainline: { angle: 90, placement: vec2(5, 5) },
    seamAllowance,
    cutCount: 1,
  };
}

function coasterPieces(): Piece[] {
  return [
    squarePiece('coaster-top', 'Coaster top'),
    squarePiece('coaster-back', 'Coaster back'),
  ];
}

/**
 * Build order: the top square sews to the back along one straight 10 cm
 * edge — right sides together — then folds over the seam and presses
 * flat. Both chain sides are the matched 10 cm straight edge, so the
 * engine folds the single step end to end.
 */
function coasterAssembly(): SeamStep[] {
  return [
    createSeamStep({
      pieces: ['coaster-top', 'coaster-back'],
      edges: [
        // Top square's edge 0 (10 cm) onto the back square's edge 0.
        { pieceId: 'coaster-top', startVertex: 0, edgeCount: 1 },
        { pieceId: 'coaster-back', startVertex: 0, edgeCount: 1 },
      ],
      order: 1,
      name: 'Edge seam',
      note:
        'One straight seam: pin the squares right sides together, sew the ' +
        '10 cm edge, then fold the top square over the seam and press it flat.',
    }),
  ];
}

export const COASTER_STARTER: StarterProject = {
  id: 'starter-coaster',
  name: 'Coaster',
  // Fixed-size starter: the blueprint's starter spec defines no dimensions,
  // so measurements stay empty and the redraft is a no-op on purpose.
  measurements: {},
  fabric: {
    weave: 'plain',
    weaveScale: 0.16,
    color: '#a8552f',
    weight: 220,
  },
  pieces: coasterPieces(),
  assembly: coasterAssembly(),
  learnCard:
    "What you'll learn: a coaster is two squares face to face — one " +
    'straight seam, one fold, one press. Pin, sew, press: the whole ' +
    'craft in miniature, and your first finished thing.',
};
