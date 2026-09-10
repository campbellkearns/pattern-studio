/**
 * App shell: glues the starter project, viewport, and piece panel together
 * and owns the two off-happy-path states the blueprint requires — the
 * WebGL 2 unsupported-device screen and the status readout that narrates
 * selection without relying on hover. The toolbar (F7, projects as data)
 * carries localStorage save/load and JSON import/export; every persistence
 * outcome — including failures — is narrated in the status bar, never silent.
 * State linkage (UX-05) is centralized in src/appState.ts: the shell holds
 * one AppState and never mutates a surface directly — every interaction
 * dispatches a pure transition, and the shell applies the transition's
 * effects to the surfaces in the model's canonical order. Selection, mode,
 * project pieces, and fabric therefore cannot drift apart: entering assembly
 * clears the selection, fabric changes write through to the project (so
 * remounts and Save/Export/Share keep them), and redrafts re-plan the
 * assembly walkthrough instead of silently desyncing it.
 */
import { starterById, STARTERS, isStarterProject } from './data/starters';
import { CURATED_BLANK_ID } from './data/curatedBlank';
import { EMPTY_PARAMETERS } from './model';
import type { Project } from './model';
import {
  loadProject,
  parseProject,
  saveProject,
  serializeProject,
} from './io/projectIo';
import { copyTextToClipboard } from './io/clipboardIo';
import { exportPiecesSvg } from './io/svgExport';
import { downloadTextFile, pickJsonText } from './io/fileIo';
import {
  MAX_SHARE_URL_LENGTH,
  decodeProjectToken,
  planShare,
  readShareToken,
} from './io/shareLink';
import { createFabricPanel } from './view/fabricPanel';
import { createRefitButton } from './view/refitButton';
import type { RefitButtonHandle } from './view/refitButton';
import {
  isTextEntryTarget,
  shortcutAction,
  shortcutHint,
} from './view/shortcuts';
import { statusClassName } from './view/statusTone';
import type { StatusTone } from './view/statusTone';
import { createAssemblyControls } from './view/assemblyControls';
import type { AssemblyControlsHandle } from './view/assemblyControls';
import { createGlossaryPopover, renderAnnotatedText } from './view/glossaryDom';
import { foldDurationMs, seamIsCurved } from './view/walkthroughMotion';
import { createAssemblyView } from './view/assemblyView';
import type { AssemblyView } from './view/assemblyView';
import { createMeasurementsPanel } from './view/measurementsPanel';
import type { MeasurementsPanelHandle } from './view/measurementsPanel';
import { createPiecePanel } from './view/panel';
import type { PanelHandle } from './view/panel';
import { createMaterialsLegend } from './view/legend';
import type { MaterialsLegendHandle } from './view/legend';
import { supportsWebGL2 } from './view/webgl';
import { createSelectionStore } from './view/selection';
import type { SelectionStore } from './view/selection';
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
import type { AppState, TransitionResult } from './appState';
import { createEntryFlow } from './view/entryFlow';
import type { EntryFlowHandle } from './view/entryFlow';
import { createOrderReview } from './view/orderReview';
import type { OrderReviewHandle } from './view/orderReview';
import { createViewport } from './view/viewport';
import type { Viewport } from './view/viewport';

// Dev-only dogfooding hook: lets the automation compute exact on-screen
// piece positions for tap aiming. Stripped from production builds.
declare global {
  interface Window {
    __patternStudioDebug?: {
      pieceScreenPositions: () => Array<{ id: string; x: number; y: number }>;
    };
  }
}

function renderUnsupported(container: HTMLElement): void {
  container.innerHTML = '';
  const notice = document.createElement('div');
  notice.className = 'unsupported';
  const heading = document.createElement('h2');
  heading.textContent = 'WebGL 2 not available';
  const body = document.createElement('p');
  body.textContent =
    'Pattern Studio needs WebGL 2 to show the 3D cutting mat. ' +
    'Try a recent version of Chrome, Edge, Firefox, or Safari with ' +
    'hardware acceleration enabled.';
  notice.append(heading, body);
  container.appendChild(notice);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** File-name-safe form of a project name for downloads. */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'pattern';
}

