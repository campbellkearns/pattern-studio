import { describe, expect, it } from 'vitest';
import {
  createEdgeChain,
  createSeamStep,
  type EdgeChain,
  type SeamStep,
} from './seam';

function chain(pieceId = 'front', startVertex = 0, edgeCount = 1): EdgeChain {
  return { pieceId, startVertex, edgeCount };
}

function sideSeam(overrides: Partial<SeamStep> = {}): SeamStep {
  return {
    pieces: ['front', 'back'],
    edges: [chain('front'), chain('back')],
    order: 1,
    note: 'Side seams first so the silhouette settles.',
    ...overrides,
  };
}

describe('createEdgeChain', () => {
  it('creates a valid chain', () => {
    expect(createEdgeChain(chain('front', 2, 3))).toEqual({
      pieceId: 'front',
      startVertex: 2,
      edgeCount: 3,
    });
  });

  it('rejects empty piece ids, negative starts, and empty chains', () => {
    expect(() => createEdgeChain(chain(''))).toThrow(/non-empty/);
    expect(() => createEdgeChain(chain('front', -1))).toThrow(/integer >= 0/);
    expect(() => createEdgeChain(chain('front', 0, 0))).toThrow(/integer >= 1/);
  });
});

describe('createSeamStep', () => {
  it('creates a valid step with its fields intact', () => {
    const step = createSeamStep(sideSeam({ order: 2 }));
    expect(step.pieces).toEqual(['front', 'back']);
    expect(step.order).toBe(2);
    expect(step.edges[0].pieceId).toBe('front');
    expect(step.edges[1].pieceId).toBe('back');
  });

  it('rejects a seam joining a piece to itself', () => {
    expect(() =>
      createSeamStep(sideSeam({ pieces: ['front', 'front'] })),
    ).toThrow(/two different pieces/);
  });

  it('rejects edge chains that do not match their side', () => {
    expect(() =>
      createSeamStep(sideSeam({ edges: [chain('back'), chain('back')] })),
    ).toThrow(/must match their side/);
    expect(() =>
      createSeamStep(sideSeam({ edges: [chain('front'), chain('front')] })),
    ).toThrow(/must match their side/);
  });

  it('rejects empty piece ids', () => {
    expect(() => createSeamStep(sideSeam({ pieces: ['  ', 'back'] }))).toThrow(
      /non-empty/,
    );
  });

  it('rejects non-positive or non-integral order', () => {
    expect(() => createSeamStep(sideSeam({ order: 0 }))).toThrow(
      /integer >= 1/,
    );
    expect(() => createSeamStep(sideSeam({ order: 2.5 }))).toThrow(
      /integer >= 1/,
    );
    expect(() => createSeamStep(sideSeam({ order: Number.NaN }))).toThrow(
      /integer >= 1/,
    );
  });

  it('keeps an empty name undefined, and validates a present one (UX-07)', () => {
    const unnamed = createSeamStep(sideSeam());
    expect(unnamed.name).toBeUndefined();
    const named = createSeamStep(sideSeam({ name: 'Rise seam' }));
    expect(named.name).toBe('Rise seam');
    expect(() => createSeamStep(sideSeam({ name: '   ' }))).toThrow(
      /non-empty/,
    );
  });
});

describe('SeamStep stitch + thread color (UX-12)', () => {
  it('accepts every curated stitch type', () => {
    for (const stitch of ['straight', 'zigzag', 'backstitch'] as const) {
      const step = createSeamStep(sideSeam({ stitch }));
      expect(step.stitch).toBe(stitch);
    }
  });

  it('rejects unknown stitch types', () => {
    expect(() =>
      createSeamStep(sideSeam({ stitch: 'overlock' as never })),
    ).toThrow(/must be one of/);
    expect(() =>
      createSeamStep(sideSeam({ stitch: 'Zigzag' as never })),
    ).toThrow(/must be one of/); // case-sensitive, like every other enum
  });

  it('accepts hex thread colors by the fabric rule (#rgb and #rrggbb)', () => {
    expect(
      createSeamStep(sideSeam({ threadColor: '#f0f' })).threadColor,
    ).toBe('#f0f');
    expect(
      createSeamStep(sideSeam({ threadColor: '#C0553B' })).threadColor,
    ).toBe('#C0553B');
  });

  it('rejects non-hex thread colors', () => {
    for (const bad of ['red', '#ff', '#12345', '123456', '#a1b2g3', '']) {
      expect(() => createSeamStep(sideSeam({ threadColor: bad }))).toThrow(
        /hex string/,
      );
    }
  });

  it('keeps absent design fields undefined so pre-wave data parses unchanged', () => {
    const step = createSeamStep(sideSeam());
    expect(step.stitch).toBeUndefined();
    expect(step.threadColor).toBeUndefined();
  });

  it('freezes the step and its design fields', () => {
    const step = createSeamStep(
      sideSeam({ stitch: 'zigzag', threadColor: '#105B43' }),
    );
    expect(Object.isFrozen(step)).toBe(true);
    expect(() => {
      (step as { stitch?: string }).stitch = 'straight';
    }).toThrow();
  });

  it('round-trips a serialized step with design fields through JSON', () => {
    const step = createSeamStep(
      sideSeam({ stitch: 'backstitch', threadColor: '#1A40B0' }),
    );
    const parsed = createSeamStep(JSON.parse(JSON.stringify(step)));
    expect(parsed).toEqual(step);
  });
});
