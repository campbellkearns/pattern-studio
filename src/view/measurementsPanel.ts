/**
 * Measurements panel: the ≤8-field R3-capped control surface (blueprint R3)
 * that drives parametric redrafting. Pure input plumbing — parsing, clamped
 * state, and change notification live here; running the redraft and updating
 * the viewport stay with the app shell, so a failed draft can never leave
 * this panel holding half-updated DOM state.
 *
 * Off-happy-path states per the blueprint: a non-numeric or empty field is
 * marked invalid and suppresses redrafting (the last valid draft stays on
 * the mat), and a draft failure surfaces through showDraftError() while the
 * panel keeps accepting input.
 */
import {
  PANT_MEASUREMENT_RANGES,
  TITAN_PANTS_TEMPLATE,
  clampMeasurements,
} from '../engine/titanSettings';
import type { PantMeasurements } from '../engine/titanSettings';

type MeasurementKey = keyof PantMeasurements;

interface FieldMeta {
  readonly label: string;
  readonly explainer: string;
}

/** Pedagogical labels + per-field fit explainers (blueprint F4). */
const FIELD_META: Record<MeasurementKey, FieldMeta> = {
  waistCm: {
    label: 'Waist',
    explainer: 'Body circumference where the waistband sits.',
  },
  hipCm: {
    label: 'Hip',
    explainer: 'Circumference at the fullest point of the seat.',
  },
  risePct: {
    label: 'Rise',
    explainer:
      'Where the waistband sits: 100 = natural waist, lower rides on the hips.',
  },
  inseamCm: {
    label: 'Inseam',
    explainer: 'Crotch to hem, measured along the inner leg.',
  },
  crotchDropPct: {
    label: 'Crotch depth',
    explainer: 'Extra depth below the fork so the pants can move.',
  },
  kneeEasePct: {
    label: 'Knee ease',
    explainer: 'Extra width at the knee for bending the leg.',
  },
  easePct: {
    label: 'Seat ease',
    explainer: 'Wearing ease added across the seat.',
  },
  waistEasePct: {
    label: 'Waist ease',
    explainer: 'Wearing ease added at the waistband.',
  },
};

const UNITS: Record<MeasurementKey, string> = {
  waistCm: 'cm',
  hipCm: 'cm',
  risePct: '%',
  inseamCm: 'cm',
  crotchDropPct: '%',
  kneeEasePct: '%',
  easePct: '%',
  waistEasePct: '%',
};

export interface MeasurementsPanelCallbacks {
  /** Called with clamped, complete measurements on every valid change. */
  onRedraft(measurements: PantMeasurements): void;
}

export interface MeasurementsPanelHandle {
  getMeasurements(): PantMeasurements;
  resetToDefaults(): void;
  /** Show (or clear) a draft-failure message; the draft itself is unchanged. */
  showDraftError(message: string | null): void;
  dispose(): void;
}

export function createMeasurementsPanel(
  container: HTMLElement,
  initial: PantMeasurements,
  callbacks: MeasurementsPanelCallbacks,
): MeasurementsPanelHandle {
  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = 'Measurements';
  container.appendChild(heading);

  const hint = document.createElement('p');
  hint.className = 'measurements-hint';
  hint.textContent = 'Change a value and the pattern redrafts live.';
  container.appendChild(hint);

  const form = document.createElement('div');
  form.className = 'measurement-fields';
  container.appendChild(form);

  let current: PantMeasurements = { ...initial };
  const fields: {
    key: MeasurementKey;
    input: HTMLInputElement;
    handler: () => void;
    changeHandler: () => void;
  }[] = [];

  for (const key of Object.keys(PANT_MEASUREMENT_RANGES) as MeasurementKey[]) {
    const range = PANT_MEASUREMENT_RANGES[key];
    const meta = FIELD_META[key];

    const row = document.createElement('label');
    row.className = 'measurement-field';
    row.title = meta.explainer;

    const name = document.createElement('span');
    name.className = 'measurement-label';
    name.textContent = meta.label;

    const input = document.createElement('input');
    input.type = 'number';
    input.id = `measurement-${key}`;
    input.name = key;
    input.min = String(range.min);
    input.max = String(range.max);
    input.step = String(range.step);
    input.value = String(initial[key]);
    input.setAttribute('aria-label', `${meta.label} — ${meta.explainer}`);

    const unit = document.createElement('span');
    unit.className = 'measurement-unit';
    unit.textContent = UNITS[key];

    const explainer = document.createElement('span');
    explainer.className = 'measurement-explainer';
    explainer.textContent = meta.explainer;

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
      current = clampMeasurements({ ...current, [key]: parsed });
      callbacks.onRedraft({ ...current });
    };
    // Canonicalise the visible value on commit so clamped/derived edits show.
    const changeHandler = (): void => {
      input.value = String(current[key]);
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', changeHandler);
    fields.push({ key, input, handler, changeHandler });
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
    current = { ...TITAN_PANTS_TEMPLATE };
    for (const { input } of fields) {
      input.value = String(current[input.name as MeasurementKey]);
      input.removeAttribute('aria-invalid');
      input.closest('.measurement-field')?.classList.remove('invalid');
    }
    draftError.hidden = true;
    callbacks.onRedraft({ ...current });
  };
  resetButton.addEventListener('click', resetHandler);

  return {
    getMeasurements: () => ({ ...current }),
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
