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
 * - `entry` (UX-08) carries the fabric-first flow's substate while mode is
 *   'entry' — which choice the surface shows and the fabric committed so
 *   far. It is null in every other mode, so a landed or cancelled flow can
 *   never leak stale entry data into mat/assembly.
 *
 * The status bar derives from state in mat mode (statusText) and stays
 * event-driven in assembly mode, where narrations like "Seam 2 of 5" are
 * the meaningful line.
 */

import type { FabricSpec, Piece, Project, SeamStep } from './model';
import { curatedBlankProject, CURATED_BLANK_ID } from './data/curatedBlank';
import { starterById } from './data/starters';

/**
 * Which scene currently owns the canvas. 'entry' (UX-08) is the fabric-first
 * setup flow and 'review' (UX-10) the order-review stage — both DOM-only,
 * no scene mounted while they hold it.
 */
export type AppMode = 'entry' | 'review' | 'mat' | 'assembly';

/**
 * The entry flow's substate (UX-08), present exactly while mode is 'entry'.
 * Fabric choice leads (the PRD's fabric-first principle); the committed
 * fabric is applied to the chosen project when the flow lands on the mat.
 */
export interface EntryState {
  /** Which choice the surface shows: fabric first, then project. */
  readonly step: 'fabric' | 'project';
  /** Fabric committed at the fabric step; applied to the project on landing. */
  readonly fabric?: FabricSpec;
}

export interface AppState {
  readonly project: Project;
  readonly mode: AppMode;
  /** Selected piece id — always null in assembly mode, always a live piece id. */
  readonly selectedId: string | null;
  /** Entry-flow substate; defined only while mode is 'entry'. */
  readonly entry: EntryState | null;
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
  /** UX-12: a seam's design changed in place: repaint the stitch layer. */
  readonly seamDesignApplied: { stepIndex: number; step: SeamStep } | null;
}

export const NO_EFFECTS: AppStateEffects = {
  projectReplaced: null,
  modeChanged: null,
  selection: null,
  piecesRedrafted: null,
  fabricApplied: null,
  seamDesignApplied: null,
};

export function initialAppState(project: Project): AppState {
  return { project, mode: 'mat', selectedId: null, entry: null };
}

/**
 * First-session cold start (UX-08): no share link and no save resolved, so
 * the session opens in the entry flow at the fabric step. The project is
 * the starter that would have mounted — it stays the honest "what is on
 * the table" fallback should the user cancel the flow.
 */
export function initialEntryState(project: Project): AppState {
  return { project, mode: 'entry', selectedId: null, entry: { step: 'fabric' } };
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
    state: { ...state, mode: 'assembly', selectedId: null, entry: null },
    effects: {
      ...NO_EFFECTS,
      modeChanged: 'assembly',
      selection: { id: null },
    },
  };
}

export function exitAssembly(state: AppState): TransitionResult {
  // Only assembly exits here: leaving the entry flow is cancelEntry's job.
  if (state.mode !== 'assembly') return { state, effects: NO_EFFECTS };
  // Selection stays null: leaving the walkthrough lands on an unselected mat.
  return {
    state: { ...state, mode: 'mat', entry: null },
    effects: { ...NO_EFFECTS, modeChanged: 'mat' },
  };
}

