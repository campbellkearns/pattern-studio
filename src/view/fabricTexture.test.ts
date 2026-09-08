import { describe, expect, it } from 'vitest';
import type { FabricSpec } from '../model';
import {
  TILE_SIZE_PX,
  WEAVE_PERIOD,
  heightField,
  hexToRgb,
  normalField,
  normalStrengthFor,
  roughnessField,
  roughnessFor,
  shade,
  weaveLayout,
  warpUpAt,
} from './fabricTexture';

function fabric(overrides: Partial<FabricSpec> = {}): FabricSpec {
  return {
    weave: 'plain',
    weaveScale: 0.12,
    color: '#5b7553',
    weight: 340,
    ...overrides,
  };
}

describe('weaveLayout', () => {
  it('is deterministic: same spec, same layout, byte for byte', () => {
    const a = weaveLayout(fabric({ stripeCm: 0.8 }));
    const b = weaveLayout(fabric({ stripeCm: 0.8 }));
    expect(b).toEqual(a);
  });

  it('tiles one weave repeat for a solid fabric', () => {
    for (const weave of ['plain', 'twill', 'satin'] as const) {
      const layout = weaveLayout(fabric({ weave }));
      expect(layout.threadsAcross).toBe(WEAVE_PERIOD[weave]);
      // The FabricSpec contract: weaveScale cm per weave repeat.
      expect(layout.tileCm).toBeCloseTo(0.12, 6);
      expect(layout.pitchCm).toBeCloseTo(0.12 / WEAVE_PERIOD[weave], 6);
    }
  });

  it('produces square tiles of the fixed canvas size', () => {
    const layout = weaveLayout(fabric());
    expect(layout.sizePx).toBe(TILE_SIZE_PX);
    expect(layout.threadPx).toBeCloseTo(TILE_SIZE_PX / layout.threadsAcross, 9);
  });

  it('responds parametrically to weaveScale', () => {
    const fine = weaveLayout(fabric({ weaveScale: 0.12 }));
    const coarse = weaveLayout(fabric({ weaveScale: 0.24 }));
    expect(coarse.pitchCm).toBeCloseTo(fine.pitchCm * 2, 9);
    expect(coarse.tileCm).toBeCloseTo(fine.tileCm * 2, 9);
    // Pixels-per-cm halves when the same canvas covers twice the fabric.
    expect(coarse.sizePx / coarse.tileCm).toBeCloseTo(
      fine.sizePx / fine.tileCm / 2,
      6,
    );
  });
});

describe('interlace patterns', () => {
  it('plain weave alternates over-under (checkerboard)', () => {
    const layout = weaveLayout(fabric({ weave: 'plain' }));
    for (let row = 0; row < layout.threadsAcross; row++) {
      for (let col = 0; col < layout.threadsAcross; col++) {
        expect(layout.warpUp[row][col]).toBe((row + col) % 2 === 0);
      }
    }
  });

  it('2/2 twill steps the diagonal one thread per row', () => {
    const layout = weaveLayout(fabric({ weave: 'twill' }));
    for (let row = 0; row < layout.threadsAcross; row++) {
      let ups = 0;
      for (let col = 0; col < layout.threadsAcross; col++) {
        if (layout.warpUp[row][col]) ups++;
        expect(layout.warpUp[row][col]).toBe(warpUpAt('twill', row, col));
      }
      expect(ups).toBe(2); // two-up, two-down
    }
  });

  it('5-end satin breaks the weft float once per five threads, stepping two', () => {
    const layout = weaveLayout(fabric({ weave: 'satin' }));
    for (let row = 0; row < layout.threadsAcross; row++) {
      const upCols = layout.warpUp[row]
        .map((up, col) => (up ? col : -1))
        .filter((col) => col >= 0);
      expect(upCols).toEqual([(2 * row) % 5]);
    }
  });
});

describe('stripes', () => {
  it('colors whole warp bands and widens the tile to a stripe period', () => {
    const layout = weaveLayout(fabric({ weave: 'plain', stripeCm: 0.8 }));
    expect(layout.stripeBandThreads).toBeGreaterThan(0);
    expect(layout.stripeRows.length).toBeGreaterThan(0);
    expect(layout.threadsAcross).toBeGreaterThanOrEqual(
      2 * layout.stripeBandThreads,
    );
    // Tile covers a whole number of stripe bands and weave repeats.
    expect(layout.tileCm / 0.12).toBeCloseTo(
      Math.round(layout.tileCm / 0.12),
      6,
    );
    // Bands are contiguous runs, alternating with unstriped runs.
    const bandStarts = layout.stripeRows.filter(
      (row) => !layout.stripeRows.includes(row - 1),
    );
    expect(bandStarts.length).toBeGreaterThan(0);
    for (const start of bandStarts) {
      expect(layout.stripeRows).not.toContain(start - 1);
      expect(layout.stripeRows).toContain(start + layout.stripeBandThreads - 1);
    }
  });

  it('keeps solid fabrics stripe-free', () => {
    const layout = weaveLayout(fabric());
    expect(layout.stripeBandThreads).toBe(0);
    expect(layout.stripeRows).toEqual([]);
  });

  it('derives the stripe shade darker than the base color', () => {
    const layout = weaveLayout(fabric({ color: '#5b7553' }));
    expect(layout.stripe.r).toBeLessThan(layout.base.r);
    expect(layout.stripe.g).toBeLessThan(layout.base.g);
    expect(layout.stripe.b).toBeLessThan(layout.base.b);
  });
});

