/**
 * Assembly-mode controls: the scrubber, seam stepping, and step narration.
 *
 * Pure DOM (no WebGL), so the interaction contract is unit-tested in jsdom:
 * the slider value v in [0, stepCount] is the single source of truth —
 * stepIndex = min(floor(v), stepCount - 1), t = v - floor(v) — and the
 * Previous/Next buttons move v between seam boundaries one seam at a time.
 * When v reaches stepCount the fold sequence is complete and the learn
 * card appears (the blueprint's "assembly completes" state).
 */

export interface AssemblyStepLabel {
  /** e.g. "Flap → Outer cover". */
  readonly title: string;
  /** The seam's "why" for the learner. */
  readonly note: string;
}

export interface AssemblyScrubState {
  /** Index of the seam currently being folded (0-based). */
  readonly stepIndex: number;
  /** Fold progress of the current seam: 0 = flat, 1 = folded. */
  readonly t: number;
}

export interface AssemblyControlsOptions {
  readonly labels: readonly AssemblyStepLabel[];
  /** Shown when the sequence completes (v = stepCount). */
  readonly learnCard: string;
  /** Called on every scrub/step change with the derived state. */
  onScrub(state: AssemblyScrubState): void;
  /** Called by the "Back to cutting mat" button. */
  onExit(): void;
}

export interface AssemblyControlsHandle {
  /** Set the slider to a value in [0, stepCount] and re-render labels. */
  setValue(value: number): void;
  /** Current derived state. */
  get state(): AssemblyScrubState;
  dispose(): void;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Slider value → (stepIndex, t).
 *
 * Boundary convention: v = k (k < N) means seam k is pending (t = 0) —
 * visually identical to seam k-1 fully folded, so either reading renders
 * the same poses. v = N means every fold is complete: the last seam at
 * t = 1, which is what shows the learn card.
 */
export function scrubStateFromValue(
  value: number,
  stepCount: number,
): AssemblyScrubState {
  const v = clamp(value, 0, stepCount);
  if (stepCount === 0) return { stepIndex: 0, t: 0 };
  const stepIndex = Math.min(Math.floor(v), stepCount - 1);
  const t = v >= stepCount ? 1 : clamp(v - Math.floor(v), 0, 1);
  return { stepIndex, t };
}

export function createAssemblyControls(
  container: HTMLElement,
  options: AssemblyControlsOptions,
): AssemblyControlsHandle {
  const stepCount = options.labels.length;

  const bar = document.createElement('div');
  bar.className = 'assembly-bar';

  const exitButton = document.createElement('button');
  exitButton.type = 'button';
  exitButton.className = 'assembly-btn assembly-exit';
  exitButton.textContent = '← Cutting mat';

  const heading = document.createElement('h2');
  heading.className = 'assembly-heading';
  heading.textContent = 'Assembly';

  const counter = document.createElement('div');
  counter.className = 'assembly-counter';
  counter.setAttribute('role', 'status');

  const note = document.createElement('p');
  note.className = 'assembly-note';

  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.className = 'assembly-btn';
  prevButton.textContent = '◀ Previous seam';

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'assembly-btn';
  nextButton.textContent = 'Next seam ▶';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'assembly-scrubber';
  slider.min = '0';
  slider.max = String(Math.max(stepCount, 1));
  slider.step = '0.01';
  slider.value = '0';
  // Tablet-first: a thumb big enough to grab with a fingertip.
  slider.setAttribute('aria-label', 'Fold progress scrubber');
  slider.setAttribute('aria-valuemin', '0');
  slider.setAttribute('aria-valuemax', String(Math.max(stepCount, 1)));

  const buttonsRow = document.createElement('div');
  buttonsRow.className = 'assembly-buttons';
  buttonsRow.append(prevButton, nextButton);

  const learnCard = document.createElement('p');
  learnCard.className = 'assembly-learn-card';
  learnCard.hidden = true;
  learnCard.textContent = options.learnCard;

  bar.append(heading, counter, slider, buttonsRow, note, learnCard, exitButton);
  container.appendChild(bar);

  let value = 0;
  let disposed = false;

  const render = (): void => {
    const state = scrubStateFromValue(value, stepCount);
    slider.value = String(value);
    if (stepCount === 0) {
      counter.textContent = 'No seams to assemble';
      note.textContent = 'This project has no assembly steps yet.';
      prevButton.disabled = true;
      nextButton.disabled = true;
      slider.disabled = true;
      return;
    }
    const label = options.labels[state.stepIndex]!;
    counter.textContent = `Seam ${state.stepIndex + 1} of ${stepCount} — ${label.title}`;
    note.textContent = label.note;
    learnCard.hidden = !(state.stepIndex === stepCount - 1 && state.t === 1);
    prevButton.disabled = value <= 0;
    nextButton.disabled = value >= stepCount;
    options.onScrub(state);
  };

  slider.addEventListener('input', () => {
    if (disposed) return;
    value = Number(slider.value);
    render();
  });

  prevButton.addEventListener('click', () => {
    if (disposed) return;
    // Back one seam boundary: 2.0 → 1.0, 1.5 → 1.0 (finish un-folding).
    value = clamp(Math.ceil(value - 1), 0, stepCount);
    render();
  });

  nextButton.addEventListener('click', () => {
    if (disposed) return;
    // Forward one seam boundary: 1.5 → 2.0 (finish the fold), 2.0 → 3.0.
    value = clamp(Math.floor(value) + 1, 0, stepCount);
    render();
  });

  exitButton.addEventListener('click', () => {
    if (!disposed) options.onExit();
  });

  render();

  return {
    setValue(next) {
      if (disposed) return;
      value = clamp(next, 0, stepCount);
      render();
    },
    get state() {
      return scrubStateFromValue(value, stepCount);
    },
    dispose() {
      disposed = true;
      bar.remove();
    },
  };
}
