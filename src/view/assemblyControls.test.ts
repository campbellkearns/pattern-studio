/**
 * Assembly-controls interaction contract, unit-tested in jsdom: the slider
 * is the single source of truth, the step buttons move one seam at a time,
 * labels narrate the current seam, and the learn card appears only when
 * every fold is complete. UX-01: button steps TWEEN the value to the target
 * boundary (spec easing and durations), so these tests pump a manual frame
 * scheduler — clicks start a glide, advance() plays it deterministically.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createAssemblyControls,
  scrubStateFromValue,
} from './assemblyControls';
import type { AssemblyScrubState } from './assemblyControls';
import type { FrameScheduler } from './walkthroughMotion';
import { FOLD_MS } from './walkthroughMotion';

/** Deterministic frame clock: 16 ms frames, advanced in steps to a target. */
function createTestScheduler() {
  let clockMs = 0;
  const pending = new Set<(nowMs: number) => void>();
  const scheduler: FrameScheduler = {
    nowMs: () => clockMs,
    nextFrame: (callback) => {
      pending.add(callback);
    },
  };
  const advance = (ms: number): void => {
    const target = clockMs + ms;
    while (clockMs < target) {
      clockMs = Math.min(target, clockMs + 16);
      const callbacks = [...pending];
      pending.clear();
      for (const callback of callbacks) callback(clockMs);
    }
  };
  return { scheduler, advance };
}

function mount(
  stepCount = 2,
  options: { reducedMotion?: boolean; durationMs?: number } = {},
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const states: AssemblyScrubState[] = [];
  const stepsBegun: Array<{ stepIndex: number; forward: boolean }> = [];
  const onExit = vi.fn();
  const clock = createTestScheduler();
  const handle = createAssemblyControls(container, {
    labels: Array.from({ length: stepCount }, (_, i) => ({
      title: `Seam ${i + 1} title`,
      note: `Seam ${i + 1} note`,
    })),
    learnCard: 'You assembled it!',
    onScrub: (state) => states.push(state),
    onExit,
    scheduler: clock.scheduler,
    reducedMotion: () => options.reducedMotion ?? false,
    stepDurationMs: options.durationMs
      ? () => options.durationMs!
      : (_stepIndex, forward) =>
          forward ? FOLD_MS.straightForward : FOLD_MS.straightReverse,
    onStepBegin: (stepIndex, forward) =>
      stepsBegun.push({ stepIndex, forward }),
  });
  const slider = container.querySelector(
    '.assembly-scrubber',
  ) as HTMLInputElement;
  const prev = container.querySelector(
    '.assembly-buttons button:first-child',
  ) as HTMLButtonElement;
  const next = container.querySelector(
    '.assembly-buttons button:last-child',
  ) as HTMLButtonElement;
  const counter = container.querySelector(
    '.assembly-counter',
  ) as HTMLElement;
  const note = container.querySelector('.assembly-note') as HTMLElement;
  const learnCard = container.querySelector(
    '.assembly-learn-card',
  ) as HTMLElement;
  const exit = container.querySelector('.assembly-exit') as HTMLButtonElement;
  return {
    container,
    handle,
    slider,
    prev,
    next,
    counter,
    note,
    learnCard,
    exit,
    onExit,
    states,
    stepsBegun,
    clock,
  };
}

describe('scrubStateFromValue', () => {
  it('derives (stepIndex, t) from the slider value', () => {
    expect(scrubStateFromValue(0, 2)).toEqual({ stepIndex: 0, t: 0 });
    expect(scrubStateFromValue(0.5, 2)).toEqual({ stepIndex: 0, t: 0.5 });
    expect(scrubStateFromValue(1, 2)).toEqual({ stepIndex: 1, t: 0 });
    expect(scrubStateFromValue(1.75, 2)).toEqual({ stepIndex: 1, t: 0.75 });
    // Fully folded: v == N means the LAST step at t = 1.
    expect(scrubStateFromValue(2, 2)).toEqual({ stepIndex: 1, t: 1 });
  });

  it('clamps out-of-range values', () => {
    expect(scrubStateFromValue(-3, 2)).toEqual({ stepIndex: 0, t: 0 });
    expect(scrubStateFromValue(9, 2)).toEqual({ stepIndex: 1, t: 1 });
  });

  it('handles a project with no seams', () => {
    expect(scrubStateFromValue(0, 0)).toEqual({ stepIndex: 0, t: 0 });
  });
});

