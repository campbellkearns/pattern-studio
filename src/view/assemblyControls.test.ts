/**
 * Assembly-controls interaction contract, unit-tested in jsdom: the slider
 * is the single source of truth, the step buttons move one seam at a time,
 * labels narrate the current seam, and the learn card appears only when
 * every fold is complete.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createAssemblyControls,
  scrubStateFromValue,
} from './assemblyControls';
import type { AssemblyScrubState } from './assemblyControls';

function mount(stepCount = 2) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const states: AssemblyScrubState[] = [];
  const onExit = vi.fn();
  const handle = createAssemblyControls(container, {
    labels: Array.from({ length: stepCount }, (_, i) => ({
      title: `Seam ${i + 1} title`,
      note: `Seam ${i + 1} note`,
    })),
    learnCard: 'You assembled it!',
    onScrub: (state) => states.push(state),
    onExit,
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

  it('steps forward one seam at a time', () => {
    const ui = mount();
    ui.next.click();
    expect(ui.handle.state).toEqual({ stepIndex: 1, t: 0 });
    expect(ui.counter.textContent).toContain('Seam 2 of 2');
    ui.next.click();
    expect(ui.handle.state).toEqual({ stepIndex: 1, t: 1 });
    expect(ui.next.disabled).toBe(true);
  });

  it('steps backward one seam at a time', () => {
    const ui = mount();
    ui.handle.setValue(2);
    ui.prev.click();
    // Un-folding the last seam lands on its start (visually identical to
    // seam 1 folded, seam 2 open).
    expect(ui.handle.state).toEqual({ stepIndex: 1, t: 0 });
    ui.prev.click();
    expect(ui.handle.state).toEqual({ stepIndex: 0, t: 0 });
    expect(ui.prev.disabled).toBe(true);
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
    expect(ui.handle.state).toEqual({ stepIndex: 1, t: 0 });
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
