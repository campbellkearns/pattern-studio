/**
 * The app state model (UX-05): one consistent shape for everything the UI
 * surfaces read — selection, piece panel, status bar, mat viewport, and
 * assembly walkthrough.
 *
 * Surfaces never mutate each other ad hoc. Every interaction routes through
 * a pure transition below, and each transition returns the next state plus
 * the exact surface effects needed to render it; the shell applies effects
 * in the canonical order applyAppState fixes. That is what makes the model
 * the single source of truth rather than one surface among many:
 *
 * - `project` is the single source of truth for pieces and fabric. Fabric
 *   pickers write through to it, so remounts (assembly round-trip, load,
 *   starter switch) and Save/Export/Share all see the user's fabric, and
 *   redrafts write pieces through it the same way.
 * - `selectedId` is a mat-mode concept. Entering assembly or switching
 *   projects clears it — no panel row or status line keeps highlighting a
 *   piece the scene no longer shows — and a redraft that drops the selected
 *   id clears it rather than leaving a ghost selection behind.
 * - `mode` owns which scene holds the canvas; the Assemble button state and
 *   scene teardown derive from it instead of being poked independently.
 *
 * The status bar derives from state in mat mode (statusText) and stays
 * event-driven in assembly mode, where narrations like "Seam 2 of 5" are
 * the meaningful line.
 */

import type { FabricSpec, Piece, Project } from './model';

/** Which scene currently owns the canvas. */
export type AppMode = 'mat' | 'assembly';

export interface AppState {
  readonly project: Project;
  readonly mode: AppMode;
  /** Selected piece id — always null in assembly mode, always a live piece id. */
  readonly selectedId: string | null;
}

/** One transition step: the next state plus the effects needed to render it. */
export interface TransitionResult {
  readonly state: AppState;
  readonly effects: AppStateEffects;
}

/**
 * The minimal set of surface updates a transition requires. Null fields are
 * no-ops; the shell's handlers stay dumb — they read the new state, never
 * decide when they run.
 */
export interface AppStateEffects {
  /** Replace the whole project (starter/load/import/share): full remount. */
  readonly projectReplaced: Project | null;
  /** Mode changed: swap scenes and derive the Assemble button state. */
  readonly modeChanged: AppMode | null;
  /** Write the selection store (viewport + panel re-render from it). */
  readonly selection: { readonly id: string | null } | null;
  /** Pieces redrafted in place: update the panel list and the live scene. */
  readonly piecesRedrafted: readonly Piece[] | null;
  /** Fabric changed in place: re-skin the live scene. */
  readonly fabricApplied: FabricSpec | null;
}

export const NO_EFFECTS: AppStateEffects = {
  projectReplaced: null,
  modeChanged: null,
  selection: null,
  piecesRedrafted: null,
  fabricApplied: null,
};

export function initialAppState(project: Project): AppState {
  return { project, mode: 'mat', selectedId: null };
}

/** Mat-surface taps and panel clicks land here through the selection proxy. */
export function selectPiece(state: AppState, id: string | null): TransitionResult {
  if (state.mode !== 'mat') return { state, effects: NO_EFFECTS };
  const selectedId =
    id !== null && state.project.pieces.some((piece) => piece.id === id)
      ? id
      : null;
  if (selectedId === state.selectedId) return { state, effects: NO_EFFECTS };
  return {
    state: { ...state, selectedId },
    effects: { ...NO_EFFECTS, selection: { id: selectedId } },
  };
}

export function enterAssembly(state: AppState): TransitionResult {
  if (state.mode === 'assembly') return { state, effects: NO_EFFECTS };
  return {
    state: { ...state, mode: 'assembly', selectedId: null },
    effects: {
      ...NO_EFFECTS,
      modeChanged: 'assembly',
      selection: { id: null },
    },
  };
}

export function exitAssembly(state: AppState): TransitionResult {
  if (state.mode === 'mat') return { state, effects: NO_EFFECTS };
  // Selection stays null: leaving the walkthrough lands on an unselected mat.
  return {
    state: { ...state, mode: 'mat' },
    effects: { ...NO_EFFECTS, modeChanged: 'mat' },
  };
}

