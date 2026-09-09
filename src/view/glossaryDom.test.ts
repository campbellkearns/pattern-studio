/**
 * UX-07 glossary DOM tests: the chip affordance and the dismissible
 * definition popover, exercised in jsdom. The popover is the "explains a
 * term inline on first use without leaving context" affordance — open from
 * a chip, dismissed by Escape, an outside pointer-down, the close button,
 * or clicking the chip again.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { GLOSSARY } from './glossary';
import { createGlossaryPopover, renderAnnotatedText } from './glossaryDom';

const SEAM = GLOSSARY.find((entry) => entry.term === 'seam')!;
const BASTE = GLOSSARY.find((entry) => entry.term === 'baste')!;

function setup() {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const popover = createGlossaryPopover();
  // createGlossaryPopover appends its card to document.body — grab the
  // instance itself so assertions can never read a stale popover.
  const card = document.body.lastElementChild as HTMLElement;
  return { parent, popover, card };
}

function chips(parent: HTMLElement): HTMLButtonElement[] {
  return [...parent.querySelectorAll<HTMLButtonElement>('.term-chip')];
}

// A failing assertion must not leak popovers (or their document-level
// listeners) into later tests.
afterEach(() => {
  document.body.replaceChildren();
});

describe('renderAnnotatedText', () => {
  it('renders text nodes plus a chip per first-use term', () => {
    const { parent, popover } = setup();
    renderAnnotatedText(parent, 'Baste the seam first.', { popover });
    expect(chips(parent)).toHaveLength(2); // baste + seam
    // Chips append an ⓘ affordance; stripping it and collapsing the extra
    // gaps must reconstruct the copy word for word.
    expect(parent.textContent!.replaceAll('ⓘ', '').replace(/\s+/g, ' ').trim()).toBe(
      'Baste the seam first.',
    );
    popover.dispose();
    parent.remove();
  });

  it('chips the matched text and names itself for assistive tech', () => {
    const { parent, popover } = setup();
    renderAnnotatedText(parent, 'Baste the pieces.', { popover });
    const chip = chips(parent)[0]!;
    expect(chip.textContent).toBe('Baste ⓘ');
    expect(chip.getAttribute('aria-label')).toBe('What does “baste” mean?');
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    popover.dispose();
    parent.remove();
  });

  it('chips only the first occurrence of a term in one render', () => {
    const { parent, popover } = setup();
    renderAnnotatedText(parent, 'Sew the seam, then press the seam open.', {
      popover,
    });
    expect(chips(parent).map((c) => c.getAttribute('aria-label'))).toEqual([
      'What does “seam” mean?',
      'What does “press” mean?',
    ]);
    popover.dispose();
    parent.remove();
  });
});

describe('glossary popover', () => {
  it('opens the definition from a chip without leaving context', () => {
    const { parent, popover, card } = setup();
    renderAnnotatedText(parent, 'Baste the seam first.', { popover });
    const [basteChip] = chips(parent);

    basteChip!.click();
    expect(card.hidden).toBe(false);
    expect(card.querySelector('.glossary-popover-term')?.textContent).toBe(
      BASTE.term,
    );
    expect(
      card.querySelector('.glossary-popover-definition')?.textContent,
    ).toBe(BASTE.definition);
    expect(basteChip!.getAttribute('aria-expanded')).toBe('true');
    popover.dispose();
    parent.remove();
  });

  it('clicking the same chip again dismisses (toggle)', () => {
    const { parent, popover, card } = setup();
    renderAnnotatedText(parent, 'Sew the seam.', { popover });
    const chip = chips(parent)[0]!;
    chip.click();
    expect(card.hidden).toBe(false);
    chip.click();
    expect(card.hidden).toBe(true);
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    popover.dispose();
    parent.remove();
  });

  it('Escape dismisses the open popover', () => {
    const { parent, popover, card } = setup();
    renderAnnotatedText(parent, 'Sew the seam.', { popover });
    chips(parent)[0]!.click();
    expect(card.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(card.hidden).toBe(true);
    popover.dispose();
    parent.remove();
  });

  it('an outside pointer-down dismisses; the opening chip does not', () => {
    const { parent, popover, card } = setup();
    renderAnnotatedText(parent, 'Baste the seam.', { popover });
    const [basteChip, seamChip] = chips(parent);
    basteChip!.click();
    expect(card.hidden).toBe(false);

    // Clicking the open chip routes through the toggle, but a raw
    // pointer-down on it must not count as "outside".
    basteChip!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(card.hidden).toBe(false);

    // A pointer-down on the other chip (or anywhere else) is outside.
    seamChip!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(card.hidden).toBe(true);
    popover.dispose();
    parent.remove();
  });

  it('switching chips moves the definition and resets the old chip', () => {
    const { parent, popover, card } = setup();
    renderAnnotatedText(parent, 'Baste the seam.', { popover });
    const [basteChip, seamChip] = chips(parent);
    basteChip!.click();
    seamChip!.click();
    expect(
      card.querySelector('.glossary-popover-term')?.textContent,
    ).toBe(SEAM.term);
    expect(basteChip!.getAttribute('aria-expanded')).toBe('false');
    expect(seamChip!.getAttribute('aria-expanded')).toBe('true');
    popover.dispose();
    parent.remove();
  });

  it('the close button dismisses', () => {
    const { parent, popover, card } = setup();
    renderAnnotatedText(parent, 'Sew the seam.', { popover });
    chips(parent)[0]!.click();
    card.querySelector<HTMLButtonElement>('.glossary-popover-close')!.click();
    expect(card.hidden).toBe(true);
    popover.dispose();
    parent.remove();
  });

  it('dispose removes the popover and stops reacting to Escape', () => {
    const { parent, popover, card } = setup();
    renderAnnotatedText(parent, 'Sew the seam.', { popover });
    chips(parent)[0]!.click();
    popover.dispose();
    expect(card.isConnected).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(card.isConnected).toBe(false); // stays disposed, no revival
    parent.remove();
  });
});
