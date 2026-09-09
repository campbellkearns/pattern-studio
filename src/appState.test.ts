/**
 * UX-05 regression tests: every state-linkage orphan the scripted sweep
 * exposed gets a test on the transition that fixes it. The transitions are
 * pure, so these run without DOM or WebGL — the shell's effect handlers are
 * recorded as call sequences.
 */
import { describe, expect, it } from 'vitest';
import { STARTERS } from './data/starters';
import type { FabricSpec, Piece, Project } from './model';
import {
  applyAppState,
  applyFabric,
  enterAssembly,
  exitAssembly,
  initialAppState,
  mirrorSelection,
  NOTHING_SELECTED_MESSAGE,
  redraftPieces,
  selectPiece,
  statusText,
  switchProject,
} from './appState';
import type { AppState, AppStateHandlers, TransitionResult } from './appState';

const buildStarter = (id: string): Project => {
  const entry = STARTERS.find((starter) => starter.id === id);
  if (!entry) throw new Error(`missing starter ${id}`);
  return entry.build();
};

const notebook = (): Project => buildStarter('starter-notebook-holder');
const toiletry = (): Project => buildStarter('starter-toiletry-rollup');

/** Recorded handler calls, for ordering assertions. */
function recorder() {
  const calls: string[] = [];
  const handlers: AppStateHandlers = {
    onProjectReplaced: (project) => calls.push(`project:${project.id}`),
    onModeChanged: (mode) => calls.push(`mode:${mode}`),
    onSelectionChanged: (id) => calls.push(`select:${id ?? 'none'}`),
    onPiecesRedrafted: (pieces) => calls.push(`pieces:${pieces.length}`),
    onFabricApplied: (spec) => calls.push(`fabric:${spec.color}`),
  };
  return { calls, handlers };
}

/** Apply a transition's effects with a throwaway recorder; next state back. */
function run(result: TransitionResult): AppState {
  applyAppState(result, recorder().handlers);
  return result.state;
}

const fabricIn = (project: Project, color: string): FabricSpec => ({
  ...project.fabric,
  color,
});

/** A redrafted piece set: same ids, one piece dropped. */
const dropPiece = (project: Project, id: string): readonly Piece[] =>
  project.pieces.filter((piece) => piece.id !== id);

describe('app state: selection', () => {
  it('selects a live piece on the mat and derives its status line', () => {
    const project = notebook();
    const base = initialAppState(project);
    const state = run(selectPiece(base, project.pieces[0]!.id));
    expect(state.selectedId).toBe(project.pieces[0]!.id);
    expect(statusText(state)).toBe(
      `Selected: ${project.pieces[0]!.name} (cut ${project.pieces[0]!.cutCount}).`,
    );
  });

  it('never selects a piece id that is not on the mat', () => {
    const base = initialAppState(notebook());
    const state = run(selectPiece(base, 'ghost-piece'));
    expect(state.selectedId).toBeNull();
    expect(statusText(state)).toBe(NOTHING_SELECTED_MESSAGE);
  });

  it('ignores selection entirely while in assembly mode', () => {
    const project = notebook();
    const base = initialAppState(project);
    const assembling = run(enterAssembly(base));
    const state = run(selectPiece(assembling, project.pieces[0]!.id));
    expect(state.selectedId).toBeNull();
    expect(state.mode).toBe('assembly');
  });
});

describe('app state: assembly mode linkage', () => {
  it('entering assembly clears the selection — no orphaned panel highlight', () => {
    const project = notebook();
    const base = initialAppState(project);
    const selected = run(selectPiece(base, project.pieces[0]!.id));
    const result = enterAssembly(selected);
    // The regression: selection used to survive assembly entry, so the
    // piece panel and status bar kept highlighting a piece the walkthrough
    // never shows.
    expect(result.state.mode).toBe('assembly');
    expect(result.state.selectedId).toBeNull();
    expect(result.effects.selection).toEqual({ id: null });
    expect(result.effects.modeChanged).toBe('assembly');
    expect(statusText(result.state)).toBeNull(); // event-driven bar in assembly
  });

  it('entering assembly is a no-op when already assembling', () => {
    const base = initialAppState(notebook());
    const assembling = run(enterAssembly(base));
    const result = enterAssembly(assembling);
    expect(result.state).toBe(assembling);
    expect(result.effects.modeChanged).toBeNull();
  });

  it('exiting assembly returns to an unselected mat', () => {
    const base = initialAppState(notebook());
    const assembling = run(enterAssembly(base));
    const result = exitAssembly(assembling);
    expect(result.state.mode).toBe('mat');
    expect(result.state.selectedId).toBeNull();
    expect(result.effects.modeChanged).toBe('mat');
    expect(statusText(result.state)).toBe(NOTHING_SELECTED_MESSAGE);
  });
});

