/**
 * App shell: glues the starter project, viewport, and piece panel together
 * and owns the two off-happy-path states the blueprint requires — the
 * WebGL 2 unsupported-device screen and the status readout that narrates
 * selection without relying on hover.
 */
import { createStarterProject } from './model';
import { NOTEBOOK_HOLDER_STARTER } from './data/notebookHolder';
import { createPiecePanel } from './view/panel';
import { supportsWebGL2 } from './view/webgl';
import { createSelectionStore } from './view/selection';
import { createViewport } from './view/viewport';
import type { Viewport } from './view/viewport';

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

export function mountApp(root: HTMLElement): void {
  root.innerHTML = '';

  if (!supportsWebGL2()) {
    renderUnsupported(root);
    return;
  }

  const layout = document.createElement('div');
  layout.className = 'app-layout';

  const status = document.createElement('div');
  status.className = 'status-bar';
  status.setAttribute('role', 'status');
  status.textContent =
    'Nothing selected — tap a piece or pick one from the list.';

  const canvasHolder = document.createElement('div');
  canvasHolder.className = 'viewport-holder';
  const canvas = document.createElement('canvas');
  canvas.className = 'viewport-canvas';
  // Canvas-level pointer-events lockdown per the blueprint; the CSS class
  // carries the same rule for browsers where the attribute arrives late.
  canvas.style.touchAction = 'none';
  canvasHolder.appendChild(canvas);

  const panel = document.createElement('aside');
  panel.className = 'panel';

  layout.append(canvasHolder, panel);
  root.append(layout, status);

  const project = createStarterProject(NOTEBOOK_HOLDER_STARTER);
  const selection = createSelectionStore();
  let viewport: Viewport | null = null;

  const statusFor = (id: string | null): string => {
    if (!id) return 'Nothing selected — tap a piece or pick one from the list.';
    const piece = project.pieces.find((p) => p.id === id);
    return piece
      ? `Selected: ${piece.name} (cut ${piece.cutCount}).`
      : `Selected: ${id}.`;
  };

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

  const panelHandle = createPiecePanel(panel, project.pieces, selection, {
    onPreset: (preset) => viewport?.applyPreset(preset),
  });

  const renderStatus = (id: string | null): void => {
    status.textContent = statusFor(id);
  };
  renderStatus(selection.get());
  const unsubscribe = selection.subscribe(renderStatus);

  window.addEventListener('pagehide', () => {
    unsubscribe();
    panelHandle.dispose();
    viewport?.dispose();
    viewport = null;
  });
}
