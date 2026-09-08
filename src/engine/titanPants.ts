/**
 * Draft engine adapter (D2): FreeSewing core 4.10.1 drafting Titan — the
 * classic trouser block — turned into domain Pieces.
 *
 * Flow (per the blueprint's architecture figure):
 *
 *   PantMeasurements (cm / %)                        ← titanSettings.ts
 *     → Titan settings (mm / fractions)
 *     → pattern.draft() + pattern.render()           ← pure, DOM-free
 *     → SVG string (y-down millimetres)
 *     → SVGLoader + svgShape.filterFabricPaths       ← the merged pipeline
 *     → PathCmd streams (cm, y-up)                   ← conversion lives HERE
 *     → Piece[] (createPiece re-validates everything)
 *
 * The redraft layer is pure: draft() and render() need no DOM (verified in
 * the spike probe), and the only DOM touch is SVGLoader's string parsing —
 * the same boundary src/pipeline/svgShape.ts already draws. mm→cm conversion
 * happens in this adapter, never in the model (see src/model/vec2.ts).
 *
 * Spike gotchas honoured (docs/spike-freesewing.md §3):
 *   1. the settings object is variadic — one object, never a nested array;
 *   2. the fitCrossSeam options and fitKnee are never passed — they keep
 *      their part-level defaults;
 *   3. plugin-measurements is registered before draft();
 *   4. @freesewing/core-plugins (umbrella) is never imported.
 */
import {
  CubicBezierCurve,
  LineCurve,
  QuadraticBezierCurve,
} from 'three';
import type { Path as SvgSubPath, ShapePath } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { Titan } from '@freesewing/titan';
import { measurementsPlugin } from '@freesewing/plugin-measurements';
import { isFabricPath, MM_TO_CM, filterFabricPaths } from '../pipeline/svgShape';
import { closePath, cubicTo, lineTo, moveTo, quadTo } from '../model';
import type { PathCmd, Piece, Vec2 } from '../model';
import { vec2 } from '../model';
import { toTitanSettings } from './titanSettings';
import type { PantMeasurements } from './titanSettings';

/** FreeSewing renders one part per fabric path; these are Titan's two. */
const PIECE_NAMING: readonly { part: string; id: string; name: string }[] = [
  { part: 'titan.front', id: 'pants-front', name: 'Front leg' },
  { part: 'titan.back', id: 'pants-back', name: 'Back leg' },
];

/** Trouser fronts/backs are each cut twice (a pair). */
const LEG_CUT_COUNT = 2;

export class DraftError extends Error {}

/**
 * Draft Titan and render the pattern to SVG. DOM-free: runs in Node and in
 * the browser alike; determinism verified in titanPants.test.ts.
 */
export function draftTitanPantsSvg(measurements: PantMeasurements): string {
  const settings = toTitanSettings(measurements);
  // Variadic settings — one object (spike gotcha 1). A nested array would
  // silently draft with empty measurements and all-NaN geometry.
  const pattern = new Titan({
    measurements: settings.measurements,
    options: settings.options,
  });
  pattern.use(measurementsPlugin);
  pattern.draft();
  return pattern.render();
}

interface PartGeometry {
  readonly outline: readonly PathCmd[];
  readonly marks: readonly PathCmd[];
  readonly grainlineAngle: number;
  readonly grainlinePlacement: Vec2;
}

function toWorld(point: { x: number; y: number }): Vec2 {
  // Engine boundary conversion: mm → cm, SVG y-down → domain y-up.
  return vec2(point.x * MM_TO_CM, -point.y * MM_TO_CM);
}

/** One SVG subpath → domain path commands (open; caller appends Z if closed). */
function subPathToCmds(subPath: SvgSubPath, label: string): PathCmd[] {
  const first = subPath.curves[0];
  if (
    !first ||
    !(first instanceof LineCurve ||
      first instanceof CubicBezierCurve ||
      first instanceof QuadraticBezierCurve)
  ) {
    throw new DraftError(
      `${label}: unsupported SVG curve ${String(first?.constructor.name ?? 'none')}`,
    );
  }
  const cmds: PathCmd[] = [
    // LineCurve starts at v1 (it has no v0); Béziers start at v0.
    moveTo(toWorld(first instanceof LineCurve ? first.v1 : first.v0)),
  ];
  for (const curve of subPath.curves) {
    if (curve instanceof LineCurve) {
      cmds.push(lineTo(toWorld(curve.v2)));
    } else if (curve instanceof CubicBezierCurve) {
      cmds.push(cubicTo(toWorld(curve.v1), toWorld(curve.v2), toWorld(curve.v3)));
    } else if (curve instanceof QuadraticBezierCurve) {
      cmds.push(quadTo(toWorld(curve.v1), toWorld(curve.v2)));
    } else {
      throw new DraftError(
        `${label}: unsupported SVG curve ${String(curve.constructor.name)}`,
      );
    }
  }
  return cmds;
}

