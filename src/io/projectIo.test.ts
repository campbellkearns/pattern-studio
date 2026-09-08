import { beforeEach, describe, expect, it } from 'vitest';
import { createPiece, type Piece } from '../model/piece';
import { closePath, cubicTo, lineTo, moveTo, quadTo } from '../model/path';
import { createProject, type Project } from '../model/project';
import { createSeamStep, type SeamStep } from '../model/seam';
import { vec2 } from '../model/vec2';
import {
  STORAGE_KEY,
  loadProject,
  parseProject,
  saveProject,
  serializeProject,
} from './projectIo';

function samplePiece(id: string): Piece {
  return createPiece({
    id,
    name: `${id} piece`,
    outline: [
      moveTo(vec2(0, 0)),
      // A curved edge proves the round trip survives all four command types.
      cubicTo(vec2(4, -2), vec2(6, 4), vec2(10, 2)),
      lineTo(vec2(10, 8)),
      quadTo(vec2(5, 12), vec2(0, 8)),
      closePath(),
    ],
    internal: [moveTo(vec2(2, 4)), lineTo(vec2(8, 4)), closePath()],
    grainline: { angle: 45, placement: vec2(5, 5) },
    seamAllowance: 1.5,
    cutCount: 2,
  });
}

function sideSeam(order: number): SeamStep {
  return createSeamStep({
    pieces: ['sleeve', 'body'],
    edges: [
      { pieceId: 'sleeve', startVertex: 1, edgeCount: 1 },
      { pieceId: 'body', startVertex: 1, edgeCount: 1 },
    ],
    order,
    note: 'Set the sleeve before closing the side.',
  });
}

function sampleProject(overrides: Partial<Project> = {}): Project {
  return createProject({
    id: 'proj-1',
    name: 'Shirt',
    measurements: { chest: 96, sleeveLength: 58.5 },
    fabric: {
      weave: 'twill',
      weaveScale: 0.05,
      color: '#3b5998',
      weight: 280,
    },
    pieces: [samplePiece('sleeve'), samplePiece('body')],
    assembly: [sideSeam(1)],
    ...overrides,
  });
}

describe('serializeProject / parseProject round trip', () => {
  it('returns an identical project through save → load', () => {
    const original = sampleProject({ basedOn: 'starter-shirt' });
    const parsed = parseProject(serializeProject(original));
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return; // narrowing for the assertions below
    expect(parsed.project).toEqual(original);
  });

  it('survives every path command type and nested structure', () => {
    const original = sampleProject();
    const parsed = parseProject(serializeProject(original));
    if (parsed.status !== 'ok') throw new Error('expected a valid parse');
    expect(parsed.project.pieces[0].outline).toEqual(
      original.pieces[0].outline,
    );
    expect(parsed.project.pieces[0].internal).toEqual(
      original.pieces[0].internal,
    );
    expect(parsed.project.assembly[0]).toEqual(original.assembly[0]);
    expect(parsed.project.fabric).toEqual(original.fabric);
  });

  it('omits an absent basedOn and keeps a present one', () => {
    const without = parseProject(serializeProject(sampleProject()));
    if (without.status !== 'ok') throw new Error('expected a valid parse');
    expect(without.project.basedOn).toBeUndefined();

    const withProvenance = parseProject(
      serializeProject(sampleProject({ basedOn: 'starter-shirt' })),
    );
    if (withProvenance.status !== 'ok')
      throw new Error('expected a valid parse');
    expect(withProvenance.project.basedOn).toBe('starter-shirt');
  });

  it('parses unicode names losslessly', () => {
    const original = sampleProject({ name: 'Nœud “coupe” — v2 👗' });
    const parsed = parseProject(serializeProject(original, 'compact'));
    if (parsed.status !== 'ok') throw new Error('expected a valid parse');
    expect(parsed.project.name).toBe(original.name);
  });
});

