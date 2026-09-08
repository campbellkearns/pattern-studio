/**
 * App shell: glues the starter project, viewport, and piece panel together
 * and owns the two off-happy-path states the blueprint requires — the
 * WebGL 2 unsupported-device screen and the status readout that narrates
 * selection without relying on hover. The toolbar (F7, projects as data)
 * carries localStorage save/load and JSON import/export; every persistence
 * outcome — including failures — is narrated in the status bar, never silent.
 */
import { createStarterProject } from './model';
import type { Project } from './model';
import { NOTEBOOK_HOLDER_STARTER } from './data/notebookHolder';
import {
  loadProject,
  parseProject,
  saveProject,
  serializeProject,
} from './io/projectIo';
import { downloadTextFile, pickJsonText } from './io/fileIo';
import { createPiecePanel } from './view/panel';
import { supportsWebGL2 } from './view/webgl';
import { createSelectionStore } from './view/selection';
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

export function mountApp(root: HTMLElement): void {
  root.innerHTML = '';

  if (!supportsWebGL2()) {
    renderUnsupported(root);
    return;
  }

  const starter = createStarterProject(NOTEBOOK_HOLDER_STARTER);

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

  const layout = document.createElement('div');
  layout.className = 'app-layout';

  const canvasHolder = document.createElement('div');
  canvasHolder.className = 'viewport-holder';

  const panel = document.createElement('aside');
  panel.className = 'panel';
  layout.append(canvasHolder, panel);

  const status = document.createElement('div');
  status.className = 'status-bar';
  status.setAttribute('role', 'status');
  status.textContent =
    'Nothing selected — tap a piece or pick one from the list.';

  shell.append(toolbar, layout);
  root.append(shell, status);

  // --- Live project + view lifecycle --------------------------------------
  const selection = createSelectionStore();
  let currentProject: Project = starter;
  let viewport: Viewport | null = null;
  let panelHandle: { dispose(): void } | null = null;
  let unsubscribe: (() => void) | null = null;

  const statusFor = (id: string | null): string => {
    if (!id) return 'Nothing selected — tap a piece or pick one from the list.';
    const piece = currentProject.pieces.find((p) => p.id === id);
    return piece
      ? `Selected: ${piece.name} (cut ${piece.cutCount}).`
      : `Selected: ${id}.`;
  };
  const renderStatus = (id: string | null): void => {
    status.textContent = statusFor(id);
  };

  /** Swap the live project: tear the old views down, mount fresh ones. */
  const mountProject = (project: Project): void => {
    unsubscribe?.();
    panelHandle?.dispose();
    viewport?.dispose();
    currentProject = project;
    selection.select(null);
    projectTitle.textContent = project.name;

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
        selection,
      });
    } catch (error) {
      // Never swallow: the user gets the unsupported screen with the cause.
      console.error('viewport failed to start', error);
      renderUnsupported(root);
      return;
    }
    panelHandle = createPiecePanel(panel, project.pieces, selection, {
      onPreset: (preset) => viewport?.applyPreset(preset),
    });
    unsubscribe = selection.subscribe(renderStatus);
    renderStatus(selection.get());
  };

  // Narration and selection share the status bar: the latest event wins.
  const narrate = (message: string): void => {
    status.textContent = message;
  };

  mountProject(starter);

  // --- Toolbar (F7: projects as data) -------------------------------------
  const addButton = (label: string, onClick: () => void): void => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toolbar-btn';
    button.textContent = label;
    button.addEventListener('click', onClick);
    actions.appendChild(button);
  };

  addButton('Save', () => {
    try {
      saveProject(window.localStorage, currentProject);
      narrate(`Saved '${currentProject.name}' to this browser.`);
    } catch (error) {
      narrate(`Could not save (${errorMessage(error)}).`);
    }
  });

  addButton('Load', () => {
    const saved = loadProject(window.localStorage);
    if (saved.status === 'found') {
      mountProject(saved.project);
      narrate(`Loaded '${saved.project.name}' from this browser.`);
    } else if (saved.status === 'empty') {
      narrate('Nothing saved yet — press Save first.');
    } else {
      narrate(`Saved project is invalid: ${saved.reason}`);
    }
  });

  addButton('Export JSON', () => {
    try {
      downloadTextFile(
        `${slugify(currentProject.name)}.pattern.json`,
        serializeProject(currentProject),
        'application/json',
      );
      narrate(`Exported '${currentProject.name}' as JSON.`);
    } catch (error) {
      narrate(`Export failed (${errorMessage(error)}).`);
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
        mountProject(parsed.project);
        narrate(`Imported '${parsed.project.name}'.`);
      } catch (error) {
        narrate(`Import failed (${errorMessage(error)}).`);
      }
    })();
  });

  // Dev-only dogfooding hook (stripped from production builds): lets the
  // automation aim taps at exact piece positions.
  if (import.meta.env.DEV) {
    window.__patternStudioDebug = {
      pieceScreenPositions: () => viewport?.pieceScreenPositions() ?? [],
    };
  }

  window.addEventListener('pagehide', () => {
    unsubscribe?.();
    panelHandle?.dispose();
    viewport?.dispose();
    viewport = null;
  });
}
