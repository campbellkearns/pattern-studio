/**
 * UX-07 glossary DOM layer: sewing terms render as small info chips, and a
 * dismissible popover opens the definition inline — the learner never leaves
 * the surface they are reading.
 *
 * The popover is fixed-positioned against the viewport (anchored to the
 * chip's screen rect) so one implementation serves the status bar, the
 * assembly bar, and the piece panel without ancestor-positioning
 * assumptions. Dismissal is Escape, an outside pointer-down, the close
 * button, or clicking the chip again. Escape is intercepted in the capture
 * phase so a popover open in assembly mode cannot also trigger the
 * exit-walkthrough shortcut: the chip is the dismissed affordance, the
 * shortcut would be an accidental mode change.
 */
import { annotateGlossary } from './glossary';
import type { GlossaryEntry } from './glossary';

export interface GlossaryPopoverHandle {
  /** Open the definition, anchored to the chip the user clicked. */
  open(anchor: HTMLElement, entry: GlossaryEntry, matched: string): void;
  close(): void;
  get isOpen(): boolean;
  dispose(): void;
}

const POPOVER_FALLBACK_WIDTH_PX = 340;
const VIEWPORT_MARGIN_PX = 8;

export function createGlossaryPopover(): GlossaryPopoverHandle {
  const popover = document.createElement('div');
  popover.className = 'glossary-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', 'Glossary definition');
  popover.hidden = true;
  document.body.appendChild(popover);

  const term = document.createElement('span');
  term.className = 'glossary-popover-term';
  const definition = document.createElement('span');
  definition.className = 'glossary-popover-definition';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'glossary-popover-close';
  closeButton.textContent = '✕';
  closeButton.setAttribute('aria-label', 'Close definition');
  popover.append(term, closeButton, definition);

  let anchor: HTMLElement | null = null;

  const positionPopover = (): void => {
    if (!anchor) return;
    const chipRect = anchor.getBoundingClientRect();
    const width = popover.offsetWidth || POPOVER_FALLBACK_WIDTH_PX;
    const left = Math.min(
      Math.max(chipRect.left, VIEWPORT_MARGIN_PX),
      Math.max(window.innerWidth - width - VIEWPORT_MARGIN_PX, VIEWPORT_MARGIN_PX),
    );
    popover.style.left = `${left}px`;
    popover.style.top = `${chipRect.bottom + 8}px`;
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || popover.hidden) return;
    event.stopPropagation();
    handle.close();
  };

  const onPointerDown = (event: Event): void => {
    if (popover.hidden) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (popover.contains(target)) return;
    // The opening chip's own click is a toggle, not an outside dismissal.
    if (anchor && anchor.contains(target)) return;
    handle.close();
  };

  // Capture phase (see module docs): Escape must outrank app-level shortcut
  // listeners regardless of which registered first.
  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  closeButton.addEventListener('click', () => handle.close());

  const handle: GlossaryPopoverHandle = {
    open(chip, entry) {
      if (anchor && anchor !== chip) anchor.setAttribute('aria-expanded', 'false');
      anchor = chip;
      term.textContent = entry.term;
      definition.textContent = entry.definition;
      popover.hidden = false;
      popover.style.left = '0px';
      popover.style.top = '0px';
      chip.setAttribute('aria-expanded', 'true');
      positionPopover();
    },
    close() {
      if (anchor) anchor.setAttribute('aria-expanded', 'false');
      anchor = null;
      popover.hidden = true;
    },
    get isOpen() {
      return !popover.hidden;
    },
    dispose() {
      document.removeEventListener('keydown', onKeydown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      anchor = null;
      popover.hidden = true; // honest state even if a caller inspects it
      popover.remove();
    },
  };
  return handle;
}

export interface AnnotatedTextOptions {
  /** Popover the chips open into. */
  readonly popover: GlossaryPopoverHandle;
  /** Terms already chipped on this surface — first-use suppression. */
  readonly seen?: ReadonlySet<string>;
}

/**
 * Render copy into `parent`, chipping first-use glossary terms with an ⓘ
 * affordance. All text lands as text nodes — copy is data, never HTML.
 */
export function renderAnnotatedText(
  parent: HTMLElement,
  text: string,
  options: AnnotatedTextOptions,
): void {
  for (const token of annotateGlossary(text, options.seen)) {
    if (token.kind === 'text') {
      parent.appendChild(document.createTextNode(token.value));
      continue;
    }
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'term-chip';
    chip.textContent = `${token.value} ⓘ`;
    chip.setAttribute('aria-expanded', 'false');
    chip.setAttribute(
      'aria-label',
      `What does “${token.match.entry.term}” mean?`,
    );
    chip.addEventListener('click', () => {
      if (
        options.popover.isOpen &&
        chip.getAttribute('aria-expanded') === 'true'
      ) {
        options.popover.close();
        return;
      }
      options.popover.open(chip, token.match.entry, token.value);
    });
    parent.appendChild(chip);
  }
}