/**
 * Walk up to the FreeSewing part group (`…-part-titan.<side>`). Paths
 * outside any part group — the rendered logo in <defs>, stray marks —
 * return null rather than throwing: the selectors below iterate every
 * parsed path and must simply not match them.
 */
function partNameOf(path: ShapePath): string | null {
  const node = (path.userData as { node?: unknown } | undefined)?.node;
  if (!(node instanceof Element)) return null;
  let parent = node.parentElement;
  while (parent) {
    const match = /-part-(.+)$/.exec(parent.id ?? '');
    if (match) return match[1];
    parent = parent.parentElement;
  }
  return null;
}

function isGrainlinePath(path: ShapePath): boolean {
  const node = (path.userData as { node?: unknown } | undefined)?.node;
  if (!(node instanceof Element)) return false;
  const dataText = node.getAttribute('data-text') ?? '';
  return dataText.includes('grainline');
}

function geometryForPart(
  paths: readonly ShapePath[],
  partName: string,
  label: string,
): PartGeometry {
  // Outlines are the part-group paths the spike's production rule admits:
  // class ~ fabric. The logo/defs paths have no part group (partNameOf
  // returns null) so they can never match.
  const fabric = paths.filter(
    (p) => isFabricPath(p) && partNameOf(p) === partName,
  );
  if (fabric.length !== 1) {
    throw new DraftError(
      `${label}: expected exactly 1 fabric path for ${partName}, got ${fabric.length}`,
    );
  }
  const outlineSubPaths = fabric[0].subPaths;
  if (outlineSubPaths.length !== 1) {
    // The domain outline is one closed subpath; Titan's seam path satisfies
    // this. Anything else means an option combination we don't understand.
    throw new DraftError(
      `${label}: fabric outline must be a single subpath, got ${outlineSubPaths.length}`,
    );
  }
  const outline: PathCmd[] = subPathToCmds(outlineSubPaths[0], label);
  outline.push(closePath());

  const grainline = paths.find(
    (p) => partNameOf(p) === partName && isGrainlinePath(p),
  );
  if (!grainline || grainline.subPaths.length !== 1) {
    throw new DraftError(`${label}: missing grainline mark for ${partName}`);
  }
  const first = grainline.subPaths[0].curves[0];
  if (!(first instanceof LineCurve)) {
    throw new DraftError(`${label}: grainline mark must start with a line`);
  }
  const start = toWorld(first.v1);
  const end = toWorld(first.v2);
  // Grain direction is a line, not a ray — fold the angle into [0, 180).
  const degrees = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
  const angle = ((degrees % 180) + 180) % 180;
  const marks: PathCmd[] = [moveTo(start), lineTo(end)];
  const placement = vec2((start.x + end.x) / 2, (start.y + end.y) / 2);
  return { outline, marks, grainlineAngle: angle, grainlinePlacement: placement };
}

function parseDraft(svg: string): {
  paths: readonly ShapePath[];
  fabricCount: number;
} {
  const result = new SVGLoader().parse(svg);
  const { fabric } = filterFabricPaths(result);
  return { paths: result.paths, fabricCount: fabric.length };
}

/**
 * Redraft the pants template: measurements in, domain pieces out. Pure
 * transformation — no DOM beyond SVGLoader's string parse, no globals, no
 * accumulated state; same input always yields deeply equal output.
 */
export function redraftPants(measurements: PantMeasurements): readonly Piece[] {
  const svg = draftTitanPantsSvg(measurements);
  const { paths, fabricCount } = parseDraft(svg);
  if (fabricCount !== PIECE_NAMING.length) {
    throw new DraftError(
      `expected ${PIECE_NAMING.length} fabric paths in the draft, got ${fabricCount}`,
    );
  }

  const pieces: Piece[] = [];
  for (const naming of PIECE_NAMING) {
    const label = `redraft(${naming.id})`;
    const geometry = geometryForPart(paths, naming.part, label);
    pieces.push({
      id: naming.id,
      name: naming.name,
      outline: geometry.outline,
      internal: geometry.marks,
      grainline: {
        angle: geometry.grainlineAngle,
        placement: geometry.grainlinePlacement,
      },
      // Titan drafts net block outlines without seam allowance (no `sa` in
      // the draft settings); allowance display is a later milestone and the
      // model requires the field, so 0 is the honest value.
      seamAllowance: 0,
      cutCount: LEG_CUT_COUNT,
    });
  }
  return pieces;
}
