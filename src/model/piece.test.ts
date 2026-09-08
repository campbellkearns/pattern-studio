import { describe, expect, it } from 'vitest';
import { closePath, lineTo, moveTo, type PathCmd } from './path';
import { createPiece, type Piece } from './piece';
import { vec2 } from './vec2';

function squareOutline(): PathCmd[] {
  return [
    moveTo(vec2(0, 0)),
    lineTo(vec2(10, 0)),
    lineTo(vec2(10, 10)),
    lineTo(vec2(0, 10)),
    closePath(),
  ];
}

function frontLeg(overrides: Partial<Piece> = {}): Piece {
  return {
    id: 'front-leg',
    name: 'Front leg',
    outline: squareOutline(),
    internal: [moveTo(vec2(2, 2)), lineTo(vec2(8, 2))],
    grainline: { angle: 0, placement: vec2(5, 5) },
    seamAllowance: 1.5,
    cutCount: 2,
    ...overrides,
  };
}

describe('createPiece', () => {
  it('creates a valid piece with its fields intact', () => {
    const piece = createPiece(frontLeg());
    expect(piece.id).toBe('front-leg');
    expect(piece.name).toBe('Front leg');
    expect(piece.seamAllowance).toBe(1.5);
    expect(piece.cutCount).toBe(2);
    expect(piece.outline).toHaveLength(5);
    expect(piece.internal).toHaveLength(2);
  });

  it('rejects empty outlines', () => {
    expect(() => createPiece(frontLeg({ outline: [] }))).toThrow(/empty/);
  });

  it('rejects outlines that do not close', () => {
    expect(() =>
      createPiece(frontLeg({ outline: squareOutline().slice(0, 4) })),
    ).toThrow(/end with Z/);
  });

  it('rejects non-finite outline coordinates even when hand-assembled', () => {
    const badOutline: PathCmd[] = [
      { type: 'M', point: { x: Number.NaN, y: 0 } },
      lineTo(vec2(10, 0)),
      closePath(),
    ];
    expect(() => createPiece(frontLeg({ outline: badOutline }))).toThrow(
      /finite/,
    );
  });

  it('accepts empty or multi-subpath internal mark streams', () => {
    expect(createPiece(frontLeg({ internal: [] })).internal).toHaveLength(0);
    const marks: PathCmd[] = [
      // A closed triangular notch, then an open grainline stroke.
      moveTo(vec2(5, 2)),
      lineTo(vec2(6, 3)),
      lineTo(vec2(4, 3)),
      closePath(),
      moveTo(vec2(2, 6)),
      lineTo(vec2(8, 6)),
    ];
    expect(createPiece(frontLeg({ internal: marks })).internal).toHaveLength(6);
  });

  it('rejects malformed internal mark streams', () => {
    const zThenLine: PathCmd[] = [
      moveTo(vec2(2, 2)),
      closePath(),
      lineTo(vec2(8, 2)),
    ];
    expect(() => createPiece(frontLeg({ internal: zThenLine }))).toThrow(
      /followed by M/,
    );
    const nanStroke: PathCmd[] = [
      moveTo(vec2(2, 2)),
      moveTo(vec2(4, 2)),
      { type: 'L', point: { x: 8, y: Number.NaN } },
    ];
    expect(() => createPiece(frontLeg({ internal: nanStroke }))).toThrow(
      /finite/,
    );
  });

  it('canonicalizes grainline angle to [0, 360)', () => {
    expect(
      createPiece(
        frontLeg({ grainline: { angle: 405, placement: vec2(5, 5) } }),
      ).grainline.angle,
    ).toBe(45);
    expect(
      createPiece(
        frontLeg({ grainline: { angle: -90, placement: vec2(5, 5) } }),
      ).grainline.angle,
    ).toBe(270);
  });

  it('rejects non-finite grainline data', () => {
    expect(() =>
      createPiece(
        frontLeg({ grainline: { angle: Number.NaN, placement: vec2(5, 5) } }),
      ),
    ).toThrow(/finite/);
    expect(() =>
      createPiece(
        frontLeg({
          grainline: {
            angle: 0,
            placement: { x: Number.POSITIVE_INFINITY, y: 0 },
          },
        }),
      ),
    ).toThrow(/finite/);
  });

  it('rejects negative or non-finite seam allowance', () => {
    expect(() => createPiece(frontLeg({ seamAllowance: -1 }))).toThrow(/>= 0/);
    expect(() => createPiece(frontLeg({ seamAllowance: Number.NaN }))).toThrow(
      /finite/,
    );
    expect(createPiece(frontLeg({ seamAllowance: 0 })).seamAllowance).toBe(0);
  });

  it('rejects cut counts below 1 or non-integral', () => {
    expect(() => createPiece(frontLeg({ cutCount: 0 }))).toThrow(
      /integer >= 1/,
    );
    expect(() => createPiece(frontLeg({ cutCount: 1.5 }))).toThrow(
      /integer >= 1/,
    );
    expect(() => createPiece(frontLeg({ cutCount: Number.NaN }))).toThrow(
      /integer >= 1/,
    );
  });

  it('rejects empty id or name', () => {
    expect(() => createPiece(frontLeg({ id: '  ' }))).toThrow(/non-empty/);
    expect(() => createPiece(frontLeg({ name: '' }))).toThrow(/non-empty/);
  });
});
