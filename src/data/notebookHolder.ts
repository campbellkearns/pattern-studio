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
import type { Piece, StarterProject } from '../model';
import { vec2 } from '../model';

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

  // Flap: 40 cm wide, shaped lower edge (cut 1). The cubic sags the hem so
  // the flap drapes over the cover's top edge.
  const flapOutline = [
    moveTo(vec2(0, 3)),
    cubicTo(vec2(13, 0), vec2(27, 0), vec2(40, 3)),
    lineTo(vec2(40, 12)),
    quadTo(vec2(40, 14), vec2(38, 14)),
    lineTo(vec2(2, 14)),
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

  // Inside pocket: 18 x 12 cm, rounded bottom corners (cut 2).
  const pocketOutline = [
    moveTo(vec2(0, 12)),
    lineTo(vec2(0, 3)),
    quadTo(vec2(0, 0), vec2(3, 0)),
    lineTo(vec2(15, 0)),
    quadTo(vec2(18, 0), vec2(18, 3)),
    lineTo(vec2(18, 12)),
    closePath(),
  ];
  const pocketMarks = [
    // Grainline arrow, vertical.
    moveTo(vec2(9, 3)),
    lineTo(vec2(9, 9)),
    moveTo(vec2(9, 9)),
    lineTo(vec2(7.6, 7.2)),
    moveTo(vec2(9, 9)),
    lineTo(vec2(10.4, 7.2)),
    // Fold mark on the top edge.
    moveTo(vec2(7, 12)),
    lineTo(vec2(11, 12)),
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
 * The M1 starter. assembly is empty on purpose: seam steps reference
 * matched edge chains and belong to assembly mode (M3), where the build
 * order becomes the lesson.
 */
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
  assembly: [],
  learnCard:
    "What you'll learn: this starter is all straight seams — attaching the flap, " +
    'then the pockets, then closing the lining — so you can practise turning ' +
    'corners and pressing seams before curved assembly arrives with the later starters.',
};