/** Starter switch, Load, Import JSON, and shared links all land here. */
export function switchProject(state: AppState, project: Project): TransitionResult {
  return {
    state: { project, mode: 'mat', selectedId: null, entry: null },
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
 * UX-08 — the fabric-first entry flow's transitions. The flow is a mode,
 * not an overlay bug: every choice below is a pure transition whose effects
 * ride the same five slots as everything else, so the shell keeps its one
 * dispatch path and never writes a surface directly. The flow always starts
 * at the fabric step (fabric first is the PRD's principle, not a default to
 * skip), and every step keeps a back path — no dead ends.
 */

/**
 * (Re-)enter the flow at the fabric step: the New action from the mat, and
 * the project step's back path. A fabric already chosen in this flow is
 * kept — back must not make the user re-pick it — while entering from
 * outside the flow (New) starts with none, since entry state is null there.
 * Idempotent when already at the fabric step.
 */
export function beginEntry(state: AppState): TransitionResult {
  if (state.mode === 'entry' && state.entry?.step === 'fabric') {
    return { state, effects: NO_EFFECTS };
  }
  const entry: EntryState =
    state.entry?.fabric !== undefined
      ? { step: 'fabric', fabric: state.entry.fabric }
      : { step: 'fabric' };
  return {
    state: { ...state, mode: 'entry', selectedId: null, entry },
    effects: {
      ...NO_EFFECTS,
      modeChanged: 'entry',
      selection: { id: null },
    },
  };
}

/**
 * Commit the fabric choice and advance to the project step. The spec is
 * stored on the entry substate, not written to a project — nothing is on
 * the mat yet; chooseEntryProject applies it on landing.
 */
export function chooseEntryFabric(
  state: AppState,
  spec: FabricSpec,
): TransitionResult {
  if (state.mode !== 'entry' || state.entry === null) {
    return { state, effects: NO_EFFECTS };
  }
  return {
    state: { ...state, entry: { step: 'project', fabric: spec } },
    effects: NO_EFFECTS,
  };
}

/**
 * UX-12: a seam's design (stitch, thread color) writes through to the
 * project — the same in-place-update contract as applyFabric, so Save,
 * Export, and Share see the picked design instead of silently reverting.
 * The step arrives already validated and frozen by createSeamStep (the
 * picker panel routes every emission through the factory); this transition
 * only swaps it in at the named index and reports the repaint effect.
 */
export function applySeamDesign(
  state: AppState,
  stepIndex: number,
  step: SeamStep,
): TransitionResult {
  if (state.project.assembly[stepIndex] === step) {
    return { state, effects: NO_EFFECTS };
  }
  const assembly = state.project.assembly.map((existing, index) =>
    index === stepIndex ? step : existing,
  );
  return {
    state: { ...state, project: { ...state.project, assembly } },
    effects: { ...NO_EFFECTS, seamDesignApplied: { stepIndex, step } },
  };
}

/**
 * Land on the mat with the chosen project and the entry fabric applied
 * (the user's fabric choice wins over the starter's curated one). Unknown
 * ids are a no-op rather than a crash: the view only emits ids this module
 * knows, but the model stays total. Curated blank lands with zero pieces —
 * the mat's panels carry their own empty states, so it is a workspace,
 * never a void.
 */
export function chooseEntryProject(
  state: AppState,
  id: string,
): TransitionResult {
  if (state.mode !== 'entry' || state.entry === null) {
    return { state, effects: NO_EFFECTS };
  }
  const built =
    id === CURATED_BLANK_ID
      ? curatedBlankProject()
      : starterById(id)?.build();
  if (built === undefined) return { state, effects: NO_EFFECTS };
  const project: Project =
    state.entry.fabric !== undefined
      ? { ...built, fabric: state.entry.fabric }
      : built;
  return {
    state: { project, mode: 'mat', selectedId: null, entry: null },
    effects: {
      ...NO_EFFECTS,
      projectReplaced: project,
      modeChanged: 'mat',
      selection: { id: null },
    },
  };
}

/** Leave the flow: back to the project that was on the mat before. */
export function cancelEntry(state: AppState): TransitionResult {
  if (state.mode !== 'entry') return { state, effects: NO_EFFECTS };
  return {
    state: { ...state, mode: 'mat', entry: null },
    effects: { ...NO_EFFECTS, modeChanged: 'mat' },
  };
}

/**
 * UX-10 — the order-review stage's transitions. Like the entry flow, the
 * review is a mode, not an overlay write: opening and leaving it are pure
 * transitions riding the same five effect slots, so the shell keeps its one
 * dispatch path. The review itself is stateless — it renders straight from
 * `project.assembly` (orderReviewRows below), so there is no substate to
 * carry and nothing to keep in sync.
 */

/**
 * Open the order review from the mat: the Assemble action's first move
 * (UX-10) — the walkthrough starts only after the order is reviewed.
 * Idempotent when the review already holds the stage, and a no-op from the
 * other modes: the entry flow and the walkthrough have their own paths.
 */
export function beginOrderReview(state: AppState): TransitionResult {
  if (state.mode === 'review') return { state, effects: NO_EFFECTS };
  if (state.mode !== 'mat') return { state, effects: NO_EFFECTS };
  return {
    state: { ...state, mode: 'review', selectedId: null, entry: null },
    effects: {
      ...NO_EFFECTS,
      modeChanged: 'review',
      selection: { id: null },
    },
  };
}

/** Leave the order review: back to the mat that was up before. */
export function cancelOrderReview(state: AppState): TransitionResult {
  if (state.mode !== 'review') return { state, effects: NO_EFFECTS };
  return {
    state: { ...state, mode: 'mat', entry: null },
    effects: { ...NO_EFFECTS, modeChanged: 'mat' },
  };
}

/** One reviewable row (UX-10): the seam's position, name, and learner note. */
export interface OrderReviewRow {
  /** Position in the build order, verbatim from the step. */
  readonly order: number;
  /**
   * The seam's name — or, for projects predating the vocabulary layer
   * (UX-07), the joined piece names, matching the walkthrough's fallback.
   */
  readonly title: string;
  /** The learner "why", verbatim from the step. */
  readonly note: string;
}

/**
 * The review list (UX-10), read straight off `project.assembly`: the model
 * validates strictly increasing `order` (project.ts), so array order is the
 * build order — no re-sorting, and what the walkthrough will fold is exactly
 * what this renders. Pure data: no planning, no WebGL — a project whose
 * assembly cannot plan still reviews fine, and Start stitching (the existing
 * assembly entry) is where planning errors narrate.
 */
export function orderReviewRows(project: Project): readonly OrderReviewRow[] {
  const nameOf = (id: string): string =>
    project.pieces.find((piece) => piece.id === id)?.name ?? id;
  return project.assembly.map((step) => ({
    order: step.order,
    title:
      step.name ?? `${nameOf(step.pieces[0])} → ${nameOf(step.pieces[1])}`,
    note: step.note,
  }));
}

/**
 * Entry-flow narration (UX-08): every step narrates on entry and exit —
 * the never-swallow discipline is the no-dead-ends guard. Pure builders,
 * interpolated at the call site (app.ts) so the copy audit covers their
 * real shape, matching the assemblyEntryMessage precedent.
 */
export function entryFabricStepMessage(): string {
  return 'Fabric first — pick your cloth; every piece re-skins to match.';
}

export function entryProjectStepMessage(): string {
  return 'Fabric chosen — now pick what to make.';
}

export function entryLandedMessage(
  projectName: string,
  learnCard?: string,
): string {
  const landed = `'${projectName}' is on the mat with your fabric.`;
  return learnCard
    ? `${landed} ${learnCard}`
    : `${landed} Press Assemble to walk the seams when you're ready.`;
}

export function cancelEntryMessage(projectName: string): string {
  return `Back on the cutting mat — '${projectName}' is on the table.`;
}

/**
 * Redrafted pieces write through to the project. A selection naming a piece
 * the redraft dropped is cleared here — the model can never hold a ghost id
 * for the status bar to narrate. An optional resolved assembly rides along
 * (pants): its seam chains are properties of the draft, so replacing the
 * pieces without replacing the assembly would leave stale chain indices
 * behind — the same fixed-index staleness UX-15 fixes at the source.
 */
export function redraftPieces(
  state: AppState,
  pieces: readonly Piece[],
  assembly?: readonly SeamStep[],
): TransitionResult {
  const selectedId =
    state.selectedId !== null &&
    pieces.some((piece) => piece.id === state.selectedId)
      ? state.selectedId
      : null;
  const selectionDropped = state.selectedId !== null && selectedId === null;
  const project: Project =
    assembly === undefined
      ? { ...state.project, pieces }
      : { ...state.project, pieces, assembly };
  return {
    state: { ...state, project, selectedId },
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
 * Assembly-entry narration (UX-07): names the first seam so the build order
 * starts teaching in place before the first fold. Pure and interpolated at
 * the call site (app.ts) so the copy audit covers its real shape.
 */
export function assemblyEntryMessage(
  stepCount: number,
  firstSeamName?: string,
): string {
  const seams = `${stepCount} seam${stepCount === 1 ? '' : 's'}`;
  const start = firstSeamName ? `, starting with the ${firstSeamName}` : '';
  return `Assembly — ${seams} to fold${start}. Scrub through them.`;
}

/**
 * UX-10 order-review narration: names the project, the seam count, and the
 * first seam up, then hands the decision over. Pure and interpolated at the
 * call site (app.ts) so the copy audit covers its real shape.
 */
export function orderReviewMessage(
  projectName: string,
  seamCount: number,
  firstSeamName?: string,
): string {
  const seams = `${seamCount} seam${seamCount === 1 ? '' : 's'}`;
  const start = firstSeamName ? `, starting with the ${firstSeamName}` : '';
  return `Stitching order for '${projectName}' — ${seams}${start}. Start stitching when you're ready.`;
}

/** UX-10 empty state (no assembly): narrate the why, keep the way back. */
export function orderReviewEmptyMessage(projectName: string): string {
  return `'${projectName}' has no seams yet — the stitching order appears once pieces are joined.`;
}

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
  /** UX-12: repaint the assembly view's stitch layer for one seam. */
  onSeamDesignApplied(stepIndex: number, step: SeamStep): void;
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
  if (effects.seamDesignApplied) {
    handlers.onSeamDesignApplied(
      effects.seamDesignApplied.stepIndex,
      effects.seamDesignApplied.step,
    );
  }
}
