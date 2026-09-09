/**
 * Per-project adjustable parameters (UX-03): the schema a starter declares
 * for the measurements panel. A project with an empty schema has nothing to
 * adjust — the panel shows its narrated empty state instead of fields.
 *
 * PURE and DOM-free. The panel renders exactly what the schema declares
 * (label, min, max, step, unit, current value); engines keep their own typed
 * settings and adapt from ParameterValues at their boundary (see
 * engine/titanSettings.ts). One declared parameter maps to one redraft input.
 */
import { requireFinite, requireNonEmptyString, requirePositive } from './assert';

/** One learner-adjustable parameter, as the measurements panel renders it. */
export interface ParameterSpec {
  /** Stable key — names the redraft input this parameter drives. */
  readonly key: string;
  /** Short field label, e.g. "Waist". */
  readonly label: string;
  /** One-sentence fit explainer shown with the field. */
  readonly explainer: string;
  /** Unit suffix, e.g. "cm" or "%". */
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Declared current value (the starter's template value). */
  readonly value: number;
}

/** A project's declared adjustable parameters, in panel order. */
export type ParameterSchema = readonly ParameterSpec[];

/** Redraft input: current values keyed by ParameterSpec.key. */
export type ParameterValues = Readonly<Record<string, number>>;

/**
 * Validated, frozen spec — starter data goes through the same gate as any
 * deserialized input (the createProject convention): a declared value
 * outside its own range is a data bug and fails loudly instead of clamping.
 */
export function createParameterSpec(input: ParameterSpec): ParameterSpec {
  const key = requireNonEmptyString(input.key, 'parameter key');
  const label = requireNonEmptyString(input.label, `parameter "${key}" label`);
  const explainer = requireNonEmptyString(
    input.explainer,
    `parameter "${key}" explainer`,
  );
  const unit = requireNonEmptyString(input.unit, `parameter "${key}" unit`);
  const min = requireFinite(input.min, `parameter "${key}" min`);
  const max = requireFinite(input.max, `parameter "${key}" max`);
  const step = requirePositive(input.step, `parameter "${key}" step`);
  const value = requireFinite(input.value, `parameter "${key}" value`);
  if (!(min < max)) {
    throw new Error(
      `parameter "${key}" min must be below max (got ${min}..${max})`,
    );
  }
  if (value < min || value > max) {
    throw new Error(
      `parameter "${key}" value ${value} is outside its range ${min}..${max}`,
    );
  }
  return Object.freeze({ key, label, explainer, unit, min, max, step, value });
}

/** Validate + freeze a schema; keys must be unique (they name redraft inputs). */
export function createParameterSchema(
  specs: readonly ParameterSpec[],
): ParameterSchema {
  const seen = new Set<string>();
  for (const spec of specs) {
    if (seen.has(spec.key)) {
      throw new Error(`parameter schema has duplicate key "${spec.key}"`);
    }
    seen.add(spec.key);
  }
  return Object.freeze(specs.map((spec) => createParameterSpec(spec)));
}

/** The reusable empty schema: the narrated-empty-state case (UX-03). */
export const EMPTY_PARAMETERS: ParameterSchema = Object.freeze([]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Clamp a full value map into its schema's ranges — the panel's bounds are
 * the same numbers it renders (the clampMeasurements convention). */
export function clampValues(
  schema: ParameterSchema,
  values: ParameterValues,
): ParameterValues {
  const clamped: Record<string, number> = {};
  for (const spec of schema) {
    clamped[spec.key] = clamp(values[spec.key], spec.min, spec.max);
  }
  return Object.freeze(clamped);
}

/** Each spec's declared current value — the panel's seed state. */
export function defaultValues(schema: ParameterSchema): ParameterValues {
  const values: Record<string, number> = {};
  for (const spec of schema) {
    values[spec.key] = spec.value;
  }
  return Object.freeze(values);
}
