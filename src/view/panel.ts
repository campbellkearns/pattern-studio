/**
 * Piece-list panel: the tap equivalent for every hover affordance in the
 * viewport. Selecting from the list and selecting on the mat are the same
 * operation through the shared SelectionStore, and both directions keep the
 * DOM in sync. Buttons carry 44 px touch targets per the blueprint's HIG
 * baseline; true-scale dimensions come from the same geometry the viewport
 * renders.
 */
import type { Piece, SeamStep } from '../model';
import { createGlossaryPopover, renderAnnotatedText } from './glossaryDom';
import { pieceExtents } from './pieceGeometry';
import type { SelectionStore } from './selection';

export type CameraPreset = 'top' | 'three-d';

export interface PanelCallbacks {
  onPreset(preset: CameraPreset): void;
}

export interface PanelHandle {
  /** Swap the listed pieces (parametric redraft); selection ids persist. */
  updatePieces(pieces: readonly Piece[]): void;
  dispose(): void;
}

function formatSize(piece: Piece): string {
  const e = pieceExtents(piece);
  return `${e.width.toFixed(1)} × ${e.height.toFixed(1)} cm`;
}

export function createPiecePanel(
  container: HTMLElement,
  initialPieces: readonly Piece[],
  assembly: readonly SeamStep[],
  selection: SelectionStore,
  callbacks: PanelCallbacks,
): PanelHandle {
  let pieces = initialPieces;

  // UX-07 glossary: one popover serves the piece meta and the seams line.
  const popover = createGlossaryPopover();

  const header = document.createElement('div');
  header.className = 'panel-header';

  const title = document.createElement('h2');
  title.textContent = 'Pieces';
  header.appendChild(title);

  const presets = document.createElement('div');
  presets.className = 'presets';
  const presetButtons: { button: HTMLButtonElement; handler: () => void }[] =
    [];
  for (const preset of ['top', 'three-d'] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset-btn';
    button.textContent = preset === 'top' ? 'Top' : '3D';
    const handler = (): void => callbacks.onPreset(preset);
    button.addEventListener('click', handler);
    presets.appendChild(button);
    presetButtons.push({ button, handler });
  }
  header.appendChild(presets);

  const list = document.createElement('ul');
  list.className = 'piece-list';

  // Empty state: a validated project may carry zero pieces (a hand-edited
  // import), and an empty list must say so instead of showing a blank panel.
  const empty = document.createElement('p');
  empty.className = 'panel-empty';
  empty.textContent =
    'No pieces on the mat — pick a starter or import a project.';

  // UX-07: the panel names the seams the walkthrough will fold, so the
  // build order is legible before Assemble. Rebuilt with the list so the
  // fallback names track redrafted pieces.
  const seams = document.createElement('p');
  seams.className = 'panel-seams';

  const seamDisplayName = (step: SeamStep): string => {
    if (step.name) return step.name;
    const nameOf = (id: string): string =>
      pieces.find((piece) => piece.id === id)?.name ?? id;
    return `${nameOf(step.pieces[0])} → ${nameOf(step.pieces[1])}`;
  };

  const buildSeamsLine = (): void => {
    seams.replaceChildren();
    if (assembly.length === 0) return;
    const names = assembly.map(seamDisplayName).join(', ');
    renderAnnotatedText(
      seams,
      `Assembly — ${assembly.length} seam${assembly.length === 1 ? '' : 's'}: ${names}.`,
      { popover },
    );
  };

  let entries: { button: HTMLButtonElement; onClick: () => void }[] = [];

  const buildList = (): void => {
    list.innerHTML = '';
    entries = [];
    for (const piece of pieces) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'piece-btn';
      button.dataset.pieceId = piece.id;

      const name = document.createElement('span');
      name.className = 'piece-name';
      name.textContent = piece.name;
      const meta = document.createElement('span');
      meta.className = 'piece-meta';
      // The cut count is pattern shorthand — chip the term inline (UX-07).
      renderAnnotatedText(meta, `cut ${piece.cutCount}`, { popover });
      meta.appendChild(
        document.createTextNode(` · ${formatSize(piece)}`),
      );

      button.append(name, meta);
      item.appendChild(button);
      list.appendChild(item);

      const onClick = (): void => {
        selection.select(selection.get() === piece.id ? null : piece.id);
      };
      button.addEventListener('click', onClick);
      entries.push({ button, onClick });
    }
    list.hidden = pieces.length === 0;
    empty.hidden = pieces.length > 0;
    seams.hidden = assembly.length === 0;
    buildSeamsLine();
  };
  buildList();

  container.append(header, list, empty, seams);

  const render = (selectedId: string | null): void => {
    for (const { button } of entries) {
      const selected = selectedId === button.dataset.pieceId;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  };
  render(selection.get());
  const unsubscribe = selection.subscribe(render);

  return {
    updatePieces(next: readonly Piece[]): void {
      pieces = next;
      buildList();
      render(selection.get());
    },
    dispose(): void {
      unsubscribe();
      popover.dispose();
      for (const { button, onClick } of entries) {
        button.removeEventListener('click', onClick);
      }
      for (const { button, handler } of presetButtons) {
        button.removeEventListener('click', handler);
      }
      container.innerHTML = '';
    },
  };
}
