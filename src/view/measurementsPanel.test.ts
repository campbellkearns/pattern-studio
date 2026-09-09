import { afterEach, describe, expect, it, vi } from 'vitest';
import { PANTS_PARAMETERS } from '../engine/titanSettings';
import { createParameterSchema, createParameterSpec } from '../model/parameters';
import type { ParameterSchema, ParameterValues } from '../model/parameters';
import { createMeasurementsPanel } from './measurementsPanel';
import type { MeasurementsPanelHandle } from './measurementsPanel';

/** A small non-pants schema, to prove the panel renders what it is given. */
function twoFieldSchema(): ParameterSchema {
  return createParameterSchema([
    createParameterSpec({
      key: 'waistCm',
      label: 'Waist',
      explainer: 'Body circumference where the waistband sits.',
      unit: 'cm',
      min: 60,
      max: 140,
      step: 0.5,
      value: 84.6,
    }),
    createParameterSpec({
      key: 'risePct',
      label: 'Rise',
      explainer: 'Where the waistband sits: 100 = natural waist.',
      unit: '%',
      min: 0,
      max: 100,
      step: 5,
      value: 100,
    }),
  ]);
}

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

function unitOf(root: HTMLElement, key: string): string | undefined {
  return field(root, key)
    .closest('.measurement-field')
    ?.querySelector('.measurement-unit')?.textContent;
}

describe('createMeasurementsPanel — schema-driven fields (UX-03)', () => {
  let container: HTMLElement;
  let handle: MeasurementsPanelHandle | undefined;
  const onRedraft = vi.fn((values: ParameterValues): void => void values);

  afterEach(() => {
    handle?.dispose();
    handle = undefined;
    container?.remove();
  });

  /** Fresh panel per test; returns the container. */
  function mount(schema: ParameterSchema = twoFieldSchema()): HTMLElement {
    onRedraft.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    handle = createMeasurementsPanel(container, schema, { onRedraft });
    return container;
  }

  it('renders exactly the schema: one row per declared parameter', () => {
    const root = mount();
    const inputs = root.querySelectorAll('input[type="number"]');
    expect(inputs).toHaveLength(2);
    // Declaration order is render order.
    expect(
      Array.from(inputs, (input) => (input as HTMLInputElement).name),
    ).toEqual(['waistCm', 'risePct']);
  });

  it('renders the pants schema: the R3-capped 8 fields with ranges, units, and explainers', () => {
    const root = mount(PANTS_PARAMETERS);
    const inputs = root.querySelectorAll('input[type="number"]');
    expect(inputs).toHaveLength(8);
    const waist = field(root, 'waistCm');
    expect(waist.min).toBe('60');
    expect(waist.max).toBe('140');
    expect(waist.step).toBe('0.5');
    expect(waist.value).toBe('84.6');
    // Units come from the schema, not a hardcoded table.
    expect(unitOf(root, 'waistCm')).toBe('cm');
    expect(unitOf(root, 'risePct')).toBe('%');
    // Every field carries its fit explainer for the learner.
    const explainers = root.querySelectorAll('.measurement-explainer');
    expect(explainers).toHaveLength(8);
    for (const e of explainers) {
      expect(e.textContent?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it('redrafts on valid input with the full clamped value map', () => {
    const root = mount();
    fire(field(root, 'risePct'), '30');
    expect(onRedraft).toHaveBeenCalledTimes(1);
    expect(onRedraft.mock.calls[0][0]).toEqual({
      waistCm: 84.6,
      risePct: 30,
    });
  });

  it('clamps out-of-range input into the schema range', () => {
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
    fire(field(root, 'waistCm'), '');
    expect(onRedraft).not.toHaveBeenCalled();
    expect(field(root, 'waistCm').getAttribute('aria-invalid')).toBe('true');
    // Recovery clears the flag and redrafts.
    fire(field(root, 'waistCm'), '90');
    expect(onRedraft).toHaveBeenCalledTimes(1);
    expect(field(root, 'waistCm').getAttribute('aria-invalid')).toBeNull();
  });

  it('tracks state across successive edits', () => {
    const root = mount();
    fire(field(root, 'waistCm'), '90');
    fire(field(root, 'risePct'), '50');
    expect(handle?.getValues()).toEqual({ waistCm: 90, risePct: 50 });
  });

  it('reset restores the declared schema values and redrafts', () => {
    const root = mount();
    fire(field(root, 'waistCm'), '140');
    fire(field(root, 'risePct'), '0');
    onRedraft.mockClear();
    root.querySelector<HTMLButtonElement>('.reset-btn')?.click();
    expect(onRedraft).toHaveBeenCalledTimes(1);
    expect(onRedraft.mock.calls[0][0]).toEqual({ waistCm: 84.6, risePct: 100 });
    expect(field(root, 'waistCm').value).toBe('84.6');
    expect(field(root, 'risePct').value).toBe('100');
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

describe('createMeasurementsPanel — narrated empty state (UX-03)', () => {
  let container: HTMLElement;
  let handle: MeasurementsPanelHandle | undefined;
  const onRedraft = vi.fn((values: ParameterValues): void => void values);

  afterEach(() => {
    handle?.dispose();
    handle = undefined;
    container?.remove();
  });

  function mount(): HTMLElement {
    onRedraft.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    handle = createMeasurementsPanel(
      container,
      createParameterSchema([]),
      { onRedraft },
    );
    return container;
  }

  it('renders no fields, no reset button, and no hint', () => {
    const root = mount();
    expect(root.querySelectorAll('input[type="number"]')).toHaveLength(0);
    expect(root.querySelector('.reset-btn')).toBeNull();
    expect(root.querySelector('.measurements-hint')).toBeNull();
  });

  it('explains why and offers the next action (PRD Empty state)', () => {
    const root = mount();
    const empty = root.querySelector<HTMLElement>('.measurements-empty');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toMatch(/no adjustable measurements/);
    expect(empty?.textContent).toMatch(/Pants starter/);
  });

  it('never redrafts and keeps the handle safe to call', () => {
    const root = mount();
    handle?.resetToDefaults();
    handle?.showDraftError('should never show');
    expect(root.querySelector('.draft-error')).toBeNull();
    expect(handle?.getValues()).toEqual({});
    expect(onRedraft).not.toHaveBeenCalled();
    handle?.dispose();
    handle = undefined;
    expect(root.innerHTML).toBe('');
  });
});