/** Starter switch, Load, Import JSON, and shared links all land here. */
export function switchProject(state: AppState, project: Project): TransitionResult {
  return {
    state: { project, mode: 'mat', selectedId: null },
    effects: {
      ...NO_EFFECTS,
      projectReplaced: project,
      modeChanged: state.mode === 'assembly' ? 'mat' : null,
      selection: { id: null },
    },
  };
}

/**
 * Fabric writes through to the project: the live scene re-skins now, and a
 * later remount (or Save/Export/Share) sees the same fabric instead of
 * silently reverting to the one the project was mounted with.
 */
export function applyFabric(state: AppState, spec: FabricSpec): TransitionResult {
  if (state.project.fabric === spec) return { state, effects: NO_EFFECTS };
  return {
    state: { ...state, project: { ...state.project, fabric: spec } },
    effects: { ...NO_EFFECTS, fabricApplied: spec },
  };
}

/**
 * Redrafted pieces write through to the project. A selection naming a piece
 * the redraft dropped is cleared here — the model can never hold a ghost id
 * for the status bar to narrate.
 */
export function redraftPieces(
  state: AppState,
  pieces: readonly Piece[],
): TransitionResult {
  const selectedId =
    state.selectedId !== null &&
    pieces.some((piece) => piece.id === state.selectedId)
      ? state.selectedId
      : null;
  const selectionDropped = state.selectedId !== null && selectedId === null;
  return {
    state: { ...state, project: { ...state.project, pieces }, selectedId },
    effects: {
      ...NO_EFFECTS,
      piecesRedrafted: pieces,
      selection: selectionDropped ? { id: null } : null,
    },
  };
}

/**
 * Mirror a store-side selection write back into the model. The proxy store
 * routes user intent through selectPiece; this only keeps the model in sync
 * with the write the controller itself emitted.
 */
export function mirrorSelection(state: AppState, id: string | null): AppState {
  return { ...state, selectedId: id };
}

export const NOTHING_SELECTED_MESSAGE =
  'Nothing selected — tap a piece or pick one from the list.';

/**
 * The mat-mode status line, derived from state. Assembly mode returns null:
 * its status bar is event-driven ("Seam 2 of 5", learn cards, load/save
 * outcomes), and a selection-style line there would contradict the scene.
 */
export function statusText(state: AppState): string | null {
  if (state.mode !== 'mat') return null;
  if (state.selectedId === null) return NOTHING_SELECTED_MESSAGE;
  const piece = state.project.pieces.find((p) => p.id === state.selectedId);
  return piece
    ? `Selected: ${piece.name} (cut ${piece.cutCount}).`
    : `Selected: ${state.selectedId}.`;
}

/** The shell's surface handlers — dumb appliers, called in canonical order. */
export interface AppStateHandlers {
  onProjectReplaced(project: Project): void;
  onModeChanged(mode: AppMode): void;
  onSelectionChanged(id: string | null): void;
  onPiecesRedrafted(pieces: readonly Piece[]): void;
  onFabricApplied(spec: FabricSpec): void;
}

/**
 * Apply a transition's effects in the canonical order: mount the new
 * project (recreating every panel from it), swap scenes, write selection,
 * then apply in-place piece/fabric updates to whatever scene is live.
 * Centralizing the order here is what keeps surfaces from drifting — no
 * interaction path can invent its own sequence.
 */
export function applyAppState(
  result: TransitionResult,
  handlers: AppStateHandlers,
): void {
  const { effects } = result;
  if (effects.projectReplaced) handlers.onProjectReplaced(effects.projectReplaced);
  if (effects.modeChanged) handlers.onModeChanged(effects.modeChanged);
  if (effects.selection) handlers.onSelectionChanged(effects.selection.id);
  if (effects.piecesRedrafted) handlers.onPiecesRedrafted(effects.piecesRedrafted);
  if (effects.fabricApplied) handlers.onFabricApplied(effects.fabricApplied);
}
