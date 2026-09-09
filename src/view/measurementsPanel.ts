/**
 * Measurements panel: the schema-driven control surface (UX-03) that drives
 * parametric redrafting. The active project declares its adjustable
 * parameters (see model/parameters.ts); this panel renders exactly that
 * schema — label, bounds, step, unit, declared value — and nothing else, so
 * a notebook holder can never show pants fields. A project with an empty
 * schema gets the narrated empty state (PRD states table: Empty → explain
 * why + offer a useful next action).
 *
 * Pure input plumbing — parsing, clamped state, and change notification live
 * here; running the redraft and updating the viewport stay with the app
 * shell, so a failed draft can never leave this panel holding half-updated
 * DOM state.
 *
 * Off-happy-path states per the blueprint: a non-numeric or empty field is
 * marked invalid and suppresses redrafting (the last valid draft stays on
 * the mat), and a draft failure surfaces through showDraftError() while the
 * panel keeps accepting input.
 */
import { clampValues, defaultValues } from '../model/parameters';
import type { ParameterSchema, ParameterValues } from '../model/parameters';

export interface MeasurementsPanelCallbacks {
  /** Called with clamped, complete parameter values on every valid change. */
  onRedraft(values: ParameterValues): void;
}

export interface MeasurementsPanelHandle {
  getValues(): ParameterValues;
  resetToDefaults(): void;
  /** Show (or clear) a draft-failure message; the draft itself is unchanged. */
  showDraftError(message: string | null): void;
  dispose(): void;
}

export function createMeasurementsPanel(
  container: HTMLElement,
  schema: ParameterSchema,
  callbacks: MeasurementsPanelCallbacks,
): MeasurementsPanelHandle {
  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = 'Measurements';
  container.appendChild(heading);

  // Narrated empty state: this project declares no adjustable parameters.
  // Explain why and offer the next action, in the status bar's narrative
  // voice — but persistent, because the bar's latest-event-wins rule would
  // bury this under the starter's learn card within one tick.
  if (schema.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'measurements-empty';
    empty.textContent =
      'This project is drafted at fixed sizes, so it has no adjustable ' +
      'measurements. To see live redrafting, pick the Pants starter — its ' +
      'measurements reshape the pattern as you type.';
    container.appendChild(empty);
    return {
      getValues: () => ({}),
      resetToDefaults: () => {},
      showDraftError: () => {},
      dispose: () => {
        container.innerHTML = '';
      },
    };
  }

  const hint = document.createElement('p');
  hint.className = 'measurements-hint';
  hint.textContent = 'Change a value and the pattern redrafts live.';
  container.appendChild(hint);

  const form = document.createElement('div');
  form.className = 'measurement-fields';
  container.appendChild(form);

  let current: Record<string, number> = { ...defaultValues(schema) };
  const fields: {
    input: HTMLInputElement;
    handler: () => void;
    changeHandler: () => void;
  }[] = [];

  for (const spec of schema) {
    const row = document.createElement('label');
    row.className = 'measurement-field';
    row.title = spec.explainer;

    const name = document.createElement('span');
    name.className = 'measurement-label';
    name.textContent = spec.label;

    const input = document.createElement('input');
    input.type = 'number';
    input.id = `measurement-${spec.key}`;
    input.name = spec.key;
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(spec.value);
    input.setAttribute('aria-label', `${spec.label} — ${spec.explainer}`);

    const unit = document.createElement('span');
    unit.className = 'measurement-unit';
    unit.textContent = spec.unit;

    const explainer = document.createElement('span');
    explainer.className = 'measurement-explainer';
    explainer.textContent = spec.explainer;

    row.append(name, input, unit, explainer);
    form.appendChild(row);

    const handler = (): void => {
      const raw = input.value.trim();
      if (raw === '') {
        // Empty field: keep the last valid draft, flag the field. The
        // learner is mid-edit, not wrong — no redraft, no error text.
        input.setAttribute('aria-invalid', 'true');
        row.classList.add('invalid');
        return;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        input.setAttribute('aria-invalid', 'true');
        row.classList.add('invalid');
        return;
      }
      input.removeAttribute('aria-invalid');
      row.classList.remove('invalid');
      // Clamp instead of rejecting: a typed 500 cm becomes 140 and the
      // draft keeps moving — the input canonicalises on blur/change.
      current = { ...clampValues(schema, { ...current, [spec.key]: parsed }) };
      callbacks.onRedraft({ ...current });
    };
    // Canonicalise the visible value on commit so clamped/derived edits show.
    const changeHandler = (): void => {
      input.value = String(current[spec.key]);
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', changeHandler);
    fields.push({ input, handler, changeHandler });
  }

  const controls = document.createElement('div');
  controls.className = 'measurement-controls';
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'reset-btn';
  resetButton.textContent = 'Reset to template';
  controls.appendChild(resetButton);
  container.appendChild(controls);

  const draftError = document.createElement('p');
  draftError.className = 'draft-error';
  draftError.setAttribute('role', 'alert');
  draftError.hidden = true;
  container.appendChild(draftError);

  const resetHandler = (): void => {
    current = { ...defaultValues(schema) };
    for (const { input } of fields) {
      input.value = String(current[input.name]);
      input.removeAttribute('aria-invalid');
      input.closest('.measurement-field')?.classList.remove('invalid');
    }
    draftError.hidden = true;
    callbacks.onRedraft({ ...current });
  };
  resetButton.addEventListener('click', resetHandler);

  return {
    getValues: () => ({ ...current }),
    resetToDefaults: resetHandler,
    showDraftError(message: string | null): void {
      if (message === null) {
        draftError.hidden = true;
        draftError.textContent = '';
      } else {
        draftError.hidden = false;
        draftError.textContent = message;
      }
    },
    dispose(): void {
      resetButton.removeEventListener('click', resetHandler);
      for (const { input, handler, changeHandler } of fields) {
        input.removeEventListener('input', handler);
        input.removeEventListener('change', changeHandler);
      }
      container.innerHTML = '';
    },
  };
}
