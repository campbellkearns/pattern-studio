/**
 * SVG export (F7 + D4) — the print boundary.
 *
 * The model's PathCmd streams are the single vector source of truth: the
 * three.js renderer reads them for the mat, this exporter reads them for
 * paper. Nothing re-derives geometry — outlines and internal marks go out
 * exactly as stored.
 *
 * Units are documented in the output itself: 1 SVG user unit = 1 cm and the
 * root carries width/height in physical centimetres, so printing at 100%
 * scale (no "fit to page") yields true dimensions. The model is y-up; paper
 * is y-down, so coordinates flip about the sheet's top edge — the inverse
 * of the import-boundary flip in src/pipeline/svgShape.ts.
 *
 * Pure module: Project in, SVG string out.
 */
import type { PathCmd, Project, Vec2 } from '../model';

export interface SvgExportOptions {
  /** Blank paper margin around the pieces, in centimetres. */
  readonly marginCm: number;
  /** Document title inside the SVG. */
  readonly title: string;
}

export const DEFAULT_SVG_EXPORT_OPTIONS: SvgExportOptions = {
  marginCm: 2,
  title: 'Pattern pieces',
};

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Every point a command references, including control points. */
function cmdPoints(cmd: PathCmd): readonly Vec2[] {
  switch (cmd.type) {
    case 'M':
    case 'L':
      return [cmd.point];
    case 'C':
      return [cmd.control1, cmd.control2, cmd.point];
    case 'Q':
      return [cmd.control, cmd.point];
    case 'Z':
      return [];
  }
}

/**
 * Bounding box over all referenced points. Control points are included on
 * purpose: a curve always lies inside its control hull, so this can only
 * overestimate the sheet — a guarantee curves never clip at the paper edge.
 */
function pathBox(cmds: readonly PathCmd[]): Box {
  let box: Box | null = null;
  for (const cmd of cmds) {
    for (const point of cmdPoints(cmd)) {
      box = box
        ? {
            minX: Math.min(box.minX, point.x),
            minY: Math.min(box.minY, point.y),
            maxX: Math.max(box.maxX, point.x),
            maxY: Math.max(box.maxY, point.y),
          }
        : { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };
    }
  }
  if (!box) throw new Error('cannot measure an empty path');
  return box;
}

function unionBox(boxes: readonly Box[]): Box {
  if (boxes.length === 0) throw new Error('cannot union zero boxes');
  return boxes.reduce((acc, box) => ({
    minX: Math.min(acc.minX, box.minX),
    minY: Math.min(acc.minY, box.minY),
    maxX: Math.max(acc.maxX, box.maxX),
    maxY: Math.max(acc.maxY, box.maxY),
  }));
}

/** Fixed 4-decimal formatting with trailing zeros trimmed: 12.5000 → "12.5". */
function formatNumber(value: number): string {
  const fixed = value.toFixed(4);
  const trimmed = fixed.includes('.')
    ? fixed.replace(/0+$/, '').replace(/\.$/, '')
    : fixed;
  return trimmed === '-0' ? '0' : trimmed;
}

function escapeXml(text: string): string {
  const escaped: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  };
  return text.replace(/[&<>"']/g, (ch) => escaped[ch] ?? ch);
}

/** Model (y-up cm) → paper (y-down user units): flip about the sheet's top edge. */
function toPaper(point: Vec2, box: Box, marginCm: number): Vec2 {
  return {
    x: point.x - box.minX + marginCm,
    y: box.maxY - point.y + marginCm,
  };
}

/** SVG path data for a model command stream, in paper coordinates. */
export function pathToSvgD(
  cmds: readonly PathCmd[],
  box: Box,
  marginCm: number,
): string {
  const parts: string[] = [];
  const point = (v: Vec2): string => {
    const p = toPaper(v, box, marginCm);
    return `${formatNumber(p.x)} ${formatNumber(p.y)}`;
  };
  for (const cmd of cmds) {
    switch (cmd.type) {
      case 'M':
        parts.push(`M ${point(cmd.point)}`);
        break;
      case 'L':
        parts.push(`L ${point(cmd.point)}`);
        break;
      case 'C':
        parts.push(
          `C ${point(cmd.control1)} ${point(cmd.control2)} ${point(cmd.point)}`,
        );
        break;
      case 'Q':
        parts.push(`Q ${point(cmd.control)} ${point(cmd.point)}`);
        break;
      case 'Z':
        parts.push('Z');
        break;
    }
  }
  return parts.join(' ');
}

/**
 * Render every piece of a project to a print-ready SVG document. Pieces are
 * grouped with `class="fabric"` on their outline — the same convention the
 * FreeSewing import pipeline filters on, so exported files feed straight
 * back through `svgToFabricShapes`.
 */
export function exportPiecesSvg(
  project: Project,
  overrides: Partial<SvgExportOptions> = {},
): string {
  const options = { ...DEFAULT_SVG_EXPORT_OPTIONS, ...overrides };
  if (project.pieces.length === 0) {
    throw new Error('cannot export a project with no pieces to SVG');
  }

  const box = unionBox(project.pieces.map((piece) => pathBox(piece.outline)));
  const width = box.maxX - box.minX + 2 * options.marginCm;
  const height = box.maxY - box.minY + 2 * options.marginCm;

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!--',
    '  Pattern Studio SVG export — true-scale pattern pieces.',
    '  Units: 1 user unit = 1 cm; the root width/height are physical',
    '  centimetres, so print at 100% scale (no "fit to page").',
    "  Y points down (paper coordinates); the model's y-up streams are",
    "  flipped about the sheet's top edge — the inverse of the SVG-import flip.",
    '-->',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(width)}cm" height="${formatNumber(height)}cm" viewBox="0 0 ${formatNumber(width)} ${formatNumber(height)}" role="img" aria-label="${escapeXml(options.title)}">`,
    `  <title>${escapeXml(options.title)}</title>`,
  ];

  for (const piece of project.pieces) {
    lines.push(
      `  <g class="piece" data-piece-id="${escapeXml(piece.id)}" data-cut-count="${piece.cutCount}" data-seam-allowance-cm="${formatNumber(piece.seamAllowance)}" data-grainline-angle-deg="${formatNumber(piece.grainline.angle)}">`,
      `    <title>${escapeXml(piece.name)}</title>`,
      `    <path class="fabric" d="${pathToSvgD(piece.outline, box, options.marginCm)}" fill="none" stroke="#1c242b" stroke-width="0.25"/>`,
    );
    if (piece.internal.length > 0) {
      lines.push(
        `    <path class="marks" d="${pathToSvgD(piece.internal, box, options.marginCm)}" fill="none" stroke="#4a5560" stroke-width="0.15"/>`,
      );
    }
    lines.push('  </g>');
  }

  lines.push('</svg>');
  return `${lines.join('\n')}\n`;
}