describe('app state: project switching', () => {
  it('switching projects clears selection and forces mat mode', () => {
    const project = notebook();
    const next = toiletry();
    const base = initialAppState(project);
    const selected = run(selectPiece(base, project.pieces[0]!.id));
    const result = switchProject(selected, next);
    expect(result.state.project).toBe(next);
    expect(result.state.mode).toBe('mat');
    expect(result.state.selectedId).toBeNull();
    expect(result.effects.projectReplaced).toBe(next);
    expect(result.effects.selection).toEqual({ id: null });
  });

  it('switching projects from assembly emits the mat-mode change too', () => {
    const base = initialAppState(notebook());
    const assembling = run(enterAssembly(base));
    const result = switchProject(assembling, toiletry());
    expect(result.state.mode).toBe('mat');
    expect(result.effects.modeChanged).toBe('mat');
  });
});

describe('app state: fabric linkage', () => {
  it('fabric changes write through to the project — remounts keep them', () => {
    const project = notebook();
    const spec = fabricIn(project, '#123456');
    const base = initialAppState(project);
    const result = applyFabric(base, spec);
    // The regression: fabric used to be applied per-scene only, so leaving
    // assembly mode (or any remount) reverted it and Save/Export captured
    // the stale fabric.
    expect(result.state.project.fabric.color).toBe('#123456');
    expect(result.effects.fabricApplied).toBe(spec);
  });

  it('fabric survives an assembly round-trip', () => {
    const project = notebook();
    const spec = fabricIn(project, '#abcdef');
    const base = run(applyFabric(initialAppState(project), spec));
    const assembled = run(enterAssembly(base));
    const backOnMat = run(exitAssembly(assembled));
    expect(backOnMat.project.fabric.color).toBe('#abcdef');
  });
});

describe('app state: redraft linkage', () => {
  it('redraft keeps a selection that survives and drops one that dies', () => {
    const project = notebook();
    const base = initialAppState(project);
    const firstId = project.pieces[0]!.id;
    const lastId = project.pieces[project.pieces.length - 1]!.id;

    const selected = run(selectPiece(base, firstId));
    const kept = run(redraftPieces(selected, project.pieces));
    expect(kept.selectedId).toBe(firstId);

    const selectedLast = run(selectPiece(base, lastId));
    const dropped = run(redraftPieces(selectedLast, dropPiece(project, lastId)));
    // The regression: a redraft could drop the selected id and leave the
    // status bar narrating a piece no surface showed.
    expect(dropped.selectedId).toBeNull();
  });

  it('redraft in assembly mode keeps the walkthrough consistent', () => {
    const project = notebook();
    const base = initialAppState(project);
    const assembling = run(enterAssembly(base));
    const result = redraftPieces(
      assembling,
      dropPiece(project, project.pieces[0]!.id),
    );
    expect(result.state.mode).toBe('assembly');
    expect(result.state.selectedId).toBeNull();
    expect(result.state.project.pieces.length).toBe(project.pieces.length - 1);
    expect(result.effects.piecesRedrafted).not.toBeNull();
  });
});

describe('app state: canonical effect order', () => {
  it('applies project replacement before mode change before selection', () => {
    const project = notebook();
    const next = toiletry();
    const base = initialAppState(project);
    const selected = run(selectPiece(base, project.pieces[0]!.id));
    const assembling = run(enterAssembly(selected));

    const { calls, handlers } = recorder();
    const result = switchProject(assembling, next);
    applyAppState(result, handlers);

    expect(calls).toEqual([`project:${next.id}`, 'mode:mat', 'select:none']);
  });
});

describe('app state: scripted sweep (select → assemble → undo → switch → fabric)', () => {
  it('leaves no orphaned state at any step', () => {
    const project = notebook();
    const next = toiletry();

    // 1. Select a piece on the mat.
    let state = initialAppState(project);
    state = run(selectPiece(state, project.pieces[0]!.id));
    expect(state.selectedId).toBe(project.pieces[0]!.id);

    // 2. Enter assembly ("assemble seam") — selection must clear.
    state = run(enterAssembly(state));
    expect(state.mode).toBe('assembly');
    expect(state.selectedId).toBeNull();

    // 3. Undo (exit assembly back to the mat).
    state = run(exitAssembly(state));
    expect(state.mode).toBe('mat');
    expect(state.selectedId).toBeNull();

    // 4. Switch project — still no selection, fabric from the new project.
    state = run(switchProject(state, next));
    expect(state.project).toBe(next);
    expect(state.selectedId).toBeNull();
    expect(statusText(state)).toBe(NOTHING_SELECTED_MESSAGE);

    // 5. Change fabric — writes through to the project.
    const spec = fabricIn(next, '#2468ac');
    state = run(applyFabric(state, spec));
    expect(state.project.fabric.color).toBe('#2468ac');

    // 6. Redraft — selection stays honest, project carries the fabric.
    state = run(redraftPieces(state, next.pieces));
    expect(state.project.fabric.color).toBe('#2468ac');
    expect(state.selectedId).toBeNull();
    expect(state.mode).toBe('mat');
  });
});

describe('app state: selection mirroring', () => {
  it('mirrors store writes into the model without changing anything else', () => {
    const project = notebook();
    const base = initialAppState(project);
    const mirrored = mirrorSelection(base, project.pieces[0]!.id);
    expect(mirrored.selectedId).toBe(project.pieces[0]!.id);
    expect(mirrored.mode).toBe('mat');
    expect(mirrored.project).toBe(project);
  });
});
