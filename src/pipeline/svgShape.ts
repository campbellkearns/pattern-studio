/**
 * SVG → THREE.Shape pipeline — the FreeSewing import boundary.
 *
 * FreeSewing drafts render to SVG whose user units are millimetres with the
 * y-axis pointing down (docs/spike-freesewing.md). This module turns that SVG
 * into Y-up THREE.Shape objects in centimetres, ready for ShapeGeometry:
 *
 *   SVGLoader.parse → filter class~="fabric" → ShapePath.toShapes()
 *   → Y-flip + mm→cm scale → THREE.Shape
 *
 * toShapes() fills each shape's `holes` per the SVG fill rule (three.js
 * PR #21380 hole handling; the static SVGLoader.createShapes() is a
 * deprecated alias of exactly this call since r185), so pieces with internal
 * cutouts survive the round trip. The unit conversion lives here, at the
 * engine boundary — never in the domain model (src/model), which is
 * centimetres end to end.
 */
import { Shape, Vector2 } from 'three';
import type { ShapePath } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { SVGResult } from 'three/examples/jsm/loaders/SVGLoader.js';

/** FreeSewing user units are millimetres; the domain model is centimetres. */
export const MM_TO_CM = 0.1;

export interface SvgShapeOptions {
  /** Multiplier from SVG user units to world units. Default: mm → cm. */
  readonly unitScale: number;
  /** Negate Y so SVG's y-down drafts become three.js y-up. Default: true. */
  readonly flipY: boolean;
}

export const DEFAULT_SVG_SHAPE_OPTIONS: SvgShapeOptions = {
  unitScale: MM_TO_CM,
  flipY: true,
};

export interface SvgShapesResult {
  /** Fabric shapes, Y-up, in world units (centimetres with the default scale). */
  readonly shapes: readonly Shape[];
  /** ShapePaths whose class list included `fabric`. */
  readonly fabricPathCount: number;
  /** Total `<path>`-derived ShapePaths the loader produced before filtering. */
  readonly totalPathCount: number;
}

interface PathUserData {
  node?: unknown;
}

/** SVGLoader keeps the source element at `userData.node` (r185). */
function sourceNode(path: ShapePath): Element | null {
  const node = (path.userData as PathUserData | undefined)?.node;
  return node instanceof Element ? node : null;
}

/**
 * The spike's production rule (docs/spike-freesewing.md): only paths whose
 * class attribute contains the `fabric` token are pattern pieces. FreeSewing
 * marks everything else — notches, grainline marks, scale boxes, help text —
 * with other classes, and only true pattern outlines may become shapes.
 */
export function isFabricPath(path: ShapePath): boolean {
  const node = sourceNode(path);
  if (!node) return false;
  const classes = (node.getAttribute('class') ?? '').split(/\s+/);
  return classes.includes('fabric');
}

export function filterFabricPaths(result: SVGResult): {
  fabric: ShapePath[];
  total: number;
} {
  return {
    fabric: result.paths.filter(isFabricPath),
    total: result.paths.length,
  };
}

/**
 * Sample each ring at ShapeGeometry's default resolution (12 segments per
 * curve — what tessellation would sample anyway), apply the Y-flip and unit
 * scale, and reverse each ring so mirroring preserves its original winding.
 */
function transformRing(
  points: readonly Vector2[],
  options: SvgShapeOptions,
): Vector2[] {
  const ySign = options.flipY ? -1 : 1;
  const mapped = points.map(
    (p) =>
      new Vector2(p.x * options.unitScale, ySign * p.y * options.unitScale),
  );
  return options.flipY ? mapped.reverse() : mapped;
}

function signedArea(ring: readonly Vector2[]): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/** Y-flip + unit scale for one shape and all of its holes. */
export function transformShape(shape: Shape, options: SvgShapeOptions): Shape {
  const sampled = shape.extractPoints(12);
  // Keep each ring's winding handedness across the mirror so outer contour
  // and holes stay opposite-oriented for tessellation.
  const flipRing = (ring: readonly Vector2[]): Vector2[] => {
    const transformed = transformRing(ring, options);
    return signedArea(transformed) * signedArea(ring) < 0
      ? transformed.reverse()
      : transformed;
  };

  const outer = flipRing(sampled.shape);
  const flipped = new Shape(outer);
  for (const hole of sampled.holes) {
    // Holes are Path-typed rings; three's own SVGLoader pushes Shapes into
    // shape.holes the same way (Shape extends Path).
    flipped.holes.push(new Shape(flipRing(hole)));
  }
  return flipped;
}

/** Parse an SVG document and return fabric shapes at world scale. */
export function svgToFabricShapes(
  svg: string,
  options: SvgShapeOptions = DEFAULT_SVG_SHAPE_OPTIONS,
): SvgShapesResult {
  const result = new SVGLoader().parse(svg);
  const { fabric, total } = filterFabricPaths(result);
  const shapes: Shape[] = [];
  for (const path of fabric) {
    for (const shape of SVGLoader.createShapes(path)) {
      shapes.push(transformShape(shape, options));
    }
  }
  return { shapes, fabricPathCount: fabric.length, totalPathCount: total };
}
