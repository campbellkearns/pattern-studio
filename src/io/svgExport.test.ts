import { describe, expect, it } from 'vitest';
import { createPiece, type Piece } from '../model/piece';
import { closePath, lineTo, moveTo, quadTo } from '../model/path';
import { createProject, type Project } from '../model/project';
import { vec2 } from '../model/vec2';
import { svgToFabricShapes } from '../pipeline/svgShape';
import { exportPiecesSvg, pathToSvgD } from './svgExport';

function rectPiece(id: string, name: string): Piece {
  return createPiece({
    id,
    name,
    outline: [
      moveTo(vec2(0, 0)),
      lineTo(vec2(10, 0)),
      lineTo(vec2(10, 12)),
      lineTo(vec2(0, 12)),
      closePath(),
    ],
    internal: [],
    grainline: { angle: 0, placement: vec2(5, 6) },
    seamAllowance: 1.5,
    cutCount: 2,
  });
}

function curvedPiece(): Piece {
  return createPiece({
    id: 'flap',
    name: 'Flap',
    outline: [
      moveTo(vec2(0, 3)),
      // A curved hem whose control point dips below the anchored y-range,
      // so the control-hull box must be taller than the anchors alone.
      quadTo(vec2(20, -4), vec2(40, 3)),
      lineTo(vec2(40, 14)),
      lineTo(vec2(0, 14)),
      closePath(),
    ],
    internal: [
      moveTo(vec2(14, 8)),
      lineTo(vec2(26, 8)),
      moveTo(vec2(26, 8)),
      lineTo(vec2(24.4, 6.9)),
    ],
    grainline: { angle: 0, placement: vec2(20, 8) },
    seamAllowance: 1.5,
    cutCount: 1,
  });
}

function sampleProject(overrides: Partial<Project> = {}): Project {
  return createProject({
    id: 'proj-svg',
    name: 'Notebook holder',
    measurements: { width: 21 },
    fabric: {
      weave: 'plain',
      weaveScale: 0.12,
      color: '#5b7553',
      weight: 340,
    },
    pieces: [rectPiece('cover', 'Outer cover'), curvedPiece()],
    assembly: [],
    ...overrides,
  });
}

describe('exportPiecesSvg document shape', () => {
  it('emits one fabric path per piece with cut metadata', () => {
    const svg = exportPiecesSvg(sampleProject());
    expect(svg.match(/class="fabric"/g)).toHaveLength(2);
    expect(svg).toContain('data-piece-id="cover"');
    expect(svg).toContain('data-cut-count="2"');
    expect(svg).toContain('data-seam-allowance-cm="1.5"');
    expect(svg).toContain('data-piece-id="flap"');
  });

  it('emits a marks path only for pieces that carry internal marks', () => {
    const svg = exportPiecesSvg(sampleProject());
    expect(svg.match(/class="marks"/g)).toHaveLength(1);
  });

  it('keeps multi-subpath internal marks in one path', () => {
    const svg = exportPiecesSvg(sampleProject());
    const marks = svg.match(/class="marks" d="([^"]+)"/);
    expect(marks?.[1]?.split('M')).toHaveLength(3); // leading + two subpaths
  });

  it('throws a clear error for a project with no pieces', () => {
    const empty = sampleProject({ pieces: [] });
    expect(() => exportPiecesSvg(empty)).toThrow(/no pieces/);
  });
});

describe('units documentation', () => {
  it('sizes the sheet in physical centimetres with a 2 cm margin', () => {
    const svg = exportPiecesSvg(sampleProject());
    // Union of both outlines: x 0..40, y -4..14 (the curved hem's control
    // hull dips to -4) → 44 × 22 cm.
    expect(svg).toContain('width="44cm"');
    expect(svg).toContain('height="22cm"');
    expect(svg).toContain('viewBox="0 0 44 22"');
  });

  it('documents the cm unit and y orientation in the output', () => {
    const svg = exportPiecesSvg(sampleProject());
    expect(svg).toContain('1 user unit = 1 cm');
    expect(svg).toContain('100% scale');
    expect(svg).toMatch(/<!--[\s\S]*-->/);
  });
});

describe('geometry mapping', () => {
  it('flips y about the sheet top with the margin applied', () => {
    const svg = exportPiecesSvg(
      sampleProject({ pieces: [rectPiece('cover', 'Outer cover')] }),
    );
    // Sheet: 14 × 16 (10×12 piece + 2 cm margins). The model's (0,0) — the
    // y-up bottom-left corner — lands at the paper's bottom-left.
    expect(svg).toContain('d="M 2 14 L 12 14 L 12 2 L 2 2 Z"');
  });

  it('contains the curve within the sheet using its control hull', () => {
    const svg = exportPiecesSvg(sampleProject({ pieces: [curvedPiece()] }));
    // The curve's control point dips to y = -4; the hull box reaches it, so
    // the sheet is 44 × 22 (anchors alone would give 18).
    expect(svg).toContain('width="44cm"');
    expect(svg).toContain('height="22cm"');
  });

  it('formats path data without float noise', () => {
    const d = pathToSvgD(
      [moveTo(vec2(0.1, 2)), lineTo(vec2(-0.00001, 0)), closePath()],
      { minX: -1, minY: 0, maxX: 1, maxY: 2 },
      0,
    );
    // y-up model → y-down paper: model y=2 (the box's top) lands at paper
    // y=0, and -0.00001 + 1 formats to "1" after 4-decimal trimming.
    expect(d).toBe('M 1.1 0 L 1 2 Z');
  });
});

describe('XML escaping', () => {
  it('escapes markup characters in names', () => {
    const svg = exportPiecesSvg(
      sampleProject({ pieces: [rectPiece('a&b', '<Cover> "v2"')] }),
      { title: 'Tom & Jerry <cutlist>' },
    );
    expect(svg).toContain('<title>Tom &amp; Jerry &lt;cutlist&gt;</title>');
    expect(svg).toContain('<title>&lt;Cover&gt; &quot;v2&quot;</title>');
    expect(svg).toContain('data-piece-id="a&amp;b"');
  });
});

describe('pipeline round trip (D4: same source of truth)', () => {
  it('re-imports through the SVG pipeline as the same fabric shapes', () => {
    const svg = exportPiecesSvg(sampleProject());
    const result = svgToFabricShapes(svg, { unitScale: 1, flipY: false });
    expect(result.fabricPathCount).toBe(2);
    expect(result.shapes).toHaveLength(2);
  });

  it('keeps internal marks out of the fabric shapes', () => {
    const svg = exportPiecesSvg(sampleProject());
    const result = svgToFabricShapes(svg, { unitScale: 1, flipY: false });
    // Three path elements total (2 outlines + 1 marks); only fabric-class
    // outlines may become shapes.
    expect(result.totalPathCount).toBe(3);
  });
});
