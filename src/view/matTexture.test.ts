import { describe, expect, it } from 'vitest';
import { MAT_DEPTH_CM, MAT_TILE_CM, MAT_WIDTH_CM } from './matSurface';
import {
  ANGLE_GUIDE_DEGREES,
  ORIGIN_CROSS_CENTRE_CM,
  RULER_NUMERAL_EVERY_CM,
  RULER_TICK_EVERY_CM,
  SQUARING_ARM_CM,
  SQUARING_INSET_CM,
  angleGuides,
  canvasXForCm,
  canvasYForCm,
  cornerSquaringMarks,
  dimensionLabel,
  edgeRuler,
  matGridLines,
  matLadderLines,
  originCross,
} from './matTexture';

describe('matGridLines', () => {
  it('tiers the default 10 cm tile: 1 cm minor, 5 cm medium, 10 cm major', () => {
    const grid = matGridLines();
    expect(grid.major).toEqual([0, 10]);
    expect(grid.medium).toEqual([5]);
    expect(grid.minor).toEqual([1, 2, 3, 4, 6, 7, 8, 9]);
  });

  it('keeps every line in exactly one tier', () => {
    const grid = matGridLines();
    const all = [...grid.major, ...grid.medium, ...grid.minor];
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort((a, b) => a - b)).toEqual(
      Array.from({ length: MAT_TILE_CM + 1 }, (_, i) => i),
    );
  });

  it('honours a custom tier spec', () => {
    const grid = matGridLines({
      base: '#000000',
      minorEveryCm: 1,
      mediumEveryCm: 2,
      majorEveryCm: 4,
    });
    expect(grid.major).toEqual([0, 4, 8]);
    // 10 misses the major tier and falls to medium.
    expect(grid.medium).toEqual([2, 6, 10]);
    expect(grid.minor).toEqual([1, 3, 5, 7, 9]);
  });
});

describe('matLadderLines', () => {
  it('is the tile ladder, evaluated over the full mat', () => {
    const across = matLadderLines(
      {
        base: '#43524a',
        minorEveryCm: 1,
        mediumEveryCm: 5,
        majorEveryCm: MAT_TILE_CM,
      },
      MAT_WIDTH_CM,
    );
    // Majors every 10 cm across the whole 150 cm mat, tile-aligned.
    expect(across.major).toEqual(
      Array.from({ length: MAT_WIDTH_CM / MAT_TILE_CM + 1 }, (_, i) => i * MAT_TILE_CM),
    );
    expect(across.medium).toEqual([5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115, 125, 135, 145]);
    // Totality: every cm lands in exactly one tier.
    const all = [...across.major, ...across.medium, ...across.minor];
    expect(all.length).toBe(MAT_WIDTH_CM + 1);
    expect(new Set(all).size).toBe(all.length);
  });

  it('tiers the depth axis the same way over 100 cm', () => {
    const into = matLadderLines(
      { base: '', minorEveryCm: 1, mediumEveryCm: 5, majorEveryCm: MAT_TILE_CM },
      MAT_DEPTH_CM,
    );
    expect(into.major[into.major.length - 1]).toBe(MAT_DEPTH_CM);
    expect(into.major.length).toBe(MAT_DEPTH_CM / MAT_TILE_CM + 1);
  });
});

describe('edgeRuler', () => {
  it('prints numerals every 50 cm with the unit on the bottom ruler’s last label', () => {
    const bottom = edgeRuler(MAT_WIDTH_CM, true);
    expect(bottom.numerals).toEqual([
      { cm: 0, label: '0' },
      { cm: 50, label: '50' },
      { cm: 100, label: '100' },
      { cm: 150, label: '150 cm' },
    ]);
  });

  it('leaves the left ruler’s last label bare, per the blueprint figure', () => {
    const left = edgeRuler(MAT_DEPTH_CM, false);
    expect(left.numerals).toEqual([
      { cm: 0, label: '0' },
      { cm: 50, label: '50' },
      { cm: 100, label: '100' },
    ]);
  });

  it('puts minor ticks on the 5 cm cadence, skipping numeral positions', () => {
    const bottom = edgeRuler(MAT_WIDTH_CM, true);
    expect(RULER_TICK_EVERY_CM).toBe(5);
    expect(RULER_NUMERAL_EVERY_CM).toBe(50);
    expect(bottom.minorTicks).toEqual([
      5, 10, 15, 20, 25, 30, 35, 40, 45, 55, 60, 65, 70, 75, 80, 85, 90, 95,
      105, 110, 115, 120, 125, 130, 135, 140, 145,
    ]);
    // Ticks and numerals partition the ruler without overlap.
    const numeralCms = bottom.numerals.map((n) => n.cm);
    expect(numeralCms.filter((cm) => bottom.minorTicks.includes(cm))).toEqual([]);
  });
});

