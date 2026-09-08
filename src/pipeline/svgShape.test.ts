import { Shape, ShapeGeometry, Vector2 } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MM_TO_CM,
  DEFAULT_SVG_SHAPE_OPTIONS,
  isFabricPath,
  svgToFabricShapes,
  transformShape,
} from './svgShape';

const SVG_NS = 'http://www.w3.org/2000/svg';

function fixtureSvg(...pathTags: readonly string[]): string {
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 100 100">${pathTags.join('')}</svg>`;
}

function parseFixture(svg: string) {
  const { paths } = new SVGLoader().parse(svg);
  return {
    paths,
    shapes: paths.flatMap((path) => SVGLoader.createShapes(path)),
  };
}

function ringPoints(shape: {
  getPoints: (divisions?: number) => { x: number; y: number }[];
}): { x: number; y: number }[] {
  return shape.getPoints(12);
}

describe('isFabricPath', () => {
  it('matches the fabric class token exactly, not as a substring', () => {
    const svg = fixtureSvg(
      '<path class="fabric" d="M 0,0 L 10,0 L 10,10 Z"/>',
      '<path class="note fill-note" d="M 0,0 L 5,0 L 5,5 Z"/>',
      '<path class="fabric mark" d="M 20,0 L 30,0 L 30,10 Z"/>',
      '<path class="fabricx" d="M 40,0 L 50,0 L 50,5 Z"/>',
    );
    const { paths } = parseFixture(svg);
    expect(paths).toHaveLength(4);
    expect(isFabricPath(paths[0])).toBe(true);
    expect(isFabricPath(paths[1])).toBe(false);
    expect(isFabricPath(paths[2])).toBe(true);
    expect(isFabricPath(paths[3])).toBe(false);
  });

  it('rejects paths with no recorded source node', () => {
    expect(isFabricPath({ userData: {} } as never)).toBe(false);
  });
});

describe('svgToFabricShapes', () => {
  it('converts only class="fabric" paths into shapes', () => {
    const svg = fixtureSvg(
      '<path class="fabric" d="M 0,0 L 10,0 L 10,10 L 0,10 Z"/>',
      '<path class="note" d="M 0,0 L 5,0 L 5,5 L 0,5 Z"/>',
    );
    const result = svgToFabricShapes(svg);
    expect(result.totalPathCount).toBe(2);
    expect(result.fabricPathCount).toBe(1);
    expect(result.shapes).toHaveLength(1);
  });

  it('turns nested subpaths into one shape with holes (PR #21380 handling)', () => {
    // Inner ring winds opposite to the outer one — the SVG nonzero fill rule
    // then reads it as a cutout (winding number 0), same as real drafts.
    const donut = fixtureSvg(
      '<path class="fabric" d="M 0,0 L 100,0 L 100,100 L 0,100 Z M 40,40 L 40,60 L 60,60 L 60,40 Z"/>',
    );
    const { shapes } = svgToFabricShapes(donut);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].holes).toHaveLength(1);
    // Hole vertices stay inside the outer ring.
    const hole = ringPoints(shapes[0].holes[0]);
    for (const p of hole) {
      expect(p.x).toBeGreaterThanOrEqual(3.9);
      expect(p.x).toBeLessThanOrEqual(6.1);
      expect(p.y).toBeGreaterThanOrEqual(-6.1);
      expect(p.y).toBeLessThanOrEqual(-3.9);
    }
  });

  it('scales SVG millimetres to world centimetres at the boundary', () => {
    const square = fixtureSvg(
      '<path class="fabric" d="M 0,0 L 100,0 L 100,50 L 0,50 Z"/>',
    );
    const { shapes } = svgToFabricShapes(square);
    const pts = ringPoints(shapes[0]);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10, 6); // 100mm → 10cm
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(5, 6); // 50mm → 5cm
    expect(MM_TO_CM).toBe(0.1);
  });

  it('flips the Y axis so SVG y-down drafts become three.js y-up', () => {
    const square = fixtureSvg(
      '<path class="fabric" d="M 0,0 L 100,0 L 100,50 L 0,50 Z"/>',
    );
    const { shapes } = svgToFabricShapes(square);
    const ys = ringPoints(shapes[0]).map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(-5, 6);
    expect(Math.max(...ys)).toBeCloseTo(0, 6);
  });

  it('keeps Y unflipped when flipY is disabled', () => {
    const square = fixtureSvg(
      '<path class="fabric" d="M 0,0 L 100,0 L 100,50 L 0,50 Z"/>',
    );
    const { shapes } = svgToFabricShapes(square, {
      ...DEFAULT_SVG_SHAPE_OPTIONS,
      flipY: false,
    });
    const ys = ringPoints(shapes[0]).map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(5, 6);
  });

  it('preserves each ring winding handedness across the mirror', () => {
    const donut = fixtureSvg(
      '<path class="fabric" d="M 0,0 L 100,0 L 100,100 L 0,100 Z M 40,40 L 40,60 L 60,60 L 60,40 Z"/>',
    );
    const original = parseFixture(donut).shapes[0];
    const flipped = svgToFabricShapes(donut).shapes[0];

    const handedness = (s: { getPoints(): { x: number; y: number }[] }) => {
      const pts = s.getPoints();
      let area = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        area += pts[i].x * pts[i + 1].y - pts[i + 1].x * pts[i].y;
      }
      return Math.sign(area);
    };
    expect(handedness(flipped)).toBe(handedness(original));
    expect(flipped.holes.map((h) => handedness(h as never))).toHaveLength(
      original.holes.length,
    );
  });

  it('tessellates transformed shapes with holes into ShapeGeometry', () => {
    const donut = fixtureSvg(
      '<path class="fabric" d="M 0,0 L 100,0 L 100,100 L 0,100 Z M 40,40 L 40,60 L 60,60 L 60,40 Z"/>',
    );
    const [shape] = svgToFabricShapes(donut).shapes;
    const geometry = new ShapeGeometry(shape);
    expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
    expect(geometry.index).not.toBeNull();
  });

  it('exposes the documented default options', () => {
    expect(DEFAULT_SVG_SHAPE_OPTIONS).toEqual({ unitScale: 0.1, flipY: true });
  });
});

