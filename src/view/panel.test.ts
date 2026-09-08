import { describe, expect, it, vi } from 'vitest';
import { createStarterProject } from '../model';
import { NOTEBOOK_HOLDER_STARTER } from '../data/notebookHolder';
import { createPiecePanel } from './panel';
import { createSelectionStore } from './selection';

function setup() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const project = createStarterProject(NOTEBOOK_HOLDER_STARTER);
  const selection = createSelectionStore();
  const onPreset = vi.fn();
  const handle = createPiecePanel(container, project.pieces, selection, {
    onPreset,
  });
  return { container, project, selection, onPreset, handle };
}

describe('piece panel', () => {
  it('renders one button per piece with true-scale metadata', () => {
    const { container, project, handle } = setup();
    const buttons = container.querySelectorAll<HTMLButtonElement>('.piece-btn');
    expect(buttons).toHaveLength(project.pieces.length);

    const cover = buttons[0];
    expect(cover.querySelector('.piece-name')?.textContent).toBe('Outer cover');
    // Cover outline is 40 × 28 cm.
    expect(cover.querySelector('.piece-meta')?.textContent).toContain(
      '40.0 × 28.0 cm',
    );
    expect(cover.querySelector('.piece-meta')?.textContent).toContain('cut 1');

    handle.dispose();
    container.remove();
  });

  it('clicking a piece selects it and clicking again deselects', () => {
    const { container, selection, handle } = setup();
    const flap = container.querySelectorAll<HTMLButtonElement>('.piece-btn')[1];

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

  it('reflects selection changes that come from the viewport store', () => {
    const { container, selection, handle } = setup();
    const pocket =
      container.querySelectorAll<HTMLButtonElement>('.piece-btn')[2];

    selection.select('pocket');
    expect(pocket.classList.contains('selected')).toBe(true);

    selection.select(null);
    expect(pocket.classList.contains('selected')).toBe(false);

    handle.dispose();
    container.remove();
  });

  it('preset buttons report the chosen camera preset', () => {
    const { container, onPreset, handle } = setup();
    const presetButtons =
      container.querySelectorAll<HTMLButtonElement>('.preset-btn');

    (presetButtons[0] as HTMLButtonElement).click();
    expect(onPreset).toHaveBeenCalledWith('top');
    (presetButtons[1] as HTMLButtonElement).click();
    expect(onPreset).toHaveBeenCalledWith('three-d');

    handle.dispose();
    container.remove();
  });

  it('dispose clears listeners and DOM', () => {
    const { container, selection, handle } = setup();
    handle.dispose();
    expect(container.innerHTML).toBe('');
    // Store still works after dispose (viewport owns lifecycle).
    selection.select('cover');
    expect(selection.get()).toBe('cover');
    container.remove();
  });
});