describe('assembly controls', () => {
  it('renders the first seam label on mount and emits its state', () => {
    const ui = mount();
    expect(ui.counter.textContent).toContain('Seam 1 of 2');
    expect(ui.counter.textContent).toContain('Seam 1 title');
    expect(ui.note.textContent).toBe('Seam 1 note');
    expect(ui.states[0]).toEqual({ stepIndex: 0, t: 0 });
    expect(ui.prev.disabled).toBe(true);
  });

  it('scrubs t through the slider input event', () => {
    const ui = mount();
    ui.slider.value = '0.5';
    ui.slider.dispatchEvent(new Event('input'));
    expect(ui.handle.state).toEqual({ stepIndex: 0, t: 0.5 });
    // Mid-fold: not complete yet.
    expect(ui.learnCard.hidden).toBe(true);
  });

  it('steps forward one seam at a time, tweening through the fold', () => {
    const ui = mount();
    ui.next.click();
    // Mid-tween the fold is in progress (eased quarter: 4·(0.25)³ = 0.0625).
    ui.clock.advance(FOLD_MS.straightForward / 4);
    expect(ui.handle.state).toEqual({ stepIndex: 0, t: 0.0625 });
    expect(ui.counter.textContent).toContain('Seam 1 of 2');
    ui.clock.advance(FOLD_MS.straightForward);
    expect(ui.handle.state).toEqual({ stepIndex: 1, t: 0 });
    expect(ui.counter.textContent).toContain('Seam 2 of 2');
    ui.next.click();
    ui.clock.advance(FOLD_MS.straightForward);
    expect(ui.handle.state).toEqual({ stepIndex: 1, t: 1 });
    expect(ui.next.disabled).toBe(true);
  });

  it('steps backward one seam at a time, retracing the fold in reverse', () => {
    const ui = mount();
    ui.handle.setValue(2);
    ui.prev.click();
    // Mid-unfold: the same eased curve mirrored.
    ui.clock.advance(FOLD_MS.straightReverse / 2);
    expect(ui.handle.state.stepIndex).toBe(1);
    expect(ui.handle.state.t).toBeCloseTo(0.5, 9);
    ui.clock.advance(FOLD_MS.straightReverse);
    // Landed on the last seam's start (visually identical to seam 1 folded,
    // seam 2 open).
    expect(ui.handle.state).toEqual({ stepIndex: 1, t: 0 });
    ui.prev.click();
    ui.clock.advance(FOLD_MS.straightReverse);
    expect(ui.handle.state).toEqual({ stepIndex: 0, t: 0 });
    expect(ui.prev.disabled).toBe(true);
  });

  it('reversal retraces the forward path (Prev undoes Next exactly)', () => {
    // With reverse duration pinned to the forward duration, unfolding the
    // same seam must retrace the folded value path exactly, mirrored.
    const ui = mount(2, { durationMs: 700 });
    const valueOf = (state: AssemblyScrubState): number =>
      state.stepIndex + state.t;
    // Fold seam 1 forward, sampling the value through the tween.
    const forward: number[] = [];
    ui.next.click();
    for (let i = 0; i < 14; i++) {
      ui.clock.advance(50);
      forward.push(valueOf(ui.handle.state));
    }
    expect(forward[forward.length - 1]).toBe(1);
    // Un-fold the same seam again: from v=1, Prev tweens back to v=0.
    const reverse: number[] = [];
    ui.prev.click();
    for (let i = 0; i < 14; i++) {
      ui.clock.advance(50);
      reverse.push(valueOf(ui.handle.state));
    }
    expect(reverse[reverse.length - 1]).toBe(0);
    // Mirror: reverse[k] === 1 - forward[k] for every sample.
    for (let k = 0; k < forward.length; k++) {
      expect(reverse[k]).toBeCloseTo(1 - forward[k]!, 9);
    }
    // And the traversal stays within the one boundary being crossed.
    expect(forward.every((v) => v > 0 && v <= 1)).toBe(true);
    expect(reverse.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('a mid-tween click retargets from the current value (no queuing)', () => {
    const ui = mount();
    ui.next.click();
    ui.clock.advance(FOLD_MS.straightForward / 2);
    ui.next.click(); // mid-fold: retargets to finish THIS fold (v → 1)
    ui.clock.advance(FOLD_MS.straightForward * 2);
    expect(ui.handle.state).toEqual({ stepIndex: 1, t: 0 });
    expect(ui.slider.value).toBe('1');
    // A third click from the landed boundary moves to the next one.
    ui.next.click();
    ui.clock.advance(FOLD_MS.straightForward);
    expect(ui.handle.state).toEqual({ stepIndex: 1, t: 1 });
  });

  it('a manual scrub cancels the in-flight tween', () => {
    const ui = mount();
    ui.next.click();
    ui.clock.advance(FOLD_MS.straightForward / 4);
    ui.slider.value = '0.2';
    ui.slider.dispatchEvent(new Event('input'));
    ui.clock.advance(FOLD_MS.straightForward * 2);
    expect(ui.handle.state).toEqual({ stepIndex: 0, t: 0.2 });
  });

  it('reduced motion lands instantly on the legible boundary frame', () => {
    const ui = mount(2, { reducedMotion: true });
    ui.next.click();
    // No frames pumped: the step has already landed, no mid-fold limbo.
    expect(ui.handle.state).toEqual({ stepIndex: 1, t: 0 });
    ui.prev.click();
    expect(ui.handle.state).toEqual({ stepIndex: 0, t: 0 });
  });

  it('announces each step begin with the seam about to fold', () => {
    const ui = mount();
    ui.next.click(); // folds seam 0 (0 → 1)
    ui.clock.advance(FOLD_MS.straightForward);
    ui.next.click(); // folds seam 1 (1 → 2)
    ui.clock.advance(FOLD_MS.straightForward);
    ui.prev.click(); // un-folds seam 1 (2 → 1)
    ui.clock.advance(FOLD_MS.straightReverse);
    expect(ui.stepsBegun).toEqual([
      { stepIndex: 0, forward: true },
      { stepIndex: 1, forward: true },
      { stepIndex: 1, forward: false },
    ]);
  });

  it('shows the learn card only when every fold is complete', () => {
    const ui = mount();
    expect(ui.learnCard.hidden).toBe(true);
    ui.handle.setValue(2);
    expect(ui.handle.state).toEqual({ stepIndex: 1, t: 1 });
    expect(ui.learnCard.hidden).toBe(false);
    expect(ui.learnCard.textContent).toBe('You assembled it!');
    ui.handle.setValue(1.5);
    expect(ui.learnCard.hidden).toBe(true);
  });

  it('mid-fold next finishes the current seam, not the next one', () => {
    const ui = mount();
    ui.handle.setValue(0.5);
    ui.next.click();
    ui.clock.advance(FOLD_MS.straightForward);
    expect(ui.handle.state).toEqual({ stepIndex: 1, t: 0 });
  });

  it('a click on a disabled boundary is a no-op (no tween)', () => {
    const ui = mount();
    ui.prev.click();
    ui.clock.advance(1000);
    expect(ui.handle.state).toEqual({ stepIndex: 0, t: 0 });
    expect(ui.stepsBegun).toEqual([]);
  });

  it('dispose stops the tween without throwing', () => {
    const ui = mount();
    ui.next.click();
    ui.handle.dispose();
    expect(() => ui.clock.advance(1000)).not.toThrow();
    expect(ui.states.length).toBeGreaterThan(0);
  });

  it('exit reports once and dispose removes the bar', () => {
    const ui = mount();
    ui.exit.click();
    expect(ui.onExit).toHaveBeenCalledTimes(1);
    ui.handle.dispose();
    expect(ui.container.querySelector('.assembly-bar')).toBeNull();
  });

  it('degrades gracefully with no seams', () => {
    const ui = mount(0);
    expect(ui.counter.textContent).toContain('No seams');
    expect(ui.next.disabled).toBe(true);
    expect(ui.slider.disabled).toBe(true);
  });

  it('exposes an accessible scrubber', () => {
    const ui = mount();
    expect(ui.slider.getAttribute('aria-label')).toBe(
      'Fold progress scrubber',
    );
    expect(ui.slider.getAttribute('aria-valuemax')).toBe('2');
  });
});