describe('transformShape', () => {
  it('mirrors a hand-built shape without flipping its winding', () => {
    const ccw = new Shape([
      new Vector2(0, 0),
      new Vector2(4, 0),
      new Vector2(4, 2),
      new Vector2(0, 2),
    ]);
    // unitScale 1 isolates the flip; the default 0.1 also divides by 10.
    const mirrored = transformShape(ccw, { unitScale: 1, flipY: true });
    const pts = ringPoints(mirrored);
    const ys = pts.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(-2, 6);
    expect(Math.max(...ys)).toBeCloseTo(0, 6);
  });
});

/**
 * Real-world evidence: the FreeSewing Titan high-rise draft from the spike
 * (docs/spike/out/titan-highrise.svg). Its two class="fabric" paths are the
 * front and back trouser parts among 10 SVG paths of marks and notes.
 */
const TITAN_SVG = readFileSync(
  join(process.cwd(), 'docs/spike/out/titan-highrise.svg'),
  'utf8',
);

describe('svgToFabricShapes on the Titan fixture', () => {
  const result = svgToFabricShapes(TITAN_SVG);

  it('filters the two fabric parts out of ten SVG paths', () => {
    expect(result.totalPathCount).toBe(10);
    expect(result.fabricPathCount).toBe(2);
    expect(result.shapes.length).toBeGreaterThanOrEqual(2);
  });

  it('matches the spike-recorded round-trip counts for the whole document', () => {
    // docs/spike/out/round-trip-summary.json: all 10 paths → 8 shapes, 50
    // holes (the two fabric parts plus mark paths that tessellate).
    const all = parseFixture(TITAN_SVG);
    const holes = all.shapes.reduce((sum, s) => sum + s.holes.length, 0);
    expect(all.shapes).toHaveLength(8);
    expect(holes).toBe(50);
  });

  it('yields finite, Y-up centimetre geometry for the fabric parts', () => {
    let points = 0;
    let maxY = -Infinity;
    let minY = Infinity;
    for (const shape of result.shapes) {
      for (const p of ringPoints(shape)) {
        points += 1;
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
        maxY = Math.max(maxY, p.y);
        minY = Math.min(minY, p.y);
      }
    }
    // Two trouser-part outlines at 12 divisions per curve.
    expect(points).toBeGreaterThan(50);
    // viewBox is 0..1214.34mm tall; the flip maps all of it to y <= 0, and
    // nothing may exceed the draft's extent in centimetres.
    expect(maxY).toBeLessThanOrEqual(0.01);
    expect(minY).toBeGreaterThanOrEqual(-121.5);
  });
});
