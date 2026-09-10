/**
 * Entry flow (UX-08): the fabric-first first-session surface — fabric step,
 * then project step (starter ladder plus the curated blank). The flow is a
 * pure function of the model's EntryState: every choice dispatches a
 * transition through the shell's single dispatch path, and render() only
 * mirrors what the model already decided. The fabric step embeds the real
 * fabric panel (FabricSpec validation, swatch pattern) and buffers its
 * drafts locally — the committed spec reaches the model once, on "Choose a
 * project", so one dispatch carries one committed choice. Every step has a
 * back path; narration happens in the shell at the dispatch sites.
 */
import type { EntryState } from '../appState';
import type { FabricSpec } from '../model';
import { createFabricPanel } from './fabricPanel';
import type { FabricPanelHandle } from './fabricPanel';

/** One choosable project on the flow's project step. */
export interface EntryProjectOption {
  readonly id: string;
  readonly name: string;
}

export interface EntryFlowCallbacks {
  /** "Choose a project" on the fabric step: commit the buffered fabric. */
  onFabricChosen(spec: FabricSpec): void;
  /** A starter or the curated blank was chosen: land on the mat. */
  onProjectChosen(id: string): void;
  /** The project step's back path: re-enter at fabric, fabric kept. */
  onBackToFabric(): void;
  /** The fabric step's back path: leave the flow for the mat. */
  onCancel(): void;
}

export interface EntryFlowHandle {
  /** Mirror the model's entry substate after each dispatch. */
  render(entry: EntryState): void;
  dispose(): void;
}

export function createEntryFlow(
  container: HTMLElement,
  options: {
    readonly entry: EntryState;
    /** Fabric the panel seeds from when the flow has no committed choice. */
    readonly seedFabric: FabricSpec;
    readonly projects: readonly EntryProjectOption[];
    readonly callbacks: EntryFlowCallbacks;
  },
): EntryFlowHandle {
  const root = document.createElement('div');
  root.className = 'entry-flow';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Set up your project');

  // --- Fabric step ---------------------------------------------------------
  const fabricPane = document.createElement('div');
  fabricPane.className = 'entry-pane';
  fabricPane.dataset.entryStep = 'fabric';

  const fabricHeading = document.createElement('h2');
  fabricHeading.textContent = 'Choose your fabric';
  const fabricCopy = document.createElement('p');
  fabricCopy.className = 'entry-copy';
  fabricCopy.textContent =
    'Fabric first — every piece re-skins to whatever you pick here. ' +
    'You can keep changing it on the mat.';
  const fabricHost = document.createElement('div');
  fabricHost.className = 'entry-fabric-host';

  const fabricActions = document.createElement('div');
  fabricActions.className = 'entry-actions';
  const toProjectButton = document.createElement('button');
  toProjectButton.type = 'button';
  toProjectButton.className = 'entry-btn entry-btn-primary';
  toProjectButton.textContent = 'Choose a project →';
  toProjectButton.addEventListener('click', () =>
    options.callbacks.onFabricChosen(chosenFabric),
  );
  const cancelBackButton = document.createElement('button');
  cancelBackButton.type = 'button';
  cancelBackButton.className = 'entry-btn';
  cancelBackButton.textContent = 'Back to the mat';
  cancelBackButton.addEventListener('click', () => options.callbacks.onCancel());
  fabricActions.append(toProjectButton, cancelBackButton);
  fabricPane.append(fabricHeading, fabricCopy, fabricHost, fabricActions);

  // --- Project step --------------------------------------------------------
  const projectPane = document.createElement('div');
  projectPane.className = 'entry-pane';
  projectPane.dataset.entryStep = 'project';
  projectPane.hidden = true;

  const projectHeading = document.createElement('h2');
  projectHeading.textContent = 'Choose a project';
  const projectCopy = document.createElement('p');
  projectCopy.className = 'entry-copy';
  projectCopy.textContent =
    'Pick a starter, or begin from a curated blank — everything stays ' +
    'adjustable once you are on the mat.';
  const projectList = document.createElement('div');
  projectList.className = 'entry-project-list';
  projectList.setAttribute('role', 'group');
  projectList.setAttribute('aria-label', 'Projects');
  for (const option of options.projects) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'entry-btn entry-project-btn';
    button.textContent = option.name;
    button.addEventListener('click', () =>
      options.callbacks.onProjectChosen(option.id),
    );
    projectList.appendChild(button);
  }

  const projectActions = document.createElement('div');
  projectActions.className = 'entry-actions';
  const fabricBackButton = document.createElement('button');
  fabricBackButton.type = 'button';
  fabricBackButton.className = 'entry-btn';
  fabricBackButton.textContent = '← Back to fabric';
  fabricBackButton.addEventListener('click', () =>
    options.callbacks.onBackToFabric(),
  );
  projectActions.append(fabricBackButton);
  projectPane.append(projectHeading, projectCopy, projectList, projectActions);

  root.append(fabricPane, projectPane);
  container.appendChild(root);

  // The panel buffers drafts; the model sees one committed spec per step.
  let fabricPanel: FabricPanelHandle | null = null;
  let panelSeed: FabricSpec | null = null;
  let chosenFabric: FabricSpec = options.seedFabric;

  function buildFabricPanel(seed: FabricSpec): void {
    fabricPanel?.dispose();
    panelSeed = seed;
    chosenFabric = seed;
    fabricPanel = createFabricPanel(fabricHost, seed, {
      onFabricChange: (spec) => {
        chosenFabric = spec;
      },
    });
  }

  function render(entry: EntryState): void {
    const fabricStep = entry.step === 'fabric';
    fabricPane.hidden = !fabricStep;
    projectPane.hidden = fabricStep;
    if (fabricStep) {
      const seed = entry.fabric ?? options.seedFabric;
      // Re-seed when the model holds a different committed fabric (e.g. the
      // project step's back path) — the panel always mirrors the model.
      if (panelSeed === null || seed !== panelSeed) buildFabricPanel(seed);
    }
  }

  render(options.entry);

  return {
    render,
    dispose(): void {
      fabricPanel?.dispose();
      fabricPanel = null;
      root.remove();
    },
  };
}
