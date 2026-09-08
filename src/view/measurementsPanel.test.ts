import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PANT_MEASUREMENT_RANGES,
  TITAN_PANTS_TEMPLATE,
} from '../engine/titanSettings';
import type { PantMeasurements } from '../engine/titanSettings';
import { createMeasurementsPanel } from './measurementsPanel';
import type { MeasurementsPanelHandle } from './measurementsPanel';

function field(container: HTMLElement, key: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    `input[name="${key}"]`,
  );
  if (!input) throw new Error(`missing field ${key}`);
  return input;
}

function fire(
  input: HTMLInputElement,
  value: string,
  type: 'input' | 'change' = 'input',
): void {
  input.value = value;
  input.dispatchEvent(new Event(type, { bubbles: true }));
}

describe('createMeasurementsPanel', () => {
  let container: HTMLElement;
  let handle: MeasurementsPanelHandle | undefined;
  const onRedraft = vi.fn((m: PantMeasurements): void => void m);

  afterEach(() => {
    handle?.dispose();
    handle = undefined;
    container?.remove();
  });

  /** Fresh panel per test; returns the container. */
  function mount(
    initial: PantMeasurements = { ...TITAN_PANTS_TEMPLATE },
  ): HTMLElement {
    onRedraft.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    handle = createMeasurementsPanel(container, initial, { onRedraft });
    return container;
  }

  it('renders the R3-capped 8 fields with ranges and units', () => {
    const root = mount();
    const inputs = root.querySelectorAll('input[type="number"]');
    expect(inputs).toHaveLength(8);
    const waist = field(root, 'waistCm');
    expect(waist.min).toBe(String(PANT_MEASUREMENT_RANGES.waistCm.min));
    expect(waist.max).toBe(String(PANT_MEASUREMENT_RANGES.waistCm.max));
    expect(waist.step).toBe(String(PANT_MEASUREMENT_RANGES.waistCm.step));
    expect(waist.value).toBe(String(TITAN_PANTS_TEMPLATE.waistCm));
    // Every field carries its fit explainer for the learner.
    const explainers = root.querySelectorAll('.measurement-explainer');
    expect(explainers).toHaveLength(8);
    for (const e of explainers) {
      expect(e.textContent?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it('redrafts on valid input with the clamped value', () => {
    const root = mount();
    fire(field(root, 'inseamCm'), '60');
    expect(onRedraft).toHaveBeenCalledTimes(1);
    expect(onRedraft.mock.calls[0][0].inseamCm).toBe(60);
    // Other fields ride along unchanged.
    expect(onRedraft.mock.calls[0][0].waistCm).toBe(
      TITAN_PANTS_TEMPLATE.waistCm,
    );
  });

  it('clamps out-of-range input instead of rejecting it', () => {
    const root = mount();
    fire(field(root, 'waistCm'), '500');
    expect(onRedraft).toHaveBeenCalledTimes(1);
    expect(onRedraft.mock.calls[0][0].waistCm).toBe(140);
    // The visible value canonicalises on commit, not mid-typing.
    fire(field(root, 'waistCm'), '500', 'change');
    expect(field(root, 'waistCm').value).toBe('140');
  });

  it('suppresses redrafting on empty input and flags the field', () => {
    const root = mount();
    fire(field(root, 'hipCm'), '');
    expect(onRedraft).not.toHaveBeenCalled();
    expect(field(root, 'hipCm').getAttribute('aria-invalid')).toBe('true');
    // Recovery clears the flag and redrafts.
    fire(field(root, 'hipCm'), '105.2');
    expect(onRedraft).toHaveBeenCalledTimes(1);
    expect(field(root, 'hipCm').getAttribute('aria-invalid')).toBeNull();
  });

  it('tracks state across successive edits', () => {
    const root = mount();
    fire(field(root, 'waistCm'), '90');
    fire(field(root, 'hipCm'), '110');
    expect(handle?.getMeasurements()).toMatchObject({
      waistCm: 90,
      hipCm: 110,
      inseamCm: TITAN_PANTS_TEMPLATE.inseamCm,
    });
  });

  it('reset restores template values and redrafts', () => {
    const root = mount();
    fire(field(root, 'waistCm'), '140');
    fire(field(root, 'inseamCm'), '50');
    onRedraft.mockClear();
    root.querySelector<HTMLButtonElement>('.reset-btn')?.click();
    expect(onRedraft).toHaveBeenCalledTimes(1);
    expect(onRedraft.mock.calls[0][0]).toEqual(TITAN_PANTS_TEMPLATE);
    expect(field(root, 'waistCm').value).toBe(
      String(TITAN_PANTS_TEMPLATE.waistCm),
    );
    expect(field(root, 'inseamCm').value).toBe(
      String(TITAN_PANTS_TEMPLATE.inseamCm),
    );
  });

  it('shows and clears the draft-error message', () => {
    const root = mount();
    handle?.showDraftError('draft failed');
    const alert = root.querySelector<HTMLElement>('.draft-error');
    expect(alert?.hidden).toBe(false);
    expect(alert?.textContent).toBe('draft failed');
    handle?.showDraftError(null);
    expect(alert?.hidden).toBe(true);
    expect(alert?.textContent).toBe('');
  });

  it('stops listening after dispose', () => {
    const root = mount();
    const waistInput = field(root, 'waistCm');
    handle?.dispose();
    handle = undefined;
    expect(root.innerHTML).toBe('');
    // The detached input still fires in jsdom — the disposed panel must
    // simply no longer react.
    expect(() => fire(waistInput, '90')).not.toThrow();
    expect(onRedraft).not.toHaveBeenCalled();
  });
});