describe('color parsing', () => {
  it('expands 3-digit hex and parses 6-digit hex', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#5b7553')).toEqual({ r: 0x5b, g: 0x75, b: 0x53 });
  });

  it('shade scales every channel deterministically', () => {
    expect(shade({ r: 100, g: 150, b: 200 }, 0.5)).toEqual({
      r: 50,
      g: 75,
      b: 100,
    });
  });
});

describe('material parameter ranges (findings log §2)', () => {
  it('keeps base roughness inside the 0.70–0.85 matte-cloth band', () => {
    for (const weave of ['plain', 'twill', 'satin'] as const) {
      expect(roughnessFor(weave)).toBeGreaterThanOrEqual(0.7);
      expect(roughnessFor(weave)).toBeLessThanOrEqual(0.85);
    }
  });

  it('ranks gloss satin < twill < plain', () => {
    expect(roughnessFor('satin')).toBeLessThan(roughnessFor('twill'));
    expect(roughnessFor('twill')).toBeLessThan(roughnessFor('plain'));
  });

  it('keeps weave normal-map strength inside 0.02–0.05', () => {
    for (const weave of ['plain', 'twill', 'satin'] as const) {
      expect(normalStrengthFor(weave)).toBeGreaterThanOrEqual(0.02);
      expect(normalStrengthFor(weave)).toBeLessThanOrEqual(0.05);
    }
  });
});

describe('heightField', () => {
  it('has one height per pixel and is deterministic', () => {
    const layout = weaveLayout(fabric());
    const a = heightField(layout);
    const b = heightField(layout);
    expect(a.length).toBe(TILE_SIZE_PX * TILE_SIZE_PX);
    expect(b).toEqual(a);
  });

  it('peaks on thread centerlines and dips toward cell edges', () => {
    const layout = weaveLayout(fabric({ weave: 'plain' })); // 2 threads, warp up at (0,0)
    const field = heightField(layout);
    const at = (x: number, y: number): number => field[y * TILE_SIZE_PX + x];
    // Cell (0,0) is warp-up: the ridge runs along u, crest mid-thread in v.
    const crestY = Math.floor(0.5 * layout.threadPx);
    // Pixel centers sit 0.5px off the true centerline — close enough to 1.
    expect(at(Math.floor(0.5 * layout.threadPx), crestY)).toBeCloseTo(1, 3);
    // The tile's lowest point sits at the thread-edge valleys between cells.
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const h of field) {
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    expect(max).toBeCloseTo(1, 3);
    expect(min).toBeLessThan(0.2);
  });
});

describe('normalField', () => {
  const layout = weaveLayout(fabric({ weave: 'plain' }));

  it('fills one RGBA pixel per texel and is deterministic', () => {
    const a = normalField(layout, 0.04);
    const b = normalField(layout, 0.04);
    expect(a.length).toBe(TILE_SIZE_PX * TILE_SIZE_PX * 4);
    expect(b).toEqual(a);
    expect(a[3]).toBe(255);
  });

  it('responds parametrically: double the strength, double the tilt', () => {
    const weak = normalField(layout, 0.025);
    const strong = normalField(layout, 0.05);
    const tilt = (rgba: Uint8Array): number => {
      let sum = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        sum += Math.abs(rgba[i] - 128) + Math.abs(rgba[i + 1] - 128);
      }
      return sum;
    };
    expect(tilt(strong)).toBeGreaterThan(tilt(weak) * 1.9);
    expect(tilt(strong)).toBeLessThan(tilt(weak) * 2.1);
  });

  it('is flat along a thread crest: no x-tilt on a warp-up centerline', () => {
    const field = normalField(layout, 0.05);
    const crestY = Math.floor(0.5 * layout.threadPx);
    const x = Math.floor(0.5 * layout.threadPx);
    const r = field[(crestY * TILE_SIZE_PX + x) * 4];
    // Warp ridge runs along u → gradient along u is zero at the crest.
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(1);
  });
});

describe('roughnessField', () => {
  it('has one RGBA pixel per texel and is deterministic', () => {
    const layout = weaveLayout(fabric({ weave: 'twill' }));
    const a = roughnessField(layout);
    const b = roughnessField(layout);
    expect(a.length).toBe(TILE_SIZE_PX * TILE_SIZE_PX * 4);
    expect(b).toEqual(a);
  });

  it('multiplies within [0.95, 1.0] so effective roughness stays in band', () => {
    for (const weave of ['plain', 'twill', 'satin'] as const) {
      const field = roughnessField(weaveLayout(fabric({ weave })));
      let min = 255;
      let max = 0;
      for (let i = 0; i < field.length; i += 4) {
        min = Math.min(min, field[i]);
        max = Math.max(max, field[i]);
      }
      const lo = (min / 255) * roughnessFor(weave);
      const hi = (max / 255) * roughnessFor(weave);
      expect(hi).toBeLessThanOrEqual(0.85 + 1e-9);
      expect(lo).toBeGreaterThanOrEqual(0.7 - 1e-9);
    }
  });

  it('makes satin floats glossier than plain interlacings', () => {
    const satin = roughnessField(weaveLayout(fabric({ weave: 'satin' })));
    const plain = roughnessField(weaveLayout(fabric({ weave: 'plain' })));
    const avg = (rgba: Uint8Array): number => {
      let sum = 0;
      for (let i = 0; i < rgba.length; i += 4) sum += rgba[i];
      return sum / (rgba.length / 4);
    };
    expect(avg(satin)).toBeLessThan(avg(plain));
  });
});