describe('angleGuides', () => {
  it('fans 30/45/60° rays from the origin corner', () => {
    expect(ANGLE_GUIDE_DEGREES).toEqual([30, 45, 60]);
    const guides = angleGuides();
    expect(guides.map((g) => g.angleDeg)).toEqual([30, 45, 60]);
  });

  it('starts each ray clear of the origin corner furniture', () => {
    for (const guide of angleGuides()) {
      const startRadius = Math.hypot(guide.startX, guide.startY);
      expect(startRadius).toBeCloseTo(10, 6);
    }
  });

  it('ends each ray on the mat boundary', () => {
    const guides = angleGuides();
    // 45° exits at the mat's far-right corner.
    expect(guides[1].endX).toBeCloseTo(100, 6);
    expect(guides[1].endY).toBeCloseTo(100, 6);
    // 30° is shallow and exits the right edge first.
    expect(guides[0].endX).toBeCloseTo(MAT_WIDTH_CM, 6);
    expect(guides[0].endY).toBeCloseTo(MAT_WIDTH_CM * Math.tan((30 * Math.PI) / 180), 6);
    // 60° is steep and exits the far edge first.
    expect(guides[2].endY).toBeCloseTo(MAT_DEPTH_CM, 6);
    expect(guides[2].endX).toBeCloseTo(MAT_DEPTH_CM / Math.tan((60 * Math.PI) / 180), 6);
  });

  it('places degree labels on the ray, inside the mat', () => {
    for (const guide of angleGuides()) {
      expect(guide.labelX).toBeGreaterThan(0);
      expect(guide.labelX).toBeLessThan(MAT_WIDTH_CM);
      expect(guide.labelY).toBeGreaterThan(0);
      expect(guide.labelY).toBeLessThan(MAT_DEPTH_CM);
      // On-ray: the label sits at the guide's own angle.
      const labelAngle = (Math.atan2(guide.labelY, guide.labelX) * 180) / Math.PI;
      expect(labelAngle).toBeCloseTo(guide.angleDeg, 6);
    }
  });
});

describe('originCross', () => {
  it('draws two axis-parallel arms centred just inside the corner', () => {
    const [horizontal, vertical] = originCross();
    expect(ORIGIN_CROSS_CENTRE_CM.x).toBe(4.5);
    expect(ORIGIN_CROSS_CENTRE_CM.y).toBe(4.5);
    expect(horizontal.x1).toBeCloseTo(3.1, 6);
    expect(horizontal.x2).toBeCloseTo(5.9, 6);
    expect(horizontal.y1).toBe(horizontal.y2);
    expect(vertical.x1).toBe(vertical.x2);
    expect(vertical.y1).toBeCloseTo(3.1, 6);
    expect(vertical.y2).toBeCloseTo(5.9, 6);
  });
});

describe('cornerSquaringMarks', () => {
  it('marks all four corners', () => {
    expect(cornerSquaringMarks()).toHaveLength(4);
  });

  it('runs arms parallel to the edges, inset from both', () => {
    const [origin, nearRight, farLeft, farRight] = cornerSquaringMarks();
    // Origin corner: L opens into the mat.
    expect(origin[0]).toEqual({
      x1: SQUARING_INSET_CM,
      y1: SQUARING_INSET_CM,
      x2: SQUARING_INSET_CM,
      y2: SQUARING_INSET_CM + SQUARING_ARM_CM,
    });
    expect(origin[1].x2).toBe(SQUARING_INSET_CM + SQUARING_ARM_CM);
    // Near-right corner mirrors in x.
    expect(nearRight[0].x1).toBe(MAT_WIDTH_CM - SQUARING_INSET_CM);
    expect(nearRight[1].x2).toBe(MAT_WIDTH_CM - SQUARING_INSET_CM - SQUARING_ARM_CM);
    // Far-left corner mirrors in y.
    expect(farLeft[0].y1).toBe(MAT_DEPTH_CM - SQUARING_INSET_CM);
    // Far-right corner mirrors in both.
    expect(farRight[0].x1).toBe(MAT_WIDTH_CM - SQUARING_INSET_CM);
    expect(farRight[0].y1).toBe(MAT_DEPTH_CM - SQUARING_INSET_CM);
    for (const mark of [origin, nearRight, farLeft, farRight]) {
      for (const seg of mark) {
        const vertical = seg.x1 === seg.x2;
        expect(Math.abs(vertical ? seg.y2 - seg.y1 : seg.x2 - seg.x1)).toBeCloseTo(
          SQUARING_ARM_CM,
          6,
        );
      }
    }
  });
});

describe('dimensionLabel', () => {
  it('formats the mat’s dimensions and sits per the blueprint figure', () => {
    const label = dimensionLabel();
    expect(label.text).toBe('150 × 100 cm');
    expect(label.sub).toBe('fixed reference mat');
    // Figure: right of centre, mid-depth.
    expect(label.xCm).toBeCloseTo(106.5, 6);
    expect(label.yCm).toBeCloseTo(57, 6);
  });
});

describe('placement → canvas mapping', () => {
  it('puts the origin corner at the canvas bottom-left', () => {
    expect(canvasXForCm(0)).toBe(0);
    expect(canvasYForCm(0)).toBe(MAT_DEPTH_CM * 24);
    expect(canvasXForCm(MAT_WIDTH_CM)).toBe(MAT_WIDTH_CM * 24);
    expect(canvasYForCm(MAT_DEPTH_CM)).toBe(0);
  });

  it('flips y so the far edge is the canvas top (texture flipY contract)', () => {
    expect(canvasYForCm(30)).toBeLessThan(canvasYForCm(10));
  });
});
