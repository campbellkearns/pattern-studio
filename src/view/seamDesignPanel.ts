/**
 * Seam design panel (UX-12): per-seam stitch and thread-colour pickers for
 * the seam being folded, cloned from the fabric panel's segmented-button
 * pattern — same group markup and classes, same revalidate-through-the-
 * model-factory emission, same 44 px touch targets. The pickers always
 * target the ACTIVE seam: app.ts retargets them as the scrubber moves, and
 * every emission is rebuilt by createSeamStep, so the panel can never emit
 * an invalid seam step (unknown stitch, non-hex colour).
 */
import {
  createSeamStep,
  STITCH_TYPES,
  type SeamStep,
  type StitchType,
} from '../model';
import { DEFAULT_STITCH } from './stitchGlyph';

export interface SeamDesignCallbacks {
  /** Emitted with the revalidated, frozen step after a picker change. */
  onSeamDesignChange(step: SeamStep): void;
}

export interface SeamDesignPanelHandle {
  /**
   * Point the pickers at another seam (or an updated version of the
   * current one). Renders the step's design without emitting.
   */
  setStep(stepIndex: number, step: SeamStep): void;
  /** Index of the seam the pickers currently target. */
  get stepIndex(): number;
  dispose(): void;
}

/** Curated buttons derived from the model's STITCH_TYPES, so a future
 * stitch type can't be missed by the UI. */
const STITCH_LABELS: ReadonlyArray<{ value: StitchType; label: string }> =
  STITCH_TYPES.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  }));

/** The color input needs the full 6-digit form. */
function expandHex(color: string): string {
  if (color.length === 4) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
  }
  return color;
}

export function createSeamDesignPanel(
  container: HTMLElement,
  initialStepIndex: number,
  initialStep: SeamStep,
  callbacks: SeamDesignCallbacks,
): SeamDesignPanelHandle {
  container.innerHTML = '';
  let stepIndex = initialStepIndex;
  let step = initialStep;
  const renderers: (() => void)[] = [];

  const heading = document.createElement('h2');
  heading.className = 'assembly-design-heading';
  heading.textContent = 'Seam design';
  container.appendChild(heading);

  /** A labelled group of toggle buttons sharing one selection — the
   * fabric panel's segmented pattern, verbatim markup and classes. */
  function segmented(
    label: string,
    options: ReadonlyArray<{ value: StitchType; label: string }>,
    isSelected: (value: StitchType) => boolean,
    onSelect: (value: StitchType) => void,
  ): void {
    const group = document.createElement('div');
    group.className = 'fabric-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);

    const caption = document.createElement('span');
    caption.className = 'fabric-label';
    caption.textContent = label;
    group.appendChild(caption);

    const row = document.createElement('div');
    row.className = 'fabric-options';
    const buttons: { button: HTMLButtonElement; value: StitchType }[] = [];
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fabric-btn';
      button.textContent = option.label;
      const onClick = (): void => onSelect(option.value);
      button.addEventListener('click', onClick);
      row.appendChild(button);
      buttons.push({ button, value: option.value });
    }
    group.appendChild(row);
    container.appendChild(group);

    renderers.push(() => {
      for (const { button, value } of buttons) {
        const selected = isSelected(value);
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      }
    });
  }

  /** Revalidate the merged step through the model factory; frozen result. */
  function emit(design: { stitch?: StitchType; threadColor?: string }): void {
    const next = createSeamStep({
      pieces: [...step.pieces],
      edges: [{ ...step.edges[0] }, { ...step.edges[1] }],
      order: step.order,
      note: step.note,
      name: step.name,
      ease: step.ease,
      stitch: design.stitch ?? step.stitch,
      threadColor: design.threadColor ?? step.threadColor,
    });
    step = next;
    renderAll();
    callbacks.onSeamDesignChange(next);
  }

  // An undesigned seam renders as the default stitch, so the picker shows
  // the effective selection, not the raw (absent) field.
  segmented(
    'Stitch',
    STITCH_LABELS,
    (value) => (step.stitch ?? DEFAULT_STITCH) === value,
    (value) => emit({ stitch: value }),
  );

  const colorGroup = document.createElement('div');
  colorGroup.className = 'fabric-group';
  colorGroup.setAttribute('role', 'group');
  colorGroup.setAttribute('aria-label', 'Thread colour');
  const colorCaption = document.createElement('span');
  colorCaption.className = 'fabric-label';
  colorCaption.textContent = 'Thread colour';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'fabric-color';
  colorInput.setAttribute('aria-label', 'Thread colour');
  const onColor = (): void => emit({ threadColor: colorInput.value });
  colorInput.addEventListener('input', onColor);
  colorGroup.append(colorCaption, colorInput);
  container.appendChild(colorGroup);

  function renderAll(): void {
    for (const render of renderers) render();
    // An undesigned seam shows the color input's neutral black; the scene
    // keeps drawing the token's default tint until a colour is picked.
    colorInput.value = expandHex(step.threadColor ?? '#000000');
  }

  renderAll();

  return {
    setStep(nextIndex, nextStep) {
      // Scrub tweens re-fire the active seam ~60x/s; skip identical renders.
      if (nextIndex === stepIndex && nextStep === step) return;
      stepIndex = nextIndex;
      step = nextStep;
      renderAll();
    },
    get stepIndex() {
      return stepIndex;
    },
    dispose(): void {
      colorInput.removeEventListener('input', onColor);
      container.innerHTML = '';
    },
  };
}