describe('parseProject never trusts stored JSON', () => {
  it('rejects malformed JSON', () => {
    const parsed = parseProject('{not json');
    expect(parsed.status).toBe('invalid');
    if (parsed.status !== 'invalid') return;
    expect(parsed.reason).toMatch(/not valid JSON/);
  });

  it('rejects non-object roots (null, arrays, strings, numbers)', () => {
    for (const json of ['null', '[]', '"shirt"', '42']) {
      const parsed = parseProject(json);
      expect(parsed.status).toBe('invalid');
      if (parsed.status !== 'invalid') continue;
      expect(parsed.reason).toMatch(/must be a JSON object/);
    }
  });

  it('rejects tampered names, colors, measurements and duplicate ids', () => {
    // Tamper on the raw JSON — a valid project through the factories, then
    // mutated exactly the way corrupted storage would arrive.
    const data = JSON.parse(serializeProject(sampleProject())) as Record<
      string,
      unknown
    >;

    const blank = parseProject(JSON.stringify({ ...data, name: '  ' }));
    expect(blank.status).toBe('invalid');
    if (blank.status !== 'invalid') return;
    expect(blank.reason).toMatch(/non-empty/);

    const badColor = parseProject(
      JSON.stringify({
        ...data,
        fabric: {
          ...(data.fabric as Record<string, unknown>),
          color: 'blue',
        },
      }),
    );
    expect(badColor.status).toBe('invalid');
    if (badColor.status !== 'invalid') return;
    expect(badColor.reason).toMatch(/hex/);

    // JSON cannot carry NaN, so a corrupted measurement shows up as the
    // wrong type — the factory must reject it all the same.
    const stringMeasurement = parseProject(
      '{"id":"p","name":"Shirt","measurements":{"chest":"96"},"fabric":{"weave":"twill","weaveScale":0.05,"color":"#3b5998","weight":280},"pieces":[],"assembly":[]}',
    );
    expect(stringMeasurement.status).toBe('invalid');
    if (stringMeasurement.status !== 'invalid') return;
    expect(stringMeasurement.reason).toMatch(/finite/);

    const duplicated = parseProject(
      JSON.stringify({
        ...data,
        pieces: [(data.pieces as unknown[])[0], (data.pieces as unknown[])[0]],
      }),
    );
    expect(duplicated.status).toBe('invalid');
    if (duplicated.status !== 'invalid') return;
    expect(duplicated.reason).toMatch(/unique/);
  });

  it('rejects seams that reference unknown pieces', () => {
    const raw = JSON.stringify({
      ...sampleProject(),
      assembly: [
        {
          pieces: ['ghost', 'body'],
          edges: [
            { pieceId: 'ghost', startVertex: 0, edgeCount: 1 },
            { pieceId: 'body', startVertex: 1, edgeCount: 1 },
          ],
          order: 1,
          note: 'corrupt',
        },
      ],
    });
    const parsed = parseProject(raw);
    expect(parsed.status).toBe('invalid');
    if (parsed.status !== 'invalid') return;
    expect(parsed.reason).toMatch(/unknown piece/);
  });
});

describe('localStorage storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves and loads the identical project', () => {
    const original = sampleProject({ basedOn: 'starter-shirt' });
    saveProject(window.localStorage, original);
    const loaded = loadProject(window.localStorage);
    expect(loaded.status).toBe('found');
    if (loaded.status !== 'found') return;
    expect(loaded.project).toEqual(original);
  });

  it('reports empty when nothing was saved', () => {
    expect(loadProject(window.localStorage)).toEqual({ status: 'empty' });
  });

  it('keeps only the most recent save', () => {
    saveProject(window.localStorage, sampleProject({ id: 'first' }));
    saveProject(window.localStorage, sampleProject({ id: 'second' }));
    const loaded = loadProject(window.localStorage);
    if (loaded.status !== 'found') throw new Error('expected a found project');
    expect(loaded.project.id).toBe('second');
  });

  it('surfaces corrupted storage as invalid with the reason', () => {
    window.localStorage.setItem(STORAGE_KEY, '{corrupted');
    const loaded = loadProject(window.localStorage);
    expect(loaded.status).toBe('invalid');
    if (loaded.status !== 'invalid') return;
    expect(loaded.reason).toMatch(/not valid JSON/);
  });

  it('surfaces structurally-valid-but-invalid storage as invalid', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      '{"id":"","name":"Broken","measurements":{},"fabric":{"weave":"plain","weaveScale":0.1,"color":"#000000","weight":200},"pieces":[],"assembly":[]}',
    );
    const loaded = loadProject(window.localStorage);
    expect(loaded.status).toBe('invalid');
    if (loaded.status !== 'invalid') return;
    expect(loaded.reason).toMatch(/non-empty/);
  });
});
