/**
 * Procedural cutting-mat texture. The grid is drawn at physical scale — one
 * canvas tile covers TILE_CM world centimetres, and since the viewport's
 * world unit is 1 cm, grid spacing on screen is true scale. Browser-only
 * (needs CanvasRenderingContext2D); jsdom tests avoid it.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/** World centimetres covered by one texture tile. */
export const MAT_TILE_CM = 10;
/** Canvas pixels per world centimetre. */
const PX_PER_CM = 24;

export interface MatGridSpec {
  readonly base: string;
  readonly minorEveryCm: number;
  readonly mediumEveryCm: number;
  readonly majorEveryCm: number;
}

const GRID: MatGridSpec = {
  base: '#43524a',
  minorEveryCm: 1,
  mediumEveryCm: 5,
  majorEveryCm: MAT_TILE_CM,
};

/**
 * Grid line positions in tile-local centimetres. Exported for tests — the
 * pixel drawing below is jsdom-hostile (no 2d context), but the geometry of
 * the grid is the true-scale contract.
 */
export function matGridLines(spec: MatGridSpec = GRID): {
  minor: number[];
  medium: number[];
  major: number[];
} {
  const minor: number[] = [];
  const medium: number[] = [];
  const major: number[] = [];
  for (let cm = 0; cm <= MAT_TILE_CM; cm++) {
    if (cm % spec.majorEveryCm === 0) major.push(cm);
    else if (cm % spec.mediumEveryCm === 0) medium.push(cm);
    else if (cm % spec.minorEveryCm === 0) minor.push(cm);
  }
  return { minor, medium, major };
}

const STYLES = {
  minor: 'rgba(255, 255, 255, 0.10)',
  medium: 'rgba(255, 255, 255, 0.20)',
  major: 'rgba(255, 255, 255, 0.38)',
} as const;

export function createMatTexture(): CanvasTexture {
  const size = MAT_TILE_CM * PX_PER_CM;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('cutting mat requires a 2d canvas context');
  }

  ctx.fillStyle = GRID.base;
  ctx.fillRect(0, 0, size, size);

  const drawLines = (
    cms: readonly number[],
    style: string,
    width: number,
  ): void => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    for (const cm of cms) {
      const px = cm * PX_PER_CM;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, px);
      ctx.lineTo(size, px);
      ctx.stroke();
    }
  };

  const { minor, medium, major } = matGridLines();
  drawLines(minor, STYLES.minor, 1);
  drawLines(medium, STYLES.medium, 1.5);
  drawLines(major, STYLES.major, 2);

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