/**
 * Cold-start project: a shared link wins (the hash is consumed after load so
 * a plain reload doesn't replay the link over later saves), then the project
 * saved in this browser, then — only when neither resolves, the first-ever
 * session (UX-08) — the fabric-first entry flow. Anything invalid is
 * narrated, not dropped — a broken link or corrupted save must say so.
 * Returning-user precedence is untouched: a resolved share link or save
 * opens on the mat exactly as before.
 */
function loadStartupProject(): {
  project: Project;
  message: string;
  startInEntry: boolean;
} {
  const starter = STARTERS[0].build();

  const token = readShareToken(window.location.hash);
  if (token !== null) {
    const parsed = decodeProjectToken(token);
    if (parsed.status === 'ok') {
      history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
      );
      return {
        project: parsed.project,
        message: `Loaded '${parsed.project.name}' from the shared link.`,
        startInEntry: false,
      };
    }
    return {
      project: starter,
      message: `The shared link held an invalid project (${parsed.reason}) — showing the starter instead.`,
      startInEntry: false,
    };
  }

  const saved = loadProject(window.localStorage);
  if (saved.status === 'found') {
    return {
      project: saved.project,
      message: `Restored '${saved.project.name}' from this browser.`,
      startInEntry: false,
    };
  }
  if (saved.status === 'invalid') {
    return {
      project: starter,
      message: `Saved project was invalid (${saved.reason}) — showing the starter.`,
      startInEntry: false,
    };
  }
  // First-ever session: no link, no save — the entry flow holds the stage
  // (the starter stays the honest fallback project if the flow is cancelled).
  return { project: starter, message: '', startInEntry: true };
}

