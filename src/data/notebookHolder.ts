/**
 * M1 sample project: a hand-authored starter built through the data-model
 * factories (createStarterProject re-validates every field, so this file is
 * as honest as any future deserialized input). Real FreeSewing-derived
 * starter templates arrive in M3; the blueprint's starter ladder puts the
 * notebook holder first because straight seams teach the UI before curved
 * assembly lands.
 *
 * Coordinates are centimetres, y-up (the domain convention; SVG imports
 * flip y at the pipeline boundary, see src/pipeline/svgShape.ts).
 */
import { closePath, cubicTo, lineTo, moveTo, quadTo } from '../model';
import type { Piece, SeamStep, StarterProject } from '../model';
import { createSeamStep, vec2 } from '../model';

function notebookHolderPieces(): Piece[] {
  const seamAllowance = 1.5;

  // Outer cover: 40 x 28 cm, 3 cm rounded corners. Wraps the notebook's
  // front and back in one piece (cut 1).
  const coverOutline = [
    moveTo(vec2(3, 0)),
    lineTo(vec2(37, 0)),
    quadTo(vec2(40, 0), vec2(40, 3)),
    lineTo(vec2(40, 25)),
    quadTo(vec2(40, 28), vec2(37, 28)),
    lineTo(vec2(3, 28)),
    quadTo(vec2(0, 28), vec2(0, 25)),
    lineTo(vec2(0, 3)),
    quadTo(vec2(0, 0), vec2(3, 0)),
    closePath(),
  ];
  const coverMarks = [
    // Grainline arrow, parallel to the 28 cm edge (angle 90°).
    moveTo(vec2(20, 9)),
    lineTo(vec2(20, 19)),
    moveTo(vec2(20, 19)),
    lineTo(vec2(18.6, 17.2)),
    moveTo(vec2(20, 19)),
    lineTo(vec2(21.4, 17.2)),
  ];

  // Flap: 40 cm wide hem, shaped lower edge (cut 1). The cubic sags the
  // hem so the flap drapes over the cover's top edge. The top edge is
  // 34 cm to match the cover's top edge — the seam they share.
  const flapOutline = [
    moveTo(vec2(0, 3)),
    cubicTo(vec2(13, 0), vec2(27, 0), vec2(40, 3)),
    lineTo(vec2(40, 12)),
    quadTo(vec2(40, 14), vec2(37, 14)),
    lineTo(vec2(3, 14)),
    quadTo(vec2(0, 14), vec2(0, 12)),
    closePath(),
  ];
  const flapMarks = [
    // Grainline arrow along the 40 cm width (angle 0°).
    moveTo(vec2(14, 8)),
    lineTo(vec2(26, 8)),
    moveTo(vec2(26, 8)),
    lineTo(vec2(24.4, 6.9)),
    moveTo(vec2(26, 8)),
    lineTo(vec2(24.4, 9.1)),
  ];

  // Inside pocket: 22 x 12 cm, rounded bottom corners (cut 2). The top
  // edge is 22 cm so it matches the cover's left edge exactly when the
  // pocket folds on during assembly.
  const pocketOutline = [
    moveTo(vec2(0, 12)),
    lineTo(vec2(0, 3)),
    quadTo(vec2(0, 0), vec2(3, 0)),
    lineTo(vec2(19, 0)),
    quadTo(vec2(22, 0), vec2(22, 3)),
    lineTo(vec2(22, 12)),
    closePath(),
  ];
  const pocketMarks = [
    // Grainline arrow, vertical.
    moveTo(vec2(11, 3)),
    lineTo(vec2(11, 9)),
    moveTo(vec2(11, 9)),
    lineTo(vec2(9.6, 7.2)),
    moveTo(vec2(11, 9)),
    lineTo(vec2(12.4, 7.2)),
    // Fold mark on the top edge.
    moveTo(vec2(8, 12)),
    lineTo(vec2(14, 12)),
  ];

  return [
    {
      id: 'cover',
      name: 'Outer cover',
      outline: coverOutline,
      internal: coverMarks,
      grainline: { angle: 90, placement: vec2(20, 14) },
      seamAllowance,
      cutCount: 1,
    },
    {
      id: 'flap',
      name: 'Flap',
      outline: flapOutline,
      internal: flapMarks,
      grainline: { angle: 0, placement: vec2(20, 8) },
      seamAllowance,
      cutCount: 1,
    },
    {
      id: 'pocket',
      name: 'Inside pocket',
      outline: pocketOutline,
      internal: pocketMarks,
      grainline: { angle: 90, placement: vec2(9, 6) },
      seamAllowance,
      cutCount: 2,
    },
  ];
}

/**
 * The M1 starter's build order: the flap folds onto the cover's top edge,
 * then the pocket folds onto the cover's left edge. Both seams are straight
 * matched-length edge chains, so assembly mode can demonstrate the fold
 * sequence on real pieces today.
 */
function notebookHolderAssembly(): SeamStep[] {
  return [
    createSeamStep({
      pieces: ['flap', 'cover'],
      edges: [
        // Flap's straight top edge (34 cm) folds onto the cover's top edge.
        { pieceId: 'flap', startVertex: 3, edgeCount: 1 },
        { pieceId: 'cover', startVertex: 4, edgeCount: 1 },
      ],
      order: 1,
      note:
        'Lay the flap printed-side down on the cover, line up the straight ' +
        'top edges, and sew. The flap will fold down over the front.',
    }),
    createSeamStep({
      pieces: ['pocket', 'cover'],
      edges: [
        // Pocket's straight top edge (22 cm) onto the cover's left edge.
        { pieceId: 'pocket', startVertex: 5, edgeCount: 1 },
        { pieceId: 'cover', startVertex: 6, edgeCount: 1 },
      ],
      order: 2,
      note:
        'Fold the pocket onto the cover along the long left edge — you cut ' +
        'two, so repeat for the second pocket on the other side.',
    }),
  ];
}

export const NOTEBOOK_HOLDER_STARTER: StarterProject = {
  id: 'starter-notebook-holder',
  name: 'Notebook holder',
  measurements: {
    notebookWidth: 21,
    notebookHeight: 30,
    coverOverhang: 2,
    flapDrop: 6,
  },
  fabric: {
    weave: 'plain',
    weaveScale: 0.12,
    color: '#5b7553',
    weight: 340,
  },
  pieces: notebookHolderPieces(),
  assembly: notebookHolderAssembly(),
  learnCard:
    "What you'll learn: this starter is all straight seams — attaching the flap, " +
    'then the pockets, then closing the lining — so you can practise turning ' +
    'corners and pressing seams before curved assembly arrives with the later starters.',
};
