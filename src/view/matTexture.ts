/**
 * Procedural cutting-mat texture, v2. The whole mat is one canvas at
 * physical scale — one pixel grid covers MAT_WIDTH_CM × MAT_DEPTH_CM world
 * centimetres, and since the viewport's world unit is 1 cm, everything
 * printed on the mat (ladder, rulers, angle guides, labels) is true scale.
 *
 * Every drawing decision is exportable, testable geometry in the
 * matGridLines pattern: the pure functions below are jsdom-safe and pinned
 * by unit tests; the canvas renderer at the bottom merely strokes them.
 * Browser-only (needs CanvasRenderingContext2D); jsdom tests avoid it.
 */
import { CanvasTexture, SRGBColorSpace } from 'three';
import {
  MAT_DEPTH_CM,
  MAT_TILE_CM,
  MAT_WIDTH_CM,
} from './matSurface';
import { CUTTING_MAT_GREEN, GRID_AZURE, PAPER } from '../tokens';

/** Canvas pixels per world centimetre. */
const PX_PER_CM = 24;

export interface MatGridSpec {
  readonly base: string;
  readonly minorEveryCm: number;
  readonly mediumEveryCm: number;
  readonly majorEveryCm: number;
}

const GRID: MatGridSpec = {
  base: CUTTING_MAT_GREEN,
  minorEveryCm: 1,
  mediumEveryCm: 5,
  majorEveryCm: MAT_TILE_CM,
};

