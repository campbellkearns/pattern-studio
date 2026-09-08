import { describe, expect, it } from 'vitest';
import {
  closePath,
  cubicTo,
  lineTo,
  moveTo,
  pathVertexCount,
  quadTo,
  validatePath,
  type PathCmd,
} from './path';
import { vec2 } from './vec2';

const square: PathCmd[] = [
  moveTo(vec2(0, 0)),
  lineTo(vec2(10, 0)),
  lineTo(vec2(10, 10)),
  lineTo(vec2(0, 10)),
  closePath(),
];

describe('path command factories', () => {
  it('reject non-finite coordinates', () => {
    expect(() => moveTo(vec2(Number.NaN, 0))).toThrow(/finite/);
    expect(() => lineTo(vec2(0, Number.POSITIVE_INFINITY))).toThrow(/finite/);
    expect(() => cubicTo(vec2(0, 0), vec2(Number.NaN, 0), vec2(1, 1))).toThrow(
      /finite/,
    );
    expect(() => quadTo(vec2(0, 0), vec2(Number.POSITIVE_INFINITY, 1))).toThrow(
      /finite/,
    );
  });
});

describe('validatePath', () => {
  it('accepts a closed outline and an open mark', () => {
    expect(() =>
      validatePath(square, { closed: true }, 'outline'),
    ).not.toThrow();
    expect(() =>
      validatePath(
        [moveTo(vec2(1, 1)), lineTo(vec2(5, 1))],
        { closed: false },
        'mark',
      ),
    ).not.toThrow();
  });

  it('rejects empty paths', () => {
    expect(() => validatePath([], { closed: true }, 'outline')).toThrow(
      /empty/,
    );
    expect(() => validatePath([], { closed: false }, 'mark')).toThrow(/empty/);
  });

  it('requires paths to start with M', () => {
    const startsAtLine: PathCmd[] = [lineTo(vec2(1, 0)), closePath()];
    expect(() =>
      validatePath(startsAtLine, { closed: true }, 'outline'),
    ).toThrow(/start with M/);
  });

  it('requires closed outlines to end with Z', () => {
    const open = square.slice(0, 4);
    expect(() => validatePath(open, { closed: true }, 'outline')).toThrow(
      /end with Z/,
    );
  });

  it('allows marks to hold multiple subpaths (Z must be followed by M)', () => {
    const multiSubpath: PathCmd[] = [
      moveTo(vec2(0, 0)),
      lineTo(vec2(1, 1)),
      closePath(),
      moveTo(vec2(2, 0)),
      lineTo(vec2(3, 1)),
    ];
    expect(() =>
      validatePath(multiSubpath, { closed: false }, 'mark'),
    ).not.toThrow();
    const zThenLine: PathCmd[] = [
      moveTo(vec2(0, 0)),
      closePath(),
      lineTo(vec2(1, 1)),
    ];
    expect(() => validatePath(zThenLine, { closed: false }, 'mark')).toThrow(
      /followed by M/,
    );
  });

  it('keeps outlines single-subpath: Z only as the final command', () => {
    const midClose: PathCmd[] = [
      moveTo(vec2(0, 0)),
      closePath(),
      lineTo(vec2(1, 1)),
      closePath(),
    ];
    expect(() => validatePath(midClose, { closed: true }, 'outline')).toThrow(
      /final command/,
    );
  });

  it('catches non-finite coordinates in hand-assembled streams', () => {
    const nanPath: PathCmd[] = [
      { type: 'M', point: { x: Number.NaN, y: 0 } },
      closePath(),
    ];
    expect(() => validatePath(nanPath, { closed: true }, 'outline')).toThrow(
      /finite/,
    );
  });
});

describe('pathVertexCount', () => {
  it('counts anchored endpoints, with Z contributing none', () => {
    expect(pathVertexCount(square)).toBe(4);
    expect(
      pathVertexCount([moveTo(vec2(0, 0)), lineTo(vec2(1, 1)), closePath()]),
    ).toBe(2);
  });

  it('counts curve endpoints only, not controls', () => {
    const curved: PathCmd[] = [
      moveTo(vec2(0, 0)),
      cubicTo(vec2(1, 0), vec2(2, 1), vec2(3, 1)),
      quadTo(vec2(4, 1), vec2(5, 0)),
    ];
    expect(pathVertexCount(curved)).toBe(3);
  });
});
