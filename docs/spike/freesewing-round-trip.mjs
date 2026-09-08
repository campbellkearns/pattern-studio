/**
 * FreeSewing spike — draft → SVG → THREE.Shape round-trip (docs only, not wired into CI).
 *
 * Proves the pipeline the blueprint architecture figure assumes (D2/Q1):
 *   1. Draft Titan (unisex trouser block) with high-rise-oriented options.
 *   2. Render the pattern to SVG via FreeSewing core.
 *   3. Parse that SVG with three.js SVGLoader.parse() → SVGLoader.createShapes()
 *      → THREE.Shape objects (PR #21380 hole handling), i.e. renderable geometry.
 *
 * Run (deps are intentionally NOT in package.json — this PR stays docs-only):
 *   npm install --no-save @freesewing/core@4.10.1 @freesewing/titan@4.10.1 \
 *     @freesewing/models@4.10.1 @freesewing/config@4.10.1 @freesewing/plugin-measurements@4.10.1
 *   node docs/spike/freesewing-round-trip.mjs
 *
 * Option values are fractions (docs' 100% → 1.0); angles are degrees.
 * FreeSewing model measurements are millimetres; SVG coordinates follow (y-down).
 */
import { JSDOM } from 'jsdom';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// SVGLoader.parse() needs a DOM; jsdom ships with the scaffold devDependencies.
const dom = new JSDOM('<!DOCTYPE html>');
globalThis.DOMParser = dom.window.DOMParser;

const { Titan } = await import('@freesewing/titan');
const { measurementsPlugin } = await import('@freesewing/plugin-measurements');
const { cisMaleAdult40 } = await import('@freesewing/models');
const THREE = await import('three');
const { SVGLoader } = await import('three/examples/jsm/loaders/SVGLoader.js');

// --- 1. Measurements: FreeSewing's published men's size 40 model (mm) ------
const measurements = { ...cisMaleAdult40 };

// --- 2. High-rise-oriented settings -----------------------------------------
// waistHeight 1.0 = waistband at the natural waist line (docs: 100% = waist, 0% = hip).
// crotchDrop 0.02 = FreeSewing default; the fork (crotch point) sits at
// waistToUpperLeg * (1 + crotchDrop) — the crotch-depth lever.
// Front crotch curve  = crotchSeamCurve{Start,Bend,Angle} (consumed by front.mjs)
// Back crotch curve   = crossSeamCurve{Start,Bend,Angle}  (consumed by back.mjs)
// Men's-drafting asymmetry (sewingforaliving table): flatter/longer back extension —
// exercised here by drafting the back cross-seam curve differently from the front.
// Titan 4.10.1 ships option definitions at the part level (back.mjs), so defaults
// resolve themselves — only the levers we exercise need passing. The fit* options
// MUST keep their `true` defaults: back.mjs only creates `points.forkCp2` inside
// the fitCrossSeam block, and both parts' inseam paths depend on it.
const highRise = {
  waistHeight: 1.0, // natural waist (high rise)
  crotchDrop: 0.02,
  // Front: steeper, shorter extension (men's front is the shallower curve)
  crotchSeamCurveStart: 0.8,
  crotchSeamCurveBend: 0.8,
  crotchSeamCurveAngle: 25,
  // Back: flatter, later-curving extension (independent of front)
  crossSeamCurveStart: 0.9,
  crossSeamCurveBend: 0.7,
  crossSeamCurveAngle: 12,
  seatEase: 0.02,
  waistEase: 0.02,
  kneeEase: 0.06,
  lengthBonus: 0.02,
  legBalance: 0.575,
  waistBalance: 0.6,
  grainlinePosition: 0.45,
};
// Contrast draft: hip-riding waistband + dropped crotch (the levers visibly move).
const lowRise = { ...highRise, waistHeight: 0.5, crotchDrop: 0.1 };

const draftAndParse = (label, options) => {
  // Design constructors take each set of settings as a variadic argument.
  const pattern = new Titan({ measurements, options });
  pattern.use(measurementsPlugin);
  pattern.draft();

  const svg = pattern.render();
  const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out');
  mkdirSync(outDir, { recursive: true });
  const svgPath = join(outDir, `titan-${label}.svg`);
  writeFileSync(svgPath, svg);

  // Drafted point evidence: fork depth relative to the waist on the center line.
  const parts = pattern.parts[0] ?? pattern.parts;
  const partData = {};
  for (const name of ['back', 'front']) {
    // v4 keys parts by `design.part` (e.g. `titan.back`).
    const part = parts[`titan.${name}`] ?? parts[name];
    if (!part) continue;
    const pts = {};
    for (const key of ['fork', 'waistIn', 'waistOut', 'cfSeat', 'cbSeat']) {
      if (part.points[key])
        pts[key] = { x: part.points[key].x, y: part.points[key].y };
    }
    partData[name] = pts;
  }

  // --- 3. SVG → THREE.Shape round-trip ---------------------------------------
  const loader = new SVGLoader();
  const { paths } = loader.parse(svg);
  let shapeCount = 0;
  let holeCount = 0;
  let pointCount = 0;
  const perPath = paths.map((path, i) => {
    const shapes = SVGLoader.createShapes(path); // PR #21380: fill-rule-aware, handles holes
    for (const shape of shapes) {
      shapeCount++;
      holeCount += shape.holes.length;
      pointCount += shape.getPoints(12).length;
    }
    return {
      pathIndex: i,
      subPaths: path.subPaths.length,
      shapes: shapes.length,
    };
  });

  return {
    svgBytes: svg.length,
    svgPath,
    svgPathCount: paths.length,
    perPath,
    shapeCount,
    holeCount,
    pointCount,
    isShape: shapeCount > 0,
    partData,
  };
};

const results = {
  core: '@freesewing/core 4.10.1',
  three: `three ${THREE.REVISION}`,
  model: 'cisMaleAdult40 (mm)',
  highRise: draftAndParse('highrise', highRise),
  lowRise: draftAndParse('lowrise', lowRise),
};

writeFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    'out',
    'round-trip-summary.json',
  ),
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));

// Fail loudly if the pipeline produced no renderable geometry.
if (results.highRise.shapeCount === 0) {
  console.error('ROUND-TRIP FAILED: zero THREE.Shape objects produced');
  process.exit(1);
}
