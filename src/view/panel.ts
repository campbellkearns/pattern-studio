/**
 * Piece-list panel: the tap equivalent for every hover affordance in the
 * viewport. Selecting from the list and selecting on the mat are the same
 * operation through the shared SelectionStore, and both directions keep the
 * DOM in sync. Buttons carry 44 px touch targets per the blueprint's HIG
 * baseline; true-scale dimensions come from the same geometry the viewport
 * renders.
 */
import type { Piece } from '../model';
import { pieceExtents } from './pieceGeometry';
import type { SelectionStore } from './selection';

export type CameraPreset = 'top' | 'three-d';

export interface PanelCallbacks {
  onPreset(preset: CameraPreset): void;
}

export interface PanelHandle {
  dispose(): void;
}

function formatSize(piece: Piece): string {
  const e = pieceExtents(piece);
  return `${e.width.toFixed(1)} × ${e.height.toFixed(1)} cm`;
}

export function createPiecePanel(
  container: HTMLElement,
  pieces: readonly Piece[],
  selection: SelectionStore,
  callbacks: PanelCallbacks,
): PanelHandle {
  container.innerHTML = '';

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

  const entries = pieces.map((piece) => {
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
    meta.textContent = `cut ${piece.cutCount} · ${formatSize(piece)}`;

    button.append(name, meta);
    item.appendChild(button);
    list.appendChild(item);

    const onClick = (): void => {
      selection.select(selection.get() === piece.id ? null : piece.id);
    };
    button.addEventListener('click', onClick);
    return { button, onClick };
  });

  container.append(header, list);

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
    dispose(): void {
      unsubscribe();
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