/** Token hex → rgba string, so every mat color derives from one token. */
const withAlpha = (hex: string, alpha: number): string => {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Grid line positions in absolute mat centimetres, 0..lengthCm, tiered by
 * the ladder spec. The v1 tile (matGridLines) is this function evaluated
 * over one MAT_TILE_CM tile — the ladder is identical everywhere because
 * the tile aligns with the mat origin.
 */
export function matLadderLines(
  spec: MatGridSpec,
  lengthCm: number,
): { minor: number[]; medium: number[]; major: number[] } {
  const minor: number[] = [];
  const medium: number[] = [];
  const major: number[] = [];
  for (let cm = 0; cm <= lengthCm; cm++) {
    if (cm % spec.majorEveryCm === 0) major.push(cm);
    else if (cm % spec.mediumEveryCm === 0) medium.push(cm);
    else if (cm % spec.minorEveryCm === 0) minor.push(cm);
  }
  return { minor, medium, major };
}

/**
 * Grid line positions in tile-local centimetres for one MAT_TILE_CM tile.
 * Kept as the tile-scale expression of the ladder contract (and its tests).
 */
export function matGridLines(spec: MatGridSpec = GRID): {
  minor: number[];
  medium: number[];
  major: number[];
} {
  return matLadderLines(spec, MAT_TILE_CM);
}

// --- Edge rulers ---------------------------------------------------------

/**
 * Ruler cadence, chosen for legibility at both fit zoom and close zoom:
 * numerals every 50 cm (the blueprint figure's cadence — only 4 numerals on
 * the bottom edge, so they stay readable when the whole mat is framed) and
 * minor ticks every 5 cm for close-work counting. The 1/5/10 grid ladder
 * carries the intermediate scale, so the ruler stays uncluttered.
 */
export const RULER_NUMERAL_EVERY_CM = 50;
export const RULER_TICK_EVERY_CM = 5;

export interface RulerNumeral {
  readonly cm: number;
  readonly label: string;
}

export interface EdgeRuler {
  readonly minorTicks: number[];
  readonly numerals: readonly RulerNumeral[];
}

/**
 * One edge ruler running 0..lengthCm from the origin corner. The final
 * numeral carries the unit when unitOnLast (the figure prints "150 cm" on
 * the bottom ruler and bare "0/50/100" on the left).
 */
export function edgeRuler(
  lengthCm: number,
  unitOnLast: boolean,
  numeralEveryCm: number = RULER_NUMERAL_EVERY_CM,
  tickEveryCm: number = RULER_TICK_EVERY_CM,
): EdgeRuler {
  const minorTicks: number[] = [];
  const numerals: RulerNumeral[] = [];
  for (let cm = 0; cm <= lengthCm; cm += tickEveryCm) {
    if (cm % numeralEveryCm === 0) {
      const last = cm === lengthCm;
      numerals.push({
        cm,
        label: last && unitOnLast ? `${cm} cm` : `${cm}`,
      });
    } else {
      minorTicks.push(cm);
    }
  }
  return { minorTicks, numerals };
}

// --- Angle guides --------------------------------------------------------

/** Guides from the origin corner, in degrees off the bottom edge. */
export const ANGLE_GUIDE_DEGREES: readonly number[] = [30, 45, 60];

/**
 * Guides begin this far out from the corner so the origin cross, squaring
 * mark, and label keep a clear dashed-free zone (the shallow 30° ray would
 * otherwise graze the corner furniture).
 */
export const ANGLE_GUIDE_START_CM = 10;

/** Radial distance of the degree label along its ray, in centimetres. */
export const ANGLE_GUIDE_LABEL_CM = 88;

export interface AngleGuide {
  readonly angleDeg: number;
  /** Ray start, in mat centimetres from the origin corner. */
  readonly startX: number;
  readonly startY: number;
  /** Ray end on the mat boundary. */
  readonly endX: number;
  readonly endY: number;
  /** Label anchor. */
  readonly labelX: number;
  readonly labelY: number;
}

/**
 * Dashed angle guides fanning from the origin corner into the mat. Each ray
 * runs from ANGLE_GUIDE_START_CM out to the mat boundary; its label sits on
 * the ray at a fixed radius (clamped inside the boundary minus a small
 * margin). Placement space: x across the mat, y into it.
 */
export function angleGuides(
  widthCm: number = MAT_WIDTH_CM,
  depthCm: number = MAT_DEPTH_CM,
  startCm: number = ANGLE_GUIDE_START_CM,
  labelCm: number = ANGLE_GUIDE_LABEL_CM,
): AngleGuide[] {
  return ANGLE_GUIDE_DEGREES.map((angleDeg) => {
    const rad = (angleDeg * Math.PI) / 180;
    const dirX = Math.cos(rad);
    const dirY = Math.sin(rad);
    // Distance along the ray where it exits the mat (whichever edge first).
    const endT = Math.min(widthCm / dirX, depthCm / dirY);
    const labelT = Math.min(labelCm, endT - 5);
    return {
      angleDeg,
      startX: startCm * dirX,
      startY: startCm * dirY,
      endX: endT * dirX,
      endY: endT * dirY,
      labelX: labelT * dirX,
      labelY: labelT * dirY,
    };
  });
}

// --- Origin corner -------------------------------------------------------

export const ORIGIN_CROSS_CENTRE_CM = { x: 4.5, y: 4.5 } as const;
export const ORIGIN_CROSS_HALF_ARM_CM = 1.4;
export const ORIGIN_LABEL = 'origin · corner-squared';
/** Rotated label anchor: up the left edge, clear of the 60° ray. */
export const ORIGIN_LABEL_POS_CM = { x: 1.6, y: 10.5 } as const;

export interface SegmentCm {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** The origin cross: two short axis-parallel strokes centred just inside. */
export function originCross(): [SegmentCm, SegmentCm] {
  const { x, y } = ORIGIN_CROSS_CENTRE_CM;
  const arm = ORIGIN_CROSS_HALF_ARM_CM;
  return [
    { x1: x - arm, y1: y, x2: x + arm, y2: y },
    { x1: x, y1: y - arm, x2: x, y2: y + arm },
  ];
}

// --- Corner squaring marks ----------------------------------------------

export const SQUARING_ARM_CM = 6;
export const SQUARING_INSET_CM = 2;

/**
 * L-shaped right-angle marks hugging all four corners (the marks paper and
 * fabric are squared against). Arms run parallel to the edges, inset from
 * both. Order: origin, near-right, far-left, far-right.
 */
export function cornerSquaringMarks(
  widthCm: number = MAT_WIDTH_CM,
  depthCm: number = MAT_DEPTH_CM,
): SegmentCm[][] {
  const inset = SQUARING_INSET_CM;
  const arm = SQUARING_ARM_CM;
  const mark = (cx: number, cy: number, sx: number, sy: number): SegmentCm[] => [
    // Vertical arm and horizontal arm, both starting at the inset point.
    { x1: cx + sx * inset, y1: cy + sy * inset, x2: cx + sx * inset, y2: cy + sy * (inset + arm) },
    { x1: cx + sx * inset, y1: cy + sy * inset, x2: cx + sx * (inset + arm), y2: cy + sy * inset },
  ];
  return [
    mark(0, 0, 1, 1),
    mark(widthCm, 0, -1, 1),
    mark(0, depthCm, 1, -1),
    mark(widthCm, depthCm, -1, -1),
  ];
}

// --- Dimension label ------------------------------------------------------

/** Per the blueprint's mat-anatomy figure: right of centre, mid-depth. */
export const DIMENSION_LABEL_FACTORS = { x: 0.71, y: 0.57 } as const;

export function dimensionLabel(
  widthCm: number = MAT_WIDTH_CM,
  depthCm: number = MAT_DEPTH_CM,
): { xCm: number; yCm: number; text: string; sub: string } {
  return {
    xCm: widthCm * DIMENSION_LABEL_FACTORS.x,
    yCm: depthCm * DIMENSION_LABEL_FACTORS.y,
    text: `${widthCm} × ${depthCm} cm`,
    sub: 'fixed reference mat',
  };
}

// --- Placement → canvas mapping -------------------------------------------

/** Mat x (across, from the origin corner) → canvas pixel column. */
export function canvasXForCm(xCm: number): number {
  return xCm * PX_PER_CM;
}

/**
 * Mat y (depth, from the origin corner at the near edge) → canvas pixel
 * row. Canvas rows run top-down and the texture's flipY maps the canvas
 * top to the mat's far edge, so placement y lands bottom-up: the origin
 * corner is the canvas bottom-left.
 */
export function canvasYForCm(yCm: number, depthCm: number = MAT_DEPTH_CM): number {
  return (depthCm - yCm) * PX_PER_CM;
}

// --- Renderer --------------------------------------------------------------

const STYLES = {
  minor: withAlpha(GRID_AZURE, 0.45),
  medium: withAlpha(GRID_AZURE, 0.7),
  major: GRID_AZURE, // 3.59:1 on the green base — clears WCAG 1.4.11
  print: withAlpha(PAPER, 0.62),
  printStrong: withAlpha(PAPER, 0.85),
  guide: withAlpha(GRID_AZURE, 0.35),
} as const;

/** The app's UI stack; canvas print should match the atelier typography. */
const FONT_STACK = "'Avenir Next', 'Segoe UI', system-ui, sans-serif";

export function createMatTexture(): CanvasTexture {
  const widthPx = canvasXForCm(MAT_WIDTH_CM);
  const heightPx = canvasYForCm(0);
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('cutting mat requires a 2d canvas context');
  }

  // Self-healing base.
  ctx.fillStyle = GRID.base;
  ctx.fillRect(0, 0, widthPx, heightPx);

  // True-scale 1/5/10 ladder, absolute positions (v1 stamped a repeating
  // 10 cm tile; the v2 full-mat canvas draws the same tiers in place so the
  // printed furniture can share the canvas).
  const drawLadderLines = (cms: readonly number[], style: string, width: number, vertical: boolean): void => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    for (const cm of cms) {
      const px = vertical ? canvasXForCm(cm) : canvasYForCm(cm);
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(px, 0);
        ctx.lineTo(px, heightPx);
      } else {
        ctx.moveTo(0, px);
        ctx.lineTo(widthPx, px);
      }
      ctx.stroke();
    }
  };
  const across = matLadderLines(GRID, MAT_WIDTH_CM);
  const into = matLadderLines(GRID, MAT_DEPTH_CM);
  drawLadderLines(across.minor, STYLES.minor, 1, true);
  drawLadderLines(into.minor, STYLES.minor, 1, false);
  drawLadderLines(across.medium, STYLES.medium, 1.5, true);
  drawLadderLines(into.medium, STYLES.medium, 1.5, false);
  drawLadderLines(across.major, STYLES.major, 2, true);
  drawLadderLines(into.major, STYLES.major, 2, false);

  // Edge rulers: bottom edge (x across) and left edge (y into the mat).
  // Ticks reach up from the edge; numerals sit just inside the tick tops.
  const TICK_MINOR_CM = 1;
  const TICK_NUMERAL_CM = 2.2;
  const drawRuler = (ruler: EdgeRuler, edge: 'bottom' | 'left'): void => {
    ctx.strokeStyle = STYLES.print;
    ctx.lineWidth = 2;
    for (const cm of ruler.minorTicks) {
      const tickLen = TICK_MINOR_CM * PX_PER_CM;
      ctx.beginPath();
      if (edge === 'bottom') {
        const y = heightPx;
        ctx.moveTo(canvasXForCm(cm), y);
        ctx.lineTo(canvasXForCm(cm), y - tickLen);
      } else {
        const x = 0;
        ctx.moveTo(x, canvasYForCm(cm));
        ctx.lineTo(x + tickLen, canvasYForCm(cm));
      }
      ctx.stroke();
    }
    ctx.fillStyle = STYLES.print;
    ctx.font = `42px ${FONT_STACK}`;
    for (const { cm, label } of ruler.numerals) {
      const tickLen = TICK_NUMERAL_CM * PX_PER_CM;
      ctx.beginPath();
      if (edge === 'bottom') {
        const y = heightPx;
        ctx.moveTo(canvasXForCm(cm), y);
        ctx.lineTo(canvasXForCm(cm), y - tickLen);
      } else {
        const x = 0;
        ctx.moveTo(x, canvasYForCm(cm));
        ctx.lineTo(x + tickLen, canvasYForCm(cm));
      }
      ctx.stroke();
      // Numerals: centred over their tick, nudged inward at the ends so the
      // corner "0" and the unit-carrying last label stay on the canvas.
      ctx.textAlign = cm === 0 ? 'left' : cm === lastCm(ruler) ? 'right' : 'center';
      const pad = 8;
      if (edge === 'bottom') {
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, canvasXForCm(cm) + (cm === 0 ? pad : cm === lastCm(ruler) ? -pad : 0), heightPx - tickLen - 6);
      } else {
        ctx.textBaseline = 'middle';
        ctx.fillText(label, tickLen + 10, canvasYForCm(cm) + (cm === 0 ? 22 : cm === lastCm(ruler) ? -22 : 0));
      }
    }
  };
  drawRuler(edgeRuler(MAT_WIDTH_CM, true), 'bottom');
  drawRuler(edgeRuler(MAT_DEPTH_CM, false), 'left');

  // Dashed angle guides from the origin corner, with degree labels.
  ctx.strokeStyle = STYLES.guide;
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 10]);
  for (const guide of angleGuides()) {
    ctx.beginPath();
    ctx.moveTo(canvasXForCm(guide.startX), canvasYForCm(guide.startY));
    ctx.lineTo(canvasXForCm(guide.endX), canvasYForCm(guide.endY));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = STYLES.print;
  ctx.font = `38px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  for (const guide of angleGuides()) {
    ctx.fillText(`${guide.angleDeg}°`, canvasXForCm(guide.labelX) + 10, canvasYForCm(guide.labelY) - 8);
  }

  // Origin cross + rotated label up the left edge.
  ctx.strokeStyle = STYLES.printStrong;
  ctx.lineWidth = 3;
  for (const seg of originCross()) {
    ctx.beginPath();
    ctx.moveTo(canvasXForCm(seg.x1), canvasYForCm(seg.y1));
    ctx.lineTo(canvasXForCm(seg.x2), canvasYForCm(seg.y2));
    ctx.stroke();
  }
  ctx.fillStyle = STYLES.print;
  ctx.font = `34px ${FONT_STACK}`;
  ctx.save();
  ctx.translate(canvasXForCm(ORIGIN_LABEL_POS_CM.x), canvasYForCm(ORIGIN_LABEL_POS_CM.y));
  ctx.rotate(-Math.PI / 2); // reads bottom-to-top: from the near edge into the mat
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(ORIGIN_LABEL, 0, 0);
  ctx.restore();

  // Corner squaring marks at all four corners.
  ctx.strokeStyle = STYLES.print;
  ctx.lineWidth = 3;
  for (const mark of cornerSquaringMarks()) {
    for (const seg of mark) {
      ctx.beginPath();
      ctx.moveTo(canvasXForCm(seg.x1), canvasYForCm(seg.y1));
      ctx.lineTo(canvasXForCm(seg.x2), canvasYForCm(seg.y2));
      ctx.stroke();
    }
  }

  // Dimension label, per the blueprint figure's placement.
  const dim = dimensionLabel();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = STYLES.printStrong;
  ctx.font = `48px ${FONT_STACK}`;
  ctx.fillText(dim.text, canvasXForCm(dim.xCm), canvasYForCm(dim.yCm));
  ctx.fillStyle = STYLES.print;
  ctx.font = `32px ${FONT_STACK}`;
  ctx.fillText(dim.sub, canvasXForCm(dim.xCm), canvasYForCm(dim.yCm) + 40);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Helper for the ruler numeral end-nudging above (purely presentational).
function lastCm(ruler: EdgeRuler): number {
  return ruler.numerals[ruler.numerals.length - 1].cm;
}