export function mountApp(root: HTMLElement): void {
  root.innerHTML = '';

  if (!supportsWebGL2()) {
    renderUnsupported(root);
    return;
  }

  // --- Static chrome ------------------------------------------------------
  const shell = document.createElement('div');
  shell.className = 'app-shell';

  const toolbar = document.createElement('header');
  toolbar.className = 'toolbar';
  const projectTitle = document.createElement('h1');
  projectTitle.className = 'project-title';
  toolbar.appendChild(projectTitle);

  const actions = document.createElement('div');
  actions.className = 'toolbar-actions';
  toolbar.appendChild(actions);

  // Starter picker (starter ladder): selecting an entry mounts a fresh,
  // fully validated StarterProject and narrates its learn card — the
  // "what you'll learn" lesson arrives with the pieces on the mat.
  const starterPicker = document.createElement('select');
  starterPicker.className = 'starter-picker';
  starterPicker.setAttribute('aria-label', 'Starter project');
  for (const entry of STARTERS) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.name;
    starterPicker.appendChild(option);
  }
  starterPicker.addEventListener('change', () => {
    const entry = starterById(starterPicker.value);
    if (!entry) return;
    const starter = entry.build();
    dispatch(switchProject(state, starter));
    narrate(`Loaded starter '${entry.name}'. ${starter.learnCard}`);
  });
  actions.appendChild(starterPicker);

  const layout = document.createElement('div');
  layout.className = 'app-layout';

  const canvasHolder = document.createElement('div');
  canvasHolder.className = 'viewport-holder';

  const panel = document.createElement('aside');
  panel.className = 'panel';
  // Measurements drive the redraft, so the panel leads with them; the
  // piece list underneath reflects whatever is currently on the mat, and
  // the fabric panel beside them survives piece-list re-mounts (it is
  // re-created per project load, not cleared by the piece list).
  const measurementsSection = document.createElement('section');
  measurementsSection.className = 'panel-section';
  const piecesSection = document.createElement('section');
  piecesSection.className = 'panel-section';
  const fabricSection = document.createElement('section');
  fabricSection.className = 'fabric-panel';
  panel.append(measurementsSection, piecesSection, fabricSection);
  layout.append(canvasHolder, panel);

  const status = document.createElement('div');
  status.className = 'status-bar';
  status.setAttribute('role', 'status');
  status.textContent = NOTHING_SELECTED_MESSAGE;

  // UX-07: the status bar narrates every outcome — teach through it. Copy is
  // rendered through the glossary so sewing terms chip inline on first use;
  // the popover is disposed with the page (main.ts owns the lifecycle).
  const statusPopover = createGlossaryPopover();

  shell.append(toolbar, layout);
  root.append(shell, status);

  // --- Live state + view lifecycle -----------------------------------------
  const startup = loadStartupProject();
  // Render-side selection store: the viewport and piece panel subscribe to
  // it, and their taps route through the matSelection proxy below, so the
  // state model stays the only writer.
  const selection = createSelectionStore();
  // UX-08: a first session opens in the entry flow (no mat scene mounted);
  // every other cold start opens on the mat as before.
  let state: AppState = startup.startInEntry
    ? initialEntryState(startup.project)
    : initialAppState(startup.project);
  let viewport: Viewport | null = null;
  let assemblyView: AssemblyView | null = null;
  let assemblyControls: AssemblyControlsHandle | null = null;
  let panelHandle: PanelHandle | null = null;
  let legendHandle: MaterialsLegendHandle | null = null;
  let fabricHandle: { dispose(): void } | null = null;
  let measurementsHandle: MeasurementsPanelHandle | null = null;
  let unsubscribe: (() => void) | null = null;
  let assembleButton: HTMLButtonElement | null = null;
  let refitButtonHandle: RefitButtonHandle | null = null;
  let entryHandle: EntryFlowHandle | null = null;
  let orderReviewHandle: OrderReviewHandle | null = null;

  /** Swap the live project: tear the old views down, mount fresh ones. */
  const mountProject = (project: Project): void => {
    // Mode transitions and project switches both land here; an assembly
    // scene cannot survive the remount.
    disposeAssemblyScene();
    panelHandle?.dispose();
    legendHandle?.dispose();
    legendHandle = null;
    fabricHandle?.dispose();
    measurementsHandle?.dispose();
    viewport?.dispose();
    projectTitle.textContent = project.name;
    // Keep the picker honest: a saved/imported project that is not a
    // starter deselects it rather than lying about provenance. (Selection
    // clearing is the model's job — the transitions emit it.)
    const entry = starterById(project.id);
    starterPicker.value = entry?.id ?? '';

    canvasHolder.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.className = 'viewport-canvas';
    // Canvas-level pointer-events lockdown per the blueprint; the CSS class
    // carries the same rule for browsers where the attribute arrives late.
    canvas.style.touchAction = 'none';
    canvasHolder.appendChild(canvas);

    try {
      viewport = createViewport({
        canvas,
        container: canvasHolder,
        project,
        selection: matSelection,
        // Scene-side hover lands on the legend (entry highlight); the
        // legend's own hover lands back on the scene through onEntryHover
        // below — one transient-attention channel, two directions.
        onHoverChange: (id) => legendHandle?.setHover(id),
      });
    } catch (error) {
      // Never swallow: the user gets the unsupported screen with the cause.
      console.error('viewport failed to start', error);
      renderUnsupported(root);
      return;
    }
    // Materials legend (UX-02): every piece on the mat, named and
    // fabric-identified, overlaid on the viewport it describes. Entries
    // select through the same matSelection proxy as every other surface
    // (the state model stays the only writer), and 44 px entries keep the
    // legend usable at the cutting table.
    legendHandle = createMaterialsLegend(
      canvasHolder,
      project.pieces,
      project.fabric,
      matSelection,
      { onEntryHover: (id) => viewport?.setHover(id) },
    );
    panelHandle = createPiecePanel(
      piecesSection,
      project.pieces,
      project.assembly,
      matSelection,
      {
        onPreset: (preset) => viewport?.applyPreset(preset),
      },
    );
    // Fabric panel: weave / scale / colour / stripe pickers that re-skin
    // every piece live. Re-created per mount so a loaded or imported
    // project's fabric seeds the controls; changes route through the model
    // and write through to the project, so remounts and Save/Export/Share
    // keep the user's fabric.
    fabricHandle = createFabricPanel(fabricSection, project.fabric, {
      onFabricChange: (spec) => dispatch(applyFabric(state, spec)),
    });
    // Measurements panel: re-created per project from THAT project's
    // declared parameter schema (UX-03) — the notebook holder never shows
    // pants fields, and a project with no parameters gets the narrated
    // empty state. A failed draft keeps the last valid pattern on the mat.
    measurementsHandle = createMeasurementsPanel(
      measurementsSection,
      entry?.parameters ?? EMPTY_PARAMETERS,
      {
        onRedraft: (values) => {
          const redraft = entry?.redraft;
          // Unreachable through the UI — no parameters means no fields to
          // edit — but the guard keeps the contract honest: no redraft
          // without a declared schema.
          if (!redraft) return;
          try {
            // Assembly-aware starters (pants) resolve their chains from
            // the fresh draft; the pieces are the same set redraft
            // returns. Plain starters plan from the project's static
            // assembly as before.
            const result =
              entry?.redraftAssembly?.(values) ?? { pieces: redraft(values) };
            // The redraft writes through the model, so Save/Export capture
            // what is on the mat and the live scene (either mode) follows.
            // A resolved assembly rides along — its chains are properties
            // of the fresh draft.
            dispatch(redraftPieces(state, result.pieces, result.assembly));
            measurementsHandle?.showDraftError(null);
          } catch (error) {
            // Never swallow: surface the failure next to the fields,
            // keeping the last valid draft on the mat.
            console.error('redraft failed', error);
            measurementsHandle?.showDraftError(
              'Could not redraft with those measurements — ' +
                'the last valid pattern is still shown. Adjust and try again.',
            );
          }
        },
      },
    );
    // Re-derive the selection status from the freshly mounted project so
    // the bar never carries pre-mount text. Selection subscription itself
    // is module-level (UX-05) — remounts must not stack listeners.
    const text = statusText(state);
    if (text !== null) narrate(text);
    // The mat viewport is live again — refit has work to frame (main #16,
    // integrated with the UX-03 remount path).
    refitButtonHandle?.setEnabled(true);
  };

  // --- Assembly mode (fold-around-seam walkthrough) ------------------------
  // Function declarations on purpose: mountProject (above) and the pagehide
  // handler call these, and they must be live wherever those run first.

  /** Starter projects carry a learn card; other projects get a plain sign-off. */
  function starterLearnCard(project: Project): string {
    return 'learnCard' in project && typeof project.learnCard === 'string'
      ? project.learnCard
      : 'Assembly complete.';
  }

  /** Remove the assembly scene, leaving mode ownership to the transitions. */
  function disposeAssemblyScene(): void {
    assemblyControls?.dispose();
    assemblyControls = null;
    assemblyView?.dispose();
    assemblyView = null;
  }

  /**
   * Build the assembly walkthrough for the current state. Throws when the
   * project cannot be planned (e.g. a hand-edited import with unmatchable
   * seams); the caller keeps the mat and narrates, so the model never
   * claims a mode the scene does not show.
   */
  function buildAssemblyScene(): void {
    // The legend is a mat-mode surface and its card lives in the canvas
    // holder this function clears — let it go with the mat it describes.
    legendHandle?.dispose();
    legendHandle = null;
    viewport?.dispose();
    viewport = null;
    canvasHolder.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.className = 'viewport-canvas';
    canvas.style.touchAction = 'none';
    canvasHolder.appendChild(canvas);
    assemblyView = createAssemblyView({
      canvas,
      container: canvasHolder,
      project: state.project,
    });
    const nameOf = (id: string): string =>
      state.project.pieces.find((p) => p.id === id)?.name ?? id;
    // UX-07: named seams lead the counter — "Rise seam: Front → Back" — so
    // the walkthrough teaches the seam's name where the user is looking.
    const labels = assemblyView.plan.steps.map(({ step }) => ({
      title: step.name
        ? `${step.name}: ${nameOf(step.pieces[0])} → ${nameOf(step.pieces[1])}`
        : `${nameOf(step.pieces[0])} → ${nameOf(step.pieces[1])}`,
      note: step.note,
    }));
    assemblyControls = createAssemblyControls(canvasHolder, {
      labels,
      learnCard: starterLearnCard(state.project),
      onScrub: (scrub) => assemblyView?.setScrub(scrub.stepIndex, scrub.t),
      onExit: exitAssemblyToMat,
      // UX-01 motion spec: fold duration per seam — curved seams get more
      // time. Reduced-motion gating lives in the controls; the camera's
      // pre-frame rides onStepBegin (the seam about to fold).
      stepDurationMs: (stepIndex, forward) => {
        const chain = assemblyView?.plan.steps[stepIndex]?.anchorChainWorld;
        return foldDurationMs(forward, chain ? seamIsCurved(chain) : false);
      },
      onStepBegin: (stepIndex, forward) =>
        assemblyView?.preFrameSeam(stepIndex, forward),
    });
  }

  /**
   * Assemble shortcut target and the order review's Start stitching action
   * (UX-10): swap the stage for the walkthrough. The walkthrough can be
   * requested from the mat or from the order review (where Start stitching
   * is the review's one action) — mirrors the button's disabled state.
   */
  function tryEnterAssembly(): void {
    if (state.mode !== 'mat' && state.mode !== 'review') return;
    try {
      buildAssemblyScene();
    } catch (error) {
      console.error('assembly failed to plan', error);
      // The scene build tore the mat down before failing; restore it. The
      // model never left 'mat', so there is no transition to unwind.
      if (!viewport) mountProject(state.project);
      narrate(
        `Cannot assemble this project (${errorMessage(error)}) — the cutting mat is unchanged.`,
        'error',
      );
      return;
    }
    // Effects: the Assemble button derives from mode, and any mat selection
    // clears — selection is a mat concept, and the walkthrough shows none.
    dispatch(enterAssembly(state));
    const steps = assemblyView?.plan.steps ?? [];
    narrate(assemblyEntryMessage(steps.length, steps[0]?.step.name));
    // Assembly swaps the mat viewport out — refit has nothing to frame
    // (main #16, integrated with the UX-05 state-driven entry).
    refitButtonHandle?.setEnabled(false);
  }

  /** Leave assembly mode and rebuild the cutting mat. */
  function exitAssemblyToMat(): void {
    if (state.mode !== 'assembly') return;
    dispatch(exitAssembly(state));
    narrate('Back on the cutting mat.');
  }

  // --- Entry flow (UX-08: fabric-first first-session surface) --------------
  // The entry overlay is the flow's only DOM: it mounts when the model is in
  // entry mode and mirrors the model's entry substate after every dispatch.
  // The five effect slots carry no entry-step channel by design ("no new
  // side channels"), so the flow's re-render reads state directly — a pure
  // render from the model, never a write around it.

  function disposeEntrySurface(): void {
    entryHandle?.dispose();
    entryHandle = null;
  }

  function mountEntrySurface(): void {
    if (state.entry === null) return; // not enterable in mat/assembly modes
    // The flow holds the stage: tear both scenes down so nothing renders or
    // listens behind the overlay; the mat remounts when the flow ends.
    disposeAssemblyScene();
    panelHandle?.dispose();
    panelHandle = null;
    legendHandle?.dispose();
    legendHandle = null;
    fabricHandle?.dispose();
    fabricHandle = null;
    measurementsHandle?.dispose();
    measurementsHandle = null;
    viewport?.dispose();
    viewport = null;
    refitButtonHandle?.setEnabled(false);
    entryHandle = createEntryFlow(layout, {
      entry: state.entry,
      seedFabric: state.project.fabric,
      projects: [
        ...STARTERS.map((starter) => ({ id: starter.id, name: starter.name })),
        { id: CURATED_BLANK_ID, name: 'Curated blank' },
      ],
      callbacks: {
        onFabricChosen: (spec) => {
          dispatch(chooseEntryFabric(state, spec));
          narrate(entryProjectStepMessage());
        },
        onProjectChosen: (id) => {
          dispatch(chooseEntryProject(state, id));
          narrate(
            entryLandedMessage(
              state.project.name,
              isStarterProject(state.project)
                ? state.project.learnCard
                : undefined,
            ),
          );
        },
        onBackToFabric: () => {
          dispatch(beginEntry(state));
          narrate(entryFabricStepMessage());
        },
        onCancel: () => {
          dispatch(cancelEntry(state));
          narrate(cancelEntryMessage(state.project.name));
        },
      },
    });
  }

  /** One render authority for the flow: mount, mirror, or drop it. */
  function syncEntrySurface(): void {
    if (state.mode === 'entry' && state.entry !== null) {
      if (entryHandle === null) mountEntrySurface();
      else entryHandle.render(state.entry);
    } else {
      disposeEntrySurface();
    }
  }

  // --- Order review (UX-10: the order, reviewable before starting) ---------
  // Same discipline as the entry flow: the review holds the stage (no scene
  // renders or listens behind it), it is a pure render of the model — the
  // rows read straight off project.assembly — and every action dispatches a
  // transition. Start stitching reuses the existing assembly entry path;
  // Back remounts the mat through the mode transition.

  function disposeOrderReviewSurface(): void {
    orderReviewHandle?.dispose();
    orderReviewHandle = null;
  }

  function mountOrderReviewSurface(): void {
    if (state.mode !== 'review') return;
    // The review holds the stage: tear both scenes down so nothing renders
    // or listens behind it; the mat remounts on the way back (a mode change
    // to 'mat' rebuilds when no viewport is live).
    disposeAssemblyScene();
    panelHandle?.dispose();
    panelHandle = null;
    legendHandle?.dispose();
    legendHandle = null;
    fabricHandle?.dispose();
    fabricHandle = null;
    measurementsHandle?.dispose();
    measurementsHandle = null;
    viewport?.dispose();
    viewport = null;
    refitButtonHandle?.setEnabled(false);
    orderReviewHandle = createOrderReview(layout, state.project, {
      // Start stitching is the existing assembly entry (UX-10): same path
      // the Assemble button used before the review existed — scene build,
      // enterAssembly transition, walkthrough narration.
      onStart: () => tryEnterAssembly(),
      onBack: () => exitOrderReviewToMat(),
    });
  }

  /** Leave the review for the mat; shared by the button and Escape. */
  function exitOrderReviewToMat(): void {
    if (state.mode !== 'review') return;
    dispatch(cancelOrderReview(state));
    narrate('Back on the cutting mat.');
  }

  /** Assemble button / shortcut: open the review, narrate what's ahead. */
  function enterOrderReview(): void {
    if (state.mode !== 'mat') return;
    dispatch(beginOrderReview(state));
    const rows = orderReviewRows(state.project);
    narrate(
      rows.length > 0
        ? orderReviewMessage(
            state.project.name,
            rows.length,
            state.project.assembly[0]?.name,
          )
        : orderReviewEmptyMessage(state.project.name),
    );
  }

  /** One render authority for the review: mount it or drop it. */
  function syncOrderReviewSurface(): void {
    if (state.mode === 'review') {
      if (orderReviewHandle === null) mountOrderReviewSurface();
    } else {
      disposeOrderReviewSurface();
    }
  }

  // Narration and selection share the status bar: the latest event wins.
  // The tone dresses the pill (error/success) so outcomes read at a glance.
  // Copy renders through the glossary annotator: terms chip on first use
  // (UX-07), so narration teaches instead of assuming vocabulary.
  const narrate = (message: string, tone: StatusTone = 'info'): void => {
    statusPopover.close();
    status.replaceChildren();
    renderAnnotatedText(status, message, { popover: statusPopover });
    status.classList.remove('error', 'success');
    const className = statusClassName(tone);
    if (className) status.classList.add(className);
  };

  // Keep the model mirrored with the store the surfaces were told about,
  // and derive the mat-mode status line from state — the bar can never
  // contradict the scene. Assembly-mode lines stay event-driven.
  unsubscribe = selection.subscribe((id) => {
    state = mirrorSelection(state, id);
    const text = statusText(state);
    if (text !== null) narrate(text);
  });

  // Entry-mode toolbar gating (UX-08): persistence controls suspend while
  // the entry flow holds the stage; New stays live so the flow can be
  // re-entered from anywhere.
  const toolbarControls: HTMLButtonElement[] = [];
  const setToolbarEnabled = (enabled: boolean): void => {
    for (const control of toolbarControls) control.disabled = !enabled;
  };

  // The one write path into the UI: apply a transition's effects in the
  // model's canonical order. Handlers stay dumb — they read the new state.
  const dispatch = (result: TransitionResult): void => {
    state = result.state;
    applyAppState(result, {
      onProjectReplaced: (project) => mountProject(project),
      onModeChanged: (mode) => {
        // Entry and the review suspend the persistence controls while they
        // hold the stage (UX-08, UX-10); assembly keeps them live exactly
        // as before — only Assemble had a mode gate.
        setToolbarEnabled(mode !== 'entry' && mode !== 'review');
        if (assembleButton) assembleButton.disabled = mode !== 'mat';
        // Exit-to-mat rebuilds the mat; a project replacement mounted it
        // already.
        if (mode === 'mat' && !viewport) mountProject(state.project);
      },
      onSelectionChanged: (id) => selection.select(id),
      onPiecesRedrafted: (pieces) => {
        viewport?.updatePieces(pieces);
        panelHandle?.updatePieces(pieces);
        legendHandle?.updatePieces(pieces);
        if (state.mode === 'assembly') {
          // The walkthrough's seams are planned from piece geometry; stale
          // geometry would fold the wrong pattern. Re-plan from the redraft.
          disposeAssemblyScene();
          try {
            buildAssemblyScene();
            narrate(
              'Measurements changed — the assembly walkthrough restarted from the redrafted pattern.',
            );
          } catch (error) {
            console.error('assembly failed to plan', error);
            dispatch(exitAssembly(state));
            narrate(
              'The redrafted pattern cannot be assembled — back on the cutting mat.',
              'error',
            );
          }
        } else {
          // Refresh the selection line so the bar never carries stale
          // piece metadata from before the redraft.
          const text = statusText(state);
          if (text !== null) narrate(text);
        }
      },
      onFabricApplied: (spec) => {
        // Fabric follows the live mode: assembly re-skins through the
        // assembly view, the mat through the viewport.
        if (assemblyView) assemblyView.applyFabric(spec);
        else viewport?.applyFabric(spec);
        // The legend's swatches and summaries ride the same live swap.
        legendHandle?.updateFabric(spec);
      },
    });
    // The entry surface follows the model: mount, mirror, or drop (UX-08) —
    // and the review after it (UX-10).
    syncEntrySurface();
    syncOrderReviewSurface();
  };

  // Taps on the mat and clicks in the piece list route through the model:
  // the store is a render channel, the transitions are the only writer.
  const matSelection: SelectionStore = {
    get: () => selection.get(),
    select: (id) => dispatch(selectPiece(state, id)),
    subscribe: (listener) => selection.subscribe(listener),
  };

  if (startup.startInEntry) {
    // UX-08 first session: the entry flow holds the stage — no WebGL runs
    // before a project exists; narration names the fabric step.
    syncEntrySurface();
    narrate(entryFabricStepMessage());
  } else {
    mountProject(startup.project);
    narrate(startup.message);
  }

  // --- Toolbar (F7: projects as data) -------------------------------------
  // Buttons register themselves unless flagged always-enabled: entry mode
  // suspends the persistence controls but never the New action (UX-08).
  const addButton = (
    label: string,
    onClick: () => void,
    { alwaysEnabled = false }: { alwaysEnabled?: boolean } = {},
  ): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toolbar-btn';
    button.textContent = label;
    button.addEventListener('click', onClick);
    actions.appendChild(button);
    if (!alwaysEnabled) toolbarControls.push(button);
    return button;
  };

  // UX-08: New re-enters the fabric-first flow from any mat state.
  addButton(
    'New',
    () => {
      dispatch(beginEntry(state));
      narrate(entryFabricStepMessage());
    },
    { alwaysEnabled: true },
  );

  // Mode entry (UX-10): the Assemble button opens the order review — the
  // walkthrough starts from the review's Start stitching action.
  assembleButton = addButton('Assemble', enterOrderReview);

  // Camera refit: the tap equivalent of the F shortcut. Built once; the
  // mode transitions below decide when it has a viewport to act on.
  refitButtonHandle = createRefitButton(actions, () => viewport?.refit());
  // Startup mount (line ~376) runs before the toolbar exists — reflect the
  // live viewport state here rather than waiting for the next mount.
  refitButtonHandle.setEnabled(viewport !== null);

  addButton('Save', () => {
    try {
      saveProject(window.localStorage, state.project);
      narrate(`Saved '${state.project.name}' to this browser.`, 'success');
    } catch (error) {
      narrate(`Could not save (${errorMessage(error)}).`, 'error');
    }
  });

  addButton('Load', () => {
    const saved = loadProject(window.localStorage);
    if (saved.status === 'found') {
      dispatch(switchProject(state, saved.project));
      narrate(`Loaded '${saved.project.name}' from this browser.`, 'success');
    } else if (saved.status === 'empty') {
      narrate('Nothing saved yet — press Save first.');
    } else {
      narrate(`Saved project is invalid: ${saved.reason}`, 'error');
    }
  });

  addButton('Share', () => {
    const plan = planShare(
      state.project,
      window.location.origin + window.location.pathname,
    );
    void (async () => {
      if (plan.kind === 'url') {
        const copied = await copyTextToClipboard(plan.url);
        narrate(
          copied
            ? `Share link copied (${plan.urlLength} characters) — opening it loads '${state.project.name}'.`
            : 'Could not reach the clipboard — use Export JSON to share this project instead.',
          copied ? 'success' : 'error',
        );
        return;
      }
      // Share-mode failure state: URL over the length limit → clipboard JSON.
      const copied = await copyTextToClipboard(plan.json);
      narrate(
        copied
          ? `Too large for a link (${plan.urlLength} characters, limit ${MAX_SHARE_URL_LENGTH}) — the project JSON was copied instead. Send it to Import JSON.`
          : `Too large for a link (${plan.urlLength} characters) and the clipboard is unavailable — use Export JSON instead.`,
        copied ? 'success' : 'error',
      );
    })();
  });

  addButton('Export JSON', () => {
    try {
      downloadTextFile(
        `${slugify(state.project.name)}.pattern.json`,
        serializeProject(state.project),
        'application/json',
      );
      narrate(`Exported '${state.project.name}' as JSON.`);
    } catch (error) {
      narrate(`Export failed (${errorMessage(error)}).`);
    }
  });

  addButton('Export SVG', () => {
    try {
      downloadTextFile(
        `${slugify(state.project.name)}.pattern.svg`,
        exportPiecesSvg(state.project),
        'image/svg+xml',
      );
      narrate("Exported SVG — print at 100% scale (no 'fit to page').");
    } catch (error) {
      narrate(`SVG export failed (${errorMessage(error)}).`);
    }
  });

  addButton('Import JSON', () => {
    void (async () => {
      try {
        const text = await pickJsonText();
        if (text === null) {
          narrate('Import cancelled.');
          return;
        }
        const parsed = parseProject(text);
        if (parsed.status === 'invalid') {
          narrate(`Import failed: ${parsed.reason}`);
          return;
        }
        dispatch(switchProject(state, parsed.project));
        narrate(`Imported '${parsed.project.name}'.`);
      } catch (error) {
        narrate(`Import failed (${errorMessage(error)}).`);
      }
    })();
  });

  // UX-08: a first session opens in the entry flow — the flow's stage means
  // the persistence controls start suspended; mat cold starts start live.
  setToolbarEnabled(state.mode === 'mat');

  // Dev-only dogfooding hook (stripped from production builds): lets the
  // automation aim taps at exact piece positions in either mode.
  if (import.meta.env.DEV) {
    window.__patternStudioDebug = {
      pieceScreenPositions: () =>
        assemblyView
          ? assemblyView.pieceScreenPositions()
          : (viewport?.pieceScreenPositions() ?? []),
    };
  }

  // --- Keyboard shortcuts (blueprint polish bar) ---------------------------
  // Accelerators, not paths: every shortcut's effect is available as a tap.
  // The pure router decides meaning; typing targets never trigger shortcuts.
  document.addEventListener('keydown', (event) => {
    if (isTextEntryTarget(event.target)) return;
    const action = shortcutAction(event.key, {
      alt: event.altKey,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      shift: event.shiftKey,
    });
    if (!action) return;
    switch (action) {
      case 'preset-top':
        viewport?.applyPreset('top');
        break;
      case 'preset-3d':
        viewport?.applyPreset('three-d');
        break;
      case 'refit-camera':
        viewport?.refit();
        break;
      case 'assemble':
        enterOrderReview();
        break;
      case 'exit-or-deselect':
        if (state.mode === 'assembly') exitAssemblyToMat();
        else if (state.mode === 'review') exitOrderReviewToMat();
        else dispatch(selectPiece(state, null));
        break;
      case 'show-shortcuts':
        narrate(shortcutHint());
        break;
    }
  });

  window.addEventListener('pagehide', () => {
    unsubscribe?.();
    disposeEntrySurface();
    disposeOrderReviewSurface();
    fabricHandle?.dispose();
    measurementsHandle?.dispose();
    panelHandle?.dispose();
    legendHandle?.dispose();
    disposeAssemblyScene();
    viewport?.dispose();
    viewport = null;
    statusPopover.dispose();
  });
}
