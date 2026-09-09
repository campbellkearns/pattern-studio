/**
 * D5 starter ladder rung 2: the toiletry rollup. Like the notebook holder,
 * every seam is straight — the rung teaches the fold/assembly UI a second
 * way (two movers landing on opposite edges of one anchor) before curved
 * seams arrive with later rungs. The blueprint's starter spec defines no
 * dimensions for this rung, so the starter ships fixed-size in centimetres.
 *
 * Coordinates are centimetres, y-up (the domain convention; SVG imports
 * flip y at the pipeline boundary, see src/pipeline/svgShape.ts).
 */
import { closePath, lineTo, moveTo, quadTo } from '../model';
import type { Piece, SeamStep, StarterProject } from '../model';
import { createSeamStep, vec2 } from '../model';

function toiletryRollupPieces(): Piece[] {
  const seamAllowance = 1.5;

  // Backing body: 26 x 22 cm rectangle (cut 1). Both 26 cm horizontal
  // edges are seam edges — the pocket sews to the top, the flap to the
  // bottom — so the rectangle stays unrounded.
  const bodyOutline = [
    moveTo(vec2(0, 22)),
    lineTo(vec2(26, 22)),
    lineTo(vec2(26, 0)),
    lineTo(vec2(0, 0)),
    closePath(),
  ];
  const bodyMarks = [
    // Grainline arrow along the 26 cm width (angle 0°).
    moveTo(vec2(6, 11)),
    lineTo(vec2(20, 11)),
    moveTo(vec2(20, 11)),
    lineTo(vec2(18.2, 9.6)),
    moveTo(vec2(20, 11)),
    lineTo(vec2(18.2, 12.4)),
  ];

  // Pocket strip: 26 x 14 cm (cut 1). The top 26 cm edge is the seam;
  // the fold line marks where the strip folds up in half to form the
  // compartments when the roll closes.
  const pocketOutline = [
    moveTo(vec2(0, 14)),
    lineTo(vec2(26, 14)),
    lineTo(vec2(26, 2.5)),
    quadTo(vec2(26, 0), vec2(23.5, 0)),
    lineTo(vec2(2.5, 0)),
    quadTo(vec2(0, 0), vec2(0, 2.5)),
    closePath(),
  ];
  const pocketMarks = [
    // Grainline arrow along the 26 cm width (angle 0°).
    moveTo(vec2(5, 4.5)),
    lineTo(vec2(21, 4.5)),
    moveTo(vec2(21, 4.5)),
    lineTo(vec2(19.2, 3.1)),
    moveTo(vec2(21, 4.5)),
    lineTo(vec2(19.2, 5.9)),
    // Fold line: the strip folds on itself to make compartments.
    moveTo(vec2(2, 7)),
    lineTo(vec2(24, 7)),
  ];

  // Flap: 26 x 10 cm (cut 1). The top 26 cm edge is the seam; the flap
  // folds up from the body's bottom edge and covers the pocket when rolled.
  const flapOutline = [
    moveTo(vec2(0, 10)),
    lineTo(vec2(26, 10)),
    lineTo(vec2(26, 2)),
    quadTo(vec2(26, 0), vec2(24, 0)),
    lineTo(vec2(2, 0)),
    quadTo(vec2(0, 0), vec2(0, 2)),
    closePath(),
  ];
  const flapMarks = [
    // Grainline arrow along the 26 cm width (angle 0°).
    moveTo(vec2(6, 5)),
    lineTo(vec2(20, 5)),
    moveTo(vec2(20, 5)),
    lineTo(vec2(18.2, 3.6)),
    moveTo(vec2(20, 5)),
    lineTo(vec2(18.2, 6.4)),
  ];

  return [
    {
      id: 'body',
      name: 'Backing body',
      outline: bodyOutline,
      internal: bodyMarks,
      grainline: { angle: 0, placement: vec2(13, 11) },
      seamAllowance,
      cutCount: 1,
    },
    {
      id: 'pocket',
      name: 'Pocket strip',
      outline: pocketOutline,
      internal: pocketMarks,
      grainline: { angle: 0, placement: vec2(13, 4.5) },
      seamAllowance,
      cutCount: 1,
    },
    {
      id: 'flap',
      name: 'Roll flap',
      outline: flapOutline,
      internal: flapMarks,
      grainline: { angle: 0, placement: vec2(13, 5) },
      seamAllowance,
      cutCount: 1,
    },
  ];
}

/**
 * Build order: the pocket sews to the body's top edge and folds down over
 * it; the flap sews to the body's bottom edge and folds up over the pocket.
 * Both seam chains are matched 26 cm straight edges, so the engine can fold
 * the sequence end to end.
 */
function toiletryRollupAssembly(): SeamStep[] {
  return [
    createSeamStep({
      pieces: ['pocket', 'body'],
      edges: [
        // Pocket's top edge (26 cm) onto the body's top edge.
        { pieceId: 'pocket', startVertex: 0, edgeCount: 1 },
        { pieceId: 'body', startVertex: 0, edgeCount: 1 },
      ],
      order: 1,
      name: 'Pocket seam',
      note:
        'Sew the pocket strip to the body along the top edge, then fold it ' +
        'down over the body — the fold line splits it into compartments.',
    }),
    createSeamStep({
      pieces: ['flap', 'body'],
      edges: [
        // Flap's top edge (26 cm) onto the body's bottom edge.
        { pieceId: 'flap', startVertex: 0, edgeCount: 1 },
        { pieceId: 'body', startVertex: 2, edgeCount: 1 },
      ],
      order: 2,
      name: 'Roll flap seam',
      note:
        'Sew the flap to the body along the bottom edge and fold it up — ' +
        'it covers the pockets when you roll everything from the top.',
    }),
  ];
}

export const TOILETRY_ROLLUP_STARTER: StarterProject = {
  id: 'starter-toiletry-rollup',
  name: 'Toiletry rollup',
  // Fixed-size starter: the blueprint's starter spec defines no dimensions,
  // so measurements stay empty and the redraft is a no-op on purpose.
  measurements: {},
  fabric: {
    weave: 'twill',
    weaveScale: 0.15,
    color: '#a8823f',
    weight: 400,
  },
  pieces: toiletryRollupPieces(),
  assembly: toiletryRollupAssembly(),
  learnCard:
    "What you'll learn: three rectangles and two straight seams make a roll " +
    'that keeps toiletries tidy — sew the pocket along the top, fold the flap ' +
    'up from the bottom, then roll and tie. The ribbon ties are cut by ' +
    "length, so there's no pattern piece for them.",
};
