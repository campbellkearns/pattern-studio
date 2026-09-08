import { describe, expect, it } from 'vitest';
import { createFabricSpec, type FabricSpec } from './fabric';
import { closePath, lineTo, moveTo } from './path';
import { createPiece, type Piece } from './piece';
import { createProject, createStarterProject, type Project } from './project';
import { createEdgeChain, type SeamStep } from './seam';
import { vec2 } from './vec2';

const fabric: FabricSpec = createFabricSpec({
  weave: 'twill',
  weaveScale: 0.05,
  color: '#3b5998',
  weight: 340,
});

function legPiece(id: string): Piece {
  return createPiece({
    id,
    name: id === 'front' ? 'Front leg' : 'Back leg',
    outline: [
      moveTo(vec2(0, 0)),
      lineTo(vec2(10, 0)),
      lineTo(vec2(10, 12)),
      lineTo(vec2(0, 12)),
      closePath(),
    ],
    internal: [],
    grainline: { angle: 90, placement: vec2(5, 6) },
    seamAllowance: 1.5,
    cutCount: 2,
  });
}

function sideSeam(order: number): SeamStep {
  return {
    pieces: ['front', 'back'],
    edges: [
      createEdgeChain({ pieceId: 'front', startVertex: 1, edgeCount: 1 }),
      createEdgeChain({ pieceId: 'back', startVertex: 1, edgeCount: 1 }),
    ],
    order,
    note: 'Side seams first so the silhouette settles.',
  };
}

function notebookProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Notebook holder',
    measurements: { waist: 82 },
    fabric,
    pieces: [legPiece('front'), legPiece('back')],
    assembly: [sideSeam(1)],
    ...overrides,
  };
}

describe('createProject', () => {
  it('creates a valid project with its fields intact', () => {
    const project = createProject(notebookProject());
    expect(project.id).toBe('proj-1');
    expect(project.name).toBe('Notebook holder');
    expect(project.basedOn).toBeUndefined();
    expect(project.measurements).toEqual({ waist: 82 });
    expect(project.pieces).toHaveLength(2);
    expect(project.assembly).toHaveLength(1);
  });

  it('accepts any free-text name — no template union', () => {
    const project = createProject(
      notebookProject({ name: 'My weird “knee” pants v2' }),
    );
    expect(project.name).toBe('My weird “knee” pants v2');
  });

  it('records basedOn provenance when present', () => {
    const project = createProject(
      notebookProject({ basedOn: 'starter-notebook-holder' }),
    );
    expect(project.basedOn).toBe('starter-notebook-holder');
    expect(() => createProject(notebookProject({ basedOn: ' ' }))).toThrow(
      /non-empty/,
    );
  });

  it('rejects empty id or name', () => {
    expect(() => createProject(notebookProject({ id: '' }))).toThrow(
      /non-empty/,
    );
    expect(() => createProject(notebookProject({ name: '   ' }))).toThrow(
      /non-empty/,
    );
  });

  it('rejects non-finite measurements and blank measurement keys', () => {
    expect(() =>
      createProject(notebookProject({ measurements: { waist: Number.NaN } })),
    ).toThrow(/finite/);
    expect(() =>
      createProject(notebookProject({ measurements: { '  ': 80 } })),
    ).toThrow(/non-empty/);
  });

  it('rejects duplicate piece ids', () => {
    expect(() =>
      createProject(
        notebookProject({ pieces: [legPiece('front'), legPiece('front')] }),
      ),
    ).toThrow(/unique/);
  });

  it('re-validates nested pieces, so hand-assembled data cannot bypass invariants', () => {
    const rawPiece: Piece = {
      id: 'raw',
      name: 'Raw piece',
      outline: [{ type: 'M', point: { x: Number.NaN, y: 0 } }, closePath()],
      internal: [],
      grainline: { angle: 0, placement: vec2(1, 1) },
      seamAllowance: 1,
      cutCount: 1,
    };
    expect(() =>
      createProject(notebookProject({ pieces: [rawPiece] })),
    ).toThrow(/finite/);
  });

  it('rejects invalid fabric', () => {
    expect(() =>
      createProject(
        notebookProject({
          fabric: { weave: 'plain', weaveScale: 1, color: 'nope', weight: 200 },
        }),
      ),
    ).toThrow(/hex/);
  });

  it('accepts an empty assembly list', () => {
    expect(() =>
      createProject(notebookProject({ assembly: [] })),
    ).not.toThrow();
  });

  it('enforces strictly increasing seam orders', () => {
    expect(() =>
      createProject(notebookProject({ assembly: [sideSeam(2), sideSeam(1)] })),
    ).toThrow(/strictly increasing/);
    expect(() =>
      createProject(notebookProject({ assembly: [sideSeam(1), sideSeam(1)] })),
    ).toThrow(/strictly increasing/);
    expect(() =>
      createProject(notebookProject({ assembly: [sideSeam(1), sideSeam(2)] })),
    ).not.toThrow();
  });

  it('rejects seams referencing unknown pieces', () => {
    const pocketSeam: SeamStep = {
      ...sideSeam(1),
      pieces: ['pocket', 'back'],
      edges: [
        createEdgeChain({ pieceId: 'pocket', startVertex: 1, edgeCount: 1 }),
        createEdgeChain({ pieceId: 'back', startVertex: 1, edgeCount: 1 }),
      ],
    };
    expect(() =>
      createProject(notebookProject({ assembly: [pocketSeam] })),
    ).toThrow(/unknown piece/);
  });

  it('rejects edge chains that run past the outline', () => {
    const wrappingSeam: SeamStep = {
      ...sideSeam(1),
      edges: [
        createEdgeChain({ pieceId: 'front', startVertex: 3, edgeCount: 2 }),
        createEdgeChain({ pieceId: 'back', startVertex: 1, edgeCount: 1 }),
      ],
    };
    expect(() =>
      createProject(notebookProject({ assembly: [wrappingSeam] })),
    ).toThrow(/past the outline/);

    // A chain ending at the last vertex is fine — that is the closing edge.
    const closingEdgeSeam: SeamStep = {
      ...sideSeam(1),
      edges: [
        createEdgeChain({ pieceId: 'front', startVertex: 3, edgeCount: 1 }),
        createEdgeChain({ pieceId: 'back', startVertex: 1, edgeCount: 1 }),
      ],
    };
    expect(() =>
      createProject(notebookProject({ assembly: [closingEdgeSeam] })),
    ).not.toThrow();
  });
});

describe('createStarterProject', () => {
  it('creates a starter carrying its learn card', () => {
    const starter = createStarterProject({
      ...notebookProject({ basedOn: 'starter-notebook-holder' }),
      learnCard: 'You will learn straight seams and topstitching.',
    });
    expect(starter.learnCard).toBe(
      'You will learn straight seams and topstitching.',
    );
    expect(starter.basedOn).toBe('starter-notebook-holder');
    expect(starter.pieces).toHaveLength(2);
  });

  it('rejects blank learn cards', () => {
    expect(() =>
      createStarterProject({ ...notebookProject(), learnCard: '   ' }),
    ).toThrow(/non-empty/);
  });
});
