import { describe, expect, it, vi } from 'vitest';
import { createStarterProject } from '../model';
import type { FabricSpec } from '../model';
import { NOTEBOOK_HOLDER_STARTER } from '../data/notebookHolder';
import {
  createMaterialsLegend,
  fabricSummary,
  swatchBackground,
} from './legend';
import { createSelectionStore } from './selection';

const SOLID: FabricSpec = {
  weave: 'plain',
  weaveScale: 0.12,
  color: '#7a8a6a',
  weight: 180,
};

const STRIPED: FabricSpec = {
  weave: 'twill',
  weaveScale: 0.24,
  color: '#7a8a6a',
  weight: 210,
  stripeCm: 0.4,
};

function setup(fabric: FabricSpec = SOLID) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const project = createStarterProject(NOTEBOOK_HOLDER_STARTER);
  const selection = createSelectionStore();
  const onEntryHover = vi.fn();
  const handle = createMaterialsLegend(
    container,
    project.pieces,
    fabric,
    selection,
    { onEntryHover },
  );
  return { container, project, selection, onEntryHover, handle };
}

function entries(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>('.legend-entry'),
  );
}

describe('materials legend', () => {
  it('renders one entry per piece with its name and fabric', () => {
    const { container, project, handle } = setup();
    const rows = entries(container);
    expect(rows).toHaveLength(project.pieces.length);

    const cover = rows[0];
    expect(cover.querySelector('.legend-name')?.textContent).toBe(
      'Outer cover',
    );
    expect(cover.querySelector('.legend-fabric')?.textContent).toBe(
      fabricSummary(SOLID),
    );

    handle.dispose();
    container.remove();
  });

  it('clicking an entry selects its piece and clicking again deselects', () => {
    const { container, selection, handle } = setup();
    const flap = entries(container)[1];

    flap.click();
    expect(selection.get()).toBe('flap');
    expect(flap.classList.contains('selected')).toBe(true);
    expect(flap.getAttribute('aria-pressed')).toBe('true');

    flap.click();
    expect(selection.get()).toBeNull();
    expect(flap.classList.contains('selected')).toBe(false);

    handle.dispose();
    container.remove();
  });

  it('reflects selections made in the viewport (bidirectional highlight)', () => {
    const { container, selection, handle } = setup();
    const pocket = entries(container)[2];

    selection.select('pocket');
    expect(pocket.classList.contains('selected')).toBe(true);
    expect(pocket.getAttribute('aria-pressed')).toBe('true');

    selection.select(null);
    expect(pocket.classList.contains('selected')).toBe(false);

    handle.dispose();
    container.remove();
  });

  it('scene-side hovers highlight the matching entry', () => {
    const { container, handle } = setup();
    const pocket = entries(container)[2];

    handle.setHover('pocket');
    expect(pocket.classList.contains('hover')).toBe(true);
    expect(entries(container)[0].classList.contains('hover')).toBe(false);

    handle.setHover(null);
    expect(pocket.classList.contains('hover')).toBe(false);

    handle.dispose();
    container.remove();
  });

  it('entry hover and focus report the piece to the scene, leaving clears it', () => {
    const { container, onEntryHover, handle } = setup();
    const cover = entries(container)[0];
    const button = entries(container)[1];

    cover.dispatchEvent(new MouseEvent('mouseenter'));
    expect(onEntryHover).toHaveBeenLastCalledWith('cover');

    cover.dispatchEvent(new MouseEvent('mouseleave'));
    expect(onEntryHover).toHaveBeenLastCalledWith(null);

    // Keyboard parity: focus is hover.
    button.focus();
    expect(onEntryHover).toHaveBeenLastCalledWith('flap');
    button.blur();
    expect(onEntryHover).toHaveBeenLastCalledWith(null);

    handle.dispose();
    container.remove();
  });

  it('updatePieces rebuilds the list and keeps the selection applied', () => {
    const { container, project, selection, handle } = setup();
    selection.select('flap');

    handle.updatePieces(project.pieces.slice(0, 2));
    const rows = entries(container);
    expect(rows).toHaveLength(2);
    expect(rows[1].classList.contains('selected')).toBe(true);

    handle.updatePieces(project.pieces);
    expect(entries(container)).toHaveLength(project.pieces.length);

    handle.dispose();
    container.remove();
  });

  it('updateFabric re-skins every swatch and summary live', () => {
    const { container, handle } = setup();
    const summary = fabricSummary(STRIPED);

    handle.updateFabric(STRIPED);
    for (const row of entries(container)) {
      expect(row.querySelector('.legend-fabric')?.textContent).toBe(summary);
      expect(
        (row.querySelector('.legend-swatch') as HTMLElement).style.background,
      ).toContain('repeating-linear-gradient');
    }

    handle.dispose();
    container.remove();
  });

  it('hides the card for a zero-piece project and recovers after redraft', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const project = createStarterProject(NOTEBOOK_HOLDER_STARTER);
    const selection = createSelectionStore();
    const handle = createMaterialsLegend(container, [], SOLID, selection, {
      onEntryHover: vi.fn(),
    });

    const card = container.querySelector('.materials-legend') as HTMLElement;
    expect(card.hidden).toBe(true);

    handle.updatePieces(project.pieces);
    expect(card.hidden).toBe(false);

    handle.dispose();
    container.remove();
  });

  it('dispose removes the card and listeners but not the shared container', () => {
    const { container, selection, handle } = setup();
    handle.dispose();
    // The legend shares the viewport holder with the live canvas: only its
    // own card may go, never the container's other children.
    expect(container.querySelector('.materials-legend')).toBeNull();
    selection.select('cover');
    expect(selection.get()).toBe('cover');
    container.remove();
  });
});

describe('fabricSummary', () => {
  it('names the weave and weight', () => {
    expect(fabricSummary(SOLID)).toBe('Plain · 180 gsm');
  });

  it('appends the stripe width when the fabric is striped', () => {
    expect(fabricSummary(STRIPED)).toBe(
      'Twill · 210 gsm · 0.4 cm warp stripes',
    );
  });
});

describe('swatchBackground', () => {
  it('paints solid fabrics with their colour', () => {
    expect(swatchBackground(SOLID)).toBe('rgb(122, 138, 106)');
  });

  it('paints striped fabrics with base and stripe bands', () => {
    const background = swatchBackground(STRIPED);
    expect(background).toContain('repeating-linear-gradient(90deg');
    // Both the base colour and the 0.55 stripe shade appear.
    expect(background).toContain('rgb(122, 138, 106)');
    expect(background).toContain('rgb(67, 76, 58)');
  });
});
