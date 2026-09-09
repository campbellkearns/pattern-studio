/**
 * Assembly-mode controls: the scrubber, seam stepping, and step narration.
 *
 * Pure DOM (no WebGL), so the interaction contract is unit-tested in jsdom:
 * the slider value v in [0, stepCount] is the single source of truth —
 * stepIndex = min(floor(v), stepCount - 1), t = v - floor(v) — and the
 * Previous/Next buttons move v between seam boundaries one seam at a time.
 * When v reaches stepCount the fold sequence is complete and the learn
 * card appears (the blueprint's "assembly completes" state).
 *
 * UX-01 motion rework: button steps TWEEN v to the target boundary (durations
 * from the motion spec, per seam type and direction) instead of jumping, so
 * the fold plays continuously and Previous retraces it in reverse. The tween
 * is interruptible — a click mid-tween retargets from the current value, and
 * a manual scrub cancels it outright. Under prefers-reduced-motion the tween
 * collapses to zero duration: steps land instantly on the legible boundary
 * frame. The fold itself renders through the pure pose function; this module
 * only moves the timeline value.
 */
import { createGlossaryPopover, renderAnnotatedText } from './glossaryDom';
import type { FrameScheduler } from './walkthroughMotion';
import {
  easedProgress01,
  foldDurationMs,
  prefersReducedMotion,
  rafFrameScheduler,
} from './walkthroughMotion';

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
  /**
   * UX-01: fold duration for a button step, in milliseconds — the caller
   * maps stepIndex to the motion spec (curved seams get more time). Defaults
   * to the straight-seam row; reduced motion overrides any duration to 0.
   */
  readonly stepDurationMs?: (stepIndex: number, forward: boolean) => number;
  /**
   * UX-01: fired once when a button step begins, with the seam about to
   * fold and the direction — the camera's pre-frame cue.
   */
  readonly onStepBegin?: (stepIndex: number, forward: boolean) => void;
  /** Clock + frame source; tests inject a manual pump. */
  readonly scheduler?: FrameScheduler;
  /** Reduced-motion gate; tests inject a stub. Defaults to the media query. */
  readonly reducedMotion?: () => boolean;
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

  // UX-07 glossary: one popover serves the counter, notes, and learn card.
  // Close it when the labels it may be anchored to are rebuilt.
  const popover = createGlossaryPopover();

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
  renderAnnotatedText(learnCard, options.learnCard, { popover });

  bar.append(heading, counter, slider, buttonsRow, note, learnCard, exitButton);
  container.appendChild(bar);

  let value = 0;
  let disposed = false;

  // Chip DOM is rebuilt only when the visible step (or its completion)
  // changes — tween frames re-render ~60×/s and must not churn it.
  let renderedLabelKey: string | null = null;

  // --- Value tween (UX-01): button steps glide v to the target boundary ----
  const scheduler: FrameScheduler = options.scheduler ?? rafFrameScheduler;
  const reducedMotion = options.reducedMotion ?? prefersReducedMotion;
  let tween: {
    from: number;
    to: number;
    startMs: number;
    durationMs: number;
  } | null = null;

  const stopTween = (): void => {
    tween = null;
  };

  const tick = (): void => {
    if (!tween || disposed) return;
    const progress = easedProgress01(
      scheduler.nowMs() - tween.startMs,
      tween.durationMs,
    );
    value = tween.from + (tween.to - tween.from) * progress;
    render();
    if (progress >= 1) {
      tween = null;
      return;
    }
    scheduler.nextFrame(tick);
  };

  /** Glide v to an adjacent boundary; duration 0 (reduced motion) lands now. */
  const stepValue = (to: number): void => {
    const target = clamp(to, 0, stepCount);
    if (disposed || stepCount === 0 || target === value) return;
    const forward = target > value;
    // The seam this step folds (or un-folds): the lower of the two boundaries.
    const stepIndex = Math.min(
      Math.floor(Math.min(value, target)),
      stepCount - 1,
    );
    options.onStepBegin?.(stepIndex, forward);
    const durationMs = reducedMotion()
      ? 0
      : (options.stepDurationMs ?? ((_index: number, isForward: boolean) =>
          foldDurationMs(isForward, false)))(stepIndex, forward);
    if (durationMs <= 0) {
      stopTween();
      value = target;
      render();
      return;
    }
    tween = { from: value, to: target, startMs: scheduler.nowMs(), durationMs };
    scheduler.nextFrame(tick);
  };

  const render = (): void => {
    const state = scrubStateFromValue(value, stepCount);
    slider.value = String(value);
    if (stepCount === 0) {
      if (renderedLabelKey !== 'empty') {
        renderedLabelKey = 'empty';
        counter.textContent = 'No seams to assemble';
        note.textContent = 'This project has no assembly steps yet.';
      }
      prevButton.disabled = true;
      nextButton.disabled = true;
      slider.disabled = true;
      return;
    }
    const label = options.labels[state.stepIndex]!;
    const completed = state.stepIndex === stepCount - 1 && state.t === 1;
    const labelKey = `${state.stepIndex}:${completed}`;
    if (labelKey !== renderedLabelKey) {
      renderedLabelKey = labelKey;
      popover.close();
      counter.replaceChildren();
      renderAnnotatedText(
        counter,
        `Seam ${state.stepIndex + 1} of ${stepCount} — ${label.title}`,
        { popover },
      );
      note.replaceChildren();
      renderAnnotatedText(note, label.note, { popover });
    }
    learnCard.hidden = !completed;
    prevButton.disabled = value <= 0;
    nextButton.disabled = value >= stepCount;
    options.onScrub(state);
  };

  slider.addEventListener('input', () => {
    if (disposed) return;
    // Manual scrub outranks the animation: a drag cancels the tween.
    stopTween();
    value = Number(slider.value);
    render();
  });

  prevButton.addEventListener('click', () => {
    // Back one seam boundary: 2.0 → 1.0, 1.5 → 1.0 (finish un-folding) —
    // tweened, so the un-fold plays in reverse continuously (UX-01).
    if (disposed) return;
    stepValue(Math.ceil(value - 1));
  });

  nextButton.addEventListener('click', () => {
    // Forward one seam boundary: 1.5 → 2.0 (finish the fold), 2.0 → 3.0 —
    // tweened through the fold instead of snapping to it (UX-01).
    if (disposed) return;
    stepValue(Math.floor(value) + 1);
  });

  exitButton.addEventListener('click', () => {
    if (!disposed) options.onExit();
  });

  render();

  return {
    setValue(next) {
      if (disposed) return;
      // Programmatic jumps are instant and cancel any in-flight tween.
      stopTween();
      value = clamp(next, 0, stepCount);
      render();
    },
    get state() {
      return scrubStateFromValue(value, stepCount);
    },
    dispose() {
      disposed = true;
      popover.dispose();
      bar.remove();
    },
  };
}
