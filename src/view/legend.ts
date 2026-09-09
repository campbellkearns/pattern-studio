/**
 * Materials legend (UX-02): an overlay card on the cutting mat listing
 * every piece with its name and fabric, so the table reads at a glance —
 * the acceptance is "identifiable without tapping".
 *
 * Bidirectional highlight with the viewport:
 *  - selection runs through the shared SelectionStore (in the shell, the
 *    same matSelection proxy every other surface writes through — the
 *    state model's selectPiece transition stays the only writer), so a
 *    legend click and a mat tap are one operation;
 *  - hover is the render channel in both directions: hovering an entry
 *    asks the shell to glow its piece in the scene (onEntryHover), and a
 *    scene-side hover arrives here through setHover. Focus mirrors hover
 *    so the linkage works from the keyboard too.
 *
 * All pieces of a project share one FabricSpec (the model's fabric is
 * per-project), so every entry describes the same fabric — still shown
 * per row, because the legend's job is answering "what is this piece and
 * what is it cut from" with no other page open.
 */
import type { FabricSpec, Piece } from '../model';
import { hexToRgb, rgbCss, shade } from './fabricTexture';
import type { SelectionStore } from './selection';

const WEAVE_LABELS: Readonly<Record<FabricSpec['weave'], string>> = {
  plain: 'Plain',
  twill: 'Twill',
  satin: 'Satin',
};

/** One-line fabric identity, e.g. "Twill · 210 gsm · 0.4 cm warp stripes". */
export function fabricSummary(spec: FabricSpec): string {
  const summary = `${WEAVE_LABELS[spec.weave]} · ${spec.weight} gsm`;
  return spec.stripeCm === undefined
    ? summary
    : `${summary} · ${spec.stripeCm} cm warp stripes`;
}

/**
 * CSS background for a fabric swatch. Solid specs paint their colour;
 * striped specs paint vertical bands (warp runs vertical in the swatch)
 * in the same stripe shade the weave texture derives (shade 0.55 —
 * weaveLayout's stripe), so swatch and 3D skin agree.
 */
export function swatchBackground(spec: FabricSpec): string {
  const base = rgbCss(hexToRgb(spec.color));
  if (spec.stripeCm === undefined) return base;
  const stripe = rgbCss(shade(hexToRgb(spec.color), 0.55));
  return `repeating-linear-gradient(90deg, ${stripe} 0 3px, ${base} 3px 9px)`;
}

export interface MaterialsLegendCallbacks {
  /** Transient attention leaving the legend: highlight this piece in the scene. */
  onEntryHover(pieceId: string | null): void;
}

export interface MaterialsLegendHandle {
  /** Swap the listed pieces (parametric redraft); selection ids persist. */
  updatePieces(pieces: readonly Piece[]): void;
  /** Re-skin every swatch and summary for a new fabric spec (live swap). */
  updateFabric(spec: FabricSpec): void;
  /** Reflect a scene-side hover onto the matching entry; null clears. */
  setHover(pieceId: string | null): void;
  dispose(): void;
}

export function createMaterialsLegend(
  container: HTMLElement,
  initialPieces: readonly Piece[],
  fabric: FabricSpec,
  selection: SelectionStore,
  callbacks: MaterialsLegendCallbacks,
): MaterialsLegendHandle {
  let pieces = initialPieces;
  let currentFabric = fabric;
  let hoverId: string | null = null;

  const card = document.createElement('div');
  card.className = 'materials-legend';
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', 'Materials on the mat');

  const title = document.createElement('h2');
  title.textContent = 'Materials on the mat';
  card.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'legend-list';
  card.appendChild(list);

  container.appendChild(card);

  let entries: {
    button: HTMLButtonElement;
    swatch: HTMLSpanElement;
    fabricLine: HTMLSpanElement;
    detach(): void;
  }[] = [];

  const renderFabric = (): void => {
    for (const { swatch, fabricLine } of entries) {
      swatch.style.background = swatchBackground(currentFabric);
      fabricLine.textContent = fabricSummary(currentFabric);
    }
  };

  const render = (selectedId: string | null): void => {
    for (const { button } of entries) {
      const selected = selectedId === button.dataset.pieceId;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  };

  const renderHover = (): void => {
    for (const { button } of entries) {
      button.classList.toggle('hover', hoverId === button.dataset.pieceId);
    }
  };

  const buildList = (): void => {
    for (const { detach } of entries) detach();
    list.innerHTML = '';
    entries = [];
    for (const piece of pieces) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'legend-entry';
      button.dataset.pieceId = piece.id;

      const swatch = document.createElement('span');
      swatch.className = 'legend-swatch';
      // Decorative: the fabric line names weave and weight in text.
      swatch.setAttribute('aria-hidden', 'true');

      const text = document.createElement('span');
      text.className = 'legend-text';
      const name = document.createElement('span');
      name.className = 'legend-name';
      name.textContent = piece.name;
      const fabricLine = document.createElement('span');
      fabricLine.className = 'legend-fabric';
      text.append(name, fabricLine);

      button.append(swatch, text);
      item.appendChild(button);
      list.appendChild(item);

      // Same toggle the piece panel uses: clicking the open entry closes it.
      const onClick = (): void => {
        selection.select(selection.get() === piece.id ? null : piece.id);
      };
      const onEnter = (): void => {
        callbacks.onEntryHover(piece.id);
      };
      const onLeave = (): void => {
        callbacks.onEntryHover(null);
      };
      button.addEventListener('click', onClick);
      button.addEventListener('mouseenter', onEnter);
      button.addEventListener('mouseleave', onLeave);
      // Keyboard parity: focusing an entry glows its piece, like hovering.
      button.addEventListener('focus', onEnter);
      button.addEventListener('blur', onLeave);
      entries.push({
        button,
        swatch,
        fabricLine,
        detach: () => {
          button.removeEventListener('click', onClick);
          button.removeEventListener('mouseenter', onEnter);
          button.removeEventListener('mouseleave', onLeave);
          button.removeEventListener('focus', onEnter);
          button.removeEventListener('blur', onLeave);
        },
      });
    }
    // A zero-piece project has nothing to identify — the piece panel owns
    // the narrated empty state, so the card gets out of the mat's way.
    card.hidden = pieces.length === 0;
    renderFabric();
    render(selection.get());
    renderHover();
  };
  buildList();

  const unsubscribe = selection.subscribe(render);

  return {
    updatePieces(next: readonly Piece[]): void {
      pieces = next;
      buildList();
    },
    updateFabric(spec: FabricSpec): void {
      currentFabric = spec;
      renderFabric();
    },
    setHover(pieceId: string | null): void {
      hoverId = pieceId;
      renderHover();
    },
    dispose(): void {
      unsubscribe();
      for (const { detach } of entries) detach();
      entries = [];
      // Remove only the card: the container is the viewport holder, shared
      // with the live canvas — unlike the panels, it must not be cleared.
      card.remove();
    },
  };
}
