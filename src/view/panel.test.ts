import { describe, expect, it, vi } from 'vitest';
import { createStarterProject } from '../model';
import { NOTEBOOK_HOLDER_STARTER } from '../data/notebookHolder';
import { TOTE_STARTER } from '../data/tote';
import { createPiecePanel } from './panel';
import { createSelectionStore } from './selection';

function setup() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const project = createStarterProject(NOTEBOOK_HOLDER_STARTER);
  const selection = createSelectionStore();
  const onPreset = vi.fn();
  const handle = createPiecePanel(
    container,
    project.pieces,
    project.assembly,
    selection,
    {
      onPreset,
    },
  );
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

  it('shows the empty state for a zero-piece project, then recovers', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const selection = createSelectionStore();
    const handle = createPiecePanel(container, [], [], selection, {
      onPreset: vi.fn(),
    });

    // A validated project may carry zero pieces (a hand-edited import):
    // the panel must say so instead of rendering a blank list.
    const empty = container.querySelector('.panel-empty');
    expect(empty?.textContent).toContain('No pieces on the mat');
    expect((empty as HTMLElement | null)?.hidden).toBe(false);
    expect(
      (container.querySelector('.piece-list') as HTMLElement | null)?.hidden,
    ).toBe(true);

    // Redrafting pieces back onto the mat hides the note again.
    const project = createStarterProject(NOTEBOOK_HOLDER_STARTER);
    handle.updatePieces(project.pieces);
    expect((empty as HTMLElement | null)?.hidden).toBe(true);
    expect(
      (container.querySelector('.piece-list') as HTMLElement | null)?.hidden,
    ).toBe(false);

    handle.dispose();
    container.remove();
  });

  it('names the assembly seams inline (UX-07) so the build order is legible before Assemble', () => {
    const { container, project, handle } = setup();
    const seams = container.querySelector<HTMLElement>('.panel-seams')!;
    expect(seams.hidden).toBe(false);
    const firstName = project.assembly[0]!.name!;
    const secondName = project.assembly[1]!.name!;
    // The ⓘ affordance lands inside the sentence; read the plain text.
    const plain = seams.textContent!.replaceAll('ⓘ', '').replace(/\s+/g, ' ');
    expect(plain).toContain(`Assembly — 2 seams`);
    expect(plain).toContain(`${firstName}, ${secondName}.`);
    handle.dispose();
    container.remove();
  });

  it('falls back to joined piece names for seams predating UX-07 naming', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const project = createStarterProject(NOTEBOOK_HOLDER_STARTER);
    const anonymous = project.assembly.map((step) => ({ ...step, name: undefined }));
    const selection = createSelectionStore();
    const handle = createPiecePanel(
      container,
      project.pieces,
      anonymous,
      selection,
      { onPreset: vi.fn() },
    );
    const seams = container.querySelector<HTMLElement>('.panel-seams')!;
    expect(seams.textContent).toContain(
      'Flap → Outer cover',
    );
    handle.dispose();
    container.remove();
  });

  it('hides the seams line when the project has no assembly', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const selection = createSelectionStore();
    const handle = createPiecePanel(
      container,
      [],
      [],
      selection,
      { onPreset: vi.fn() },
    );
    const seams = container.querySelector<HTMLElement>('.panel-seams')!;
    expect(seams.hidden).toBe(true);
    expect(seams.textContent).toBe('');
    handle.dispose();
    container.remove();
  });

  it('chips the cut-count shorthand and opens its definition inline (UX-07)', () => {
    const { container, handle } = setup();
    const meta = container.querySelector<HTMLElement>('.piece-meta')!;
    const chip = meta.querySelector<HTMLButtonElement>('.term-chip')!;
    expect(chip.textContent).toContain('cut 1');
    chip.click();
    const card = document.body.lastElementChild as HTMLElement;
    expect(card.hidden).toBe(false);
    expect(card.querySelector('.glossary-popover-term')?.textContent).toBe(
      'cut count',
    );
    handle.dispose();
    container.remove();
  });

  it('shows glossary chips for the tote’s facing and raw edge (UX-07 surfaces)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const project = createStarterProject(TOTE_STARTER);
    const selection = createSelectionStore();
    const handle = createPiecePanel(
      container,
      project.pieces,
      project.assembly,
      selection,
      { onPreset: vi.fn() },
    );
    const seams = container.querySelector<HTMLElement>('.panel-seams')!;
    const labels = [...seams.querySelectorAll('.term-chip')].map((chip) =>
      chip.getAttribute('aria-label'),
    );
    expect(labels).toContain('What does “facing” mean?');
    handle.dispose();
    container.remove();
  });
});
