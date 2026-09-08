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
});
