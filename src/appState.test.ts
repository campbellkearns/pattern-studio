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
  assemblyEntryMessage,
  beginEntry,
  beginOrderReview,
  cancelEntry,
  cancelEntryMessage,
  cancelOrderReview,
  chooseEntryFabric,
  chooseEntryProject,
  enterAssembly,
  entryFabricStepMessage,
  entryLandedMessage,
  entryProjectStepMessage,
  exitAssembly,
  initialAppState,
  initialEntryState,
  mirrorSelection,
  NOTHING_SELECTED_MESSAGE,
  orderReviewEmptyMessage,
  orderReviewMessage,
  orderReviewRows,
  redraftPieces,
  selectPiece,
  statusText,
  switchProject,
} from './appState';
import { CURATED_BLANK_ID, curatedBlankProject } from './data/curatedBlank';
import { createSeamStep } from './model';
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

describe('app state: entry mode (UX-08)', () => {
  it('initialEntryState opens the flow at the fabric step', () => {
    const state = initialEntryState(notebook());
    expect(state.mode).toBe('entry');
    expect(state.entry).toEqual({ step: 'fabric' });
    expect(state.selectedId).toBeNull();
  });

  it('beginEntry leaves the mat for the fabric step and clears selection', () => {
    const project = notebook();
    const base = run(selectPiece(initialAppState(project), project.pieces[0]!.id));
    const result = beginEntry(base);
    expect(result.state.mode).toBe('entry');
    expect(result.state.entry).toEqual({ step: 'fabric' });
    expect(result.state.selectedId).toBeNull();
    expect(result.state.project).toBe(project); // cancel lands back here
    expect(result.effects.modeChanged).toBe('entry');
    expect(result.effects.selection).toEqual({ id: null });
  });

  it('beginEntry is idempotent while already at the fabric step', () => {
    const base = initialEntryState(notebook());
    const result = beginEntry(base);
    expect(result.state).toBe(base);
    expect(result.effects.modeChanged).toBeNull();
  });

  it('the project step’s back path re-enters at fabric with the fabric kept', () => {
    const base = initialEntryState(notebook());
    const spec = fabricIn(notebook(), '#123456');
    const atProject = run(chooseEntryFabric(base, spec));
    const back = beginEntry(atProject);
    expect(back.state.mode).toBe('entry');
    expect(back.state.entry).toEqual({ step: 'fabric', fabric: spec });
  });

  it('chooseEntryFabric commits the fabric and advances to the project step', () => {
    const base = initialEntryState(notebook());
    const spec = fabricIn(notebook(), '#abcdef');
    const result = chooseEntryFabric(base, spec);
    expect(result.state.entry).toEqual({ step: 'project', fabric: spec });
    // Nothing is on the mat yet — the project's own fabric is untouched.
    expect(result.state.project.fabric).toBe(base.project.fabric);
  });

  it('chooseEntryFabric is a no-op outside the entry flow', () => {
    const base = initialAppState(notebook());
    const result = chooseEntryFabric(base, fabricIn(notebook(), '#abcdef'));
    expect(result.state).toBe(base);
    expect(result.effects.modeChanged).toBeNull();
  });

  it('chooseEntryProject lands on the mat with the entry fabric applied', () => {
    const base = initialEntryState(notebook());
    const spec = fabricIn(notebook(), '#2468ac');
    const atProject = run(chooseEntryFabric(base, spec));
    const result = chooseEntryProject(atProject, 'starter-tote');
    expect(result.state.mode).toBe('mat');
    expect(result.state.entry).toBeNull();
    expect(result.state.selectedId).toBeNull();
    expect(result.state.project.id).toBe('starter-tote');
    expect(result.state.project.fabric.color).toBe('#2468ac'); // user fabric wins
    expect(result.effects.projectReplaced).toBe(result.state.project);
    expect(result.effects.modeChanged).toBe('mat');
  });

  it('chooseEntryProject keeps the starter’s curated fabric when none was chosen', () => {
    const base = initialEntryState(notebook());
    // Defensive: the flow only reaches the project step through the fabric
    // step, but the transition stays total for a direct call.
    const atProject = { ...base, entry: { step: 'project' as const } };
    const result = chooseEntryProject(atProject, 'starter-tote');
    // Value comparison: every build re-validates through createFabricSpec,
    // so two builds never share a fabric object identity.
    expect(result.state.project.fabric).toEqual(
      STARTERS.find((s) => s.id === 'starter-tote')!.build().fabric,
    );
  });

  it('chooseEntryProject lands the curated blank with zero pieces', () => {
    const base = initialEntryState(notebook());
    const atProject = run(chooseEntryFabric(base, fabricIn(notebook(), '#2468ac')));
    const result = chooseEntryProject(atProject, CURATED_BLANK_ID);
    expect(result.state.mode).toBe('mat');
    expect(result.state.project.id).toBe(CURATED_BLANK_ID);
    expect(result.state.project.pieces).toHaveLength(0);
    expect(result.state.project.assembly).toHaveLength(0);
    expect(result.state.project.fabric.color).toBe('#2468ac');
  });

  it('chooseEntryProject ignores an unknown project id', () => {
    const base = initialEntryState(notebook());
    const result = chooseEntryProject(base, 'starter-nope');
    expect(result.state).toBe(base);
    expect(result.effects.projectReplaced).toBeNull();
  });

  it('cancelEntry returns to the mat with the pre-flow project intact', () => {
    const project = notebook();
    const base = beginEntry(initialAppState(project)).state;
    const result = cancelEntry(base);
    expect(result.state.mode).toBe('mat');
    expect(result.state.entry).toBeNull();
    expect(result.state.project).toBe(project);
    expect(result.effects.modeChanged).toBe('mat');
  });

  it('cancelEntry is a no-op outside the entry flow', () => {
    const base = initialAppState(notebook());
    const result = cancelEntry(base);
    expect(result.state).toBe(base);
    expect(result.effects.modeChanged).toBeNull();
  });

  it('landing applies project replacement before mode change before selection', () => {
    const base = initialEntryState(notebook());
    const atProject = run(chooseEntryFabric(base, fabricIn(notebook(), '#2468ac')));
    const { calls, handlers } = recorder();
    applyAppState(chooseEntryProject(atProject, 'starter-tote'), handlers);
    expect(calls).toEqual(['project:starter-tote', 'mode:mat', 'select:none']);
  });

  it('narrates on entry and exit of every step', () => {
    expect(entryFabricStepMessage()).toMatch(/Fabric first/i);
    expect(entryProjectStepMessage()).toMatch(/fabric chosen/i);
    expect(entryLandedMessage('Tote')).toMatch(/'Tote' is on the mat/);
    expect(entryLandedMessage('Tote', 'You will learn felling.')).toBe(
      `'Tote' is on the mat with your fabric. You will learn felling.`,
    );
    expect(cancelEntryMessage('Notebook holder')).toBe(
      `Back on the cutting mat — 'Notebook holder' is on the table.`,
    );
    // The existing assembly-entry narration keeps its shape.
    expect(assemblyEntryMessage(2, 'Flap seam')).toMatch(/2 seams/);
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

describe('app state: order review (UX-10)', () => {
  it('beginOrderReview opens the review stage from the mat, selection cleared', () => {
    const project = notebook();
    const base = initialAppState(project);
    const selected = run(selectPiece(base, project.pieces[0]!.id));
    const result = beginOrderReview(selected);
    expect(result.state.mode).toBe('review');
    expect(result.state.selectedId).toBeNull();
    expect(result.state.entry).toBeNull();
    expect(result.state.project).toBe(project);
    expect(result.effects.modeChanged).toBe('review');
    expect(result.effects.selection).toEqual({ id: null });
  });

  it('beginOrderReview is idempotent while the review holds the stage', () => {
    const base = beginOrderReview(initialAppState(notebook())).state;
    const result = beginOrderReview(base);
    expect(result.state).toBe(base);
    expect(result.effects.modeChanged).toBeNull();
  });

  it('beginOrderReview is a no-op from the entry flow and the walkthrough', () => {
    const project = notebook();
    const fromEntry = initialEntryState(project);
    expect(beginOrderReview(fromEntry).state).toBe(fromEntry);
    const fromAssembly = enterAssembly(initialAppState(project)).state;
    expect(fromAssembly.mode).toBe('assembly');
    expect(beginOrderReview(fromAssembly).state).toBe(fromAssembly);
  });

  it('cancelOrderReview returns to the mat; no-op outside the review', () => {
    const base = beginOrderReview(initialAppState(notebook())).state;
    const result = cancelOrderReview(base);
    expect(result.state.mode).toBe('mat');
    expect(result.state.entry).toBeNull();
    expect(result.effects.modeChanged).toBe('mat');

    const mat = initialAppState(notebook());
    expect(cancelOrderReview(mat).state).toBe(mat);
  });

  it('Start stitching: the existing enterAssembly transition composes from review', () => {
    const base = beginOrderReview(initialAppState(notebook())).state;
    const result = enterAssembly(base);
    expect(result.state.mode).toBe('assembly');
    expect(result.state.selectedId).toBeNull();
    expect(result.state.entry).toBeNull();
    expect(result.effects.modeChanged).toBe('assembly');
    expect(result.effects.selection).toEqual({ id: null });
  });

  it('opening the review applies mode change before selection, nothing else', () => {
    const { calls, handlers } = recorder();
    applyAppState(beginOrderReview(initialAppState(notebook())), handlers);
    expect(calls).toEqual(['mode:review', 'select:none']);
  });

  it('orderReviewRows renders project.assembly order exactly', () => {
    const project = notebook();
    const rows = orderReviewRows(project);
    expect(rows).toHaveLength(project.assembly.length);
    project.assembly.forEach((step, i) => {
      expect(rows[i]!.order).toBe(step.order);
      // Every starter names its seams (UX-07): the title is the name.
      expect(rows[i]!.title).toBe(step.name);
      expect(rows[i]!.note).toBe(step.note);
    });
  });

  it('orderReviewRows falls back to the joined piece names when a seam has none', () => {
    const project = notebook();
    const step = project.assembly[0]!;
    const unnamed = createSeamStep({
      pieces: step.pieces,
      edges: step.edges,
      order: step.order,
      note: step.note,
    });
    const rows = orderReviewRows({ ...project, assembly: [unnamed] });
    const nameOf = (id: string): string =>
      project.pieces.find((piece) => piece.id === id)?.name ?? id;
    expect(rows[0]!.title).toBe(
      `${nameOf(step.pieces[0])} → ${nameOf(step.pieces[1])}`,
    );
  });

  it('orderReviewRows is empty for a project with no assembly (curated blank)', () => {
    expect(orderReviewRows(curatedBlankProject())).toEqual([]);
  });

  it('narrates the review opening and its empty state', () => {
    expect(orderReviewMessage('Tote', 2, 'Side seams')).toBe(
      `Stitching order for 'Tote' — 2 seams, starting with the Side seams. Start stitching when you're ready.`,
    );
    expect(orderReviewMessage('Coaster', 1)).toBe(
      `Stitching order for 'Coaster' — 1 seam. Start stitching when you're ready.`,
    );
    expect(orderReviewEmptyMessage('Blank pattern')).toBe(
      `'Blank pattern' has no seams yet — the stitching order appears once pieces are joined.`,
    );
  });
});
