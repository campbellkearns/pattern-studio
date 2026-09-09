/**
 * Titan option mapping — the curation layer between Pattern Studio's
 * learner-facing measurement fields and FreeSewing's draft-internals-flavored
 * settings (docs/spike-freesewing.md §4: "the parametrics UI will need a
 * curation layer either way").
 *
 * PURE and DOM-free. Units are converted here, at the engine boundary — never
 * in the domain model (src/model is centimetres end to end):
 *   - panel lengths in cm  → Titan measurements in mm  (× 10)
 *   - panel percents 0–100 → Titan option fractions    (÷ 100)
 *
 * Titan consumes (verified at source, @freesewing/titan 4.10.1):
 *   fork y   = waistToUpperLeg × (1 + crotchDrop)      [front.mjs/back.mjs]
 *   hem y    = waistToFloor × (1 + lengthBonus)        [front.mjs]
 *   knee y   = waistToKnee                             [front.mjs]
 *   knee girth = knee × (1 + kneeEase)                [back.mjs]
 * so inseam is delivered as an exact waistToFloor (lengthBonus pinned to 0)
 * and the knee stays proportional to the leg, wherever the hem goes.
 */
import { cisMaleAdult40 } from '@freesewing/models';
import { createParameterSchema, createParameterSpec } from '../model/parameters';
import type { ParameterSchema, ParameterValues } from '../model/parameters';

/** Learner-facing measurement fields — the R3-capped set of 8. */
export interface PantMeasurements {
  /** Natural waist circumference, cm. */
  readonly waistCm: number;
  /** Full seat circumference, cm (Titan's `seat`). */
  readonly hipCm: number;
  /** Where the waistband sits, % of waist-to-hip; 100 = natural waist. */
  readonly risePct: number;
  /** Crotch-to-hem length along the inseam, cm. */
  readonly inseamCm: number;
  /** Room added at the seat and fork, % of the seat arc (Titan `seatEase`). */
  readonly easePct: number;
  /** Room added at the waistband, % of the waist (Titan `waistEase`). */
  readonly waistEasePct: number;
  /** Knee room, % of knee girth — also sets the leg opening (Titan `kneeEase`). */
  readonly kneeEasePct: number;
  /** Crotch depth added below the body's crotch level, % (Titan `crotchDrop`). */
  readonly crotchDropPct: number;
}

/** Field ranges. Option ranges are Titan's own (back.mjs option defs); body
 * measurements are plausible adult bands so typos can't produce nonsense. */
export interface MeasurementRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export const PANT_MEASUREMENT_RANGES: {
  readonly [K in keyof PantMeasurements]: MeasurementRange;
} = {
  waistCm: { min: 60, max: 140, step: 0.5 },
  hipCm: { min: 75, max: 160, step: 0.5 },
  risePct: { min: 0, max: 100, step: 5 },
  inseamCm: { min: 50, max: 100, step: 0.5 },
  easePct: { min: 0, max: 10, step: 0.5 },
  waistEasePct: { min: 0, max: 10, step: 0.5 },
  kneeEasePct: { min: 1, max: 25, step: 1 },
  crotchDropPct: { min: 0, max: 15, step: 1 },
};

/** Template defaults: the size-40 model's body + Titan's own option defaults. */
export const TITAN_PANTS_TEMPLATE: PantMeasurements = {
  waistCm: 84.6,
  hipCm: 105.2,
  risePct: 100,
  inseamCm: 79,
  easePct: 2,
  waistEasePct: 2,
  kneeEasePct: 6,
  crotchDropPct: 2,
};

/** Pedagogical labels + per-field fit explainers (blueprint F4) — declared
 * beside the ranges so the learner-facing schema and the engine share one
 * source of truth for bounds and defaults. */
const PANTS_FIELD_META: {
  readonly [K in keyof PantMeasurements]: {
    readonly label: string;
    readonly explainer: string;
    readonly unit: string;
  };
} = {
  waistCm: {
    label: 'Waist',
    explainer: 'Body circumference where the waistband sits.',
    unit: 'cm',
  },
  hipCm: {
    label: 'Hip',
    explainer: 'Circumference at the fullest point of the seat.',
    unit: 'cm',
  },
  risePct: {
    label: 'Rise',
    explainer:
      'Where the waistband sits: 100 = natural waist, lower rides on the hips.',
    unit: '%',
  },
  inseamCm: {
    label: 'Inseam',
    explainer: 'Crotch to hem, measured along the inner leg.',
    unit: 'cm',
  },
  easePct: {
    label: 'Seat ease',
    explainer: 'Wearing ease added across the seat.',
    unit: '%',
  },
  waistEasePct: {
    label: 'Waist ease',
    explainer: 'Wearing ease added at the waistband.',
    unit: '%',
  },
  kneeEasePct: {
    label: 'Knee ease',
    explainer: 'Extra width at the knee for bending the leg.',
    unit: '%',
  },
  crotchDropPct: {
    label: 'Crotch depth',
    explainer: 'Extra depth below the fork so the pants can move.',
    unit: '%',
  },
};

/** The pants starter's declared adjustable parameters (UX-03): the
 * R3-capped 8-field set, projected from the engine's own ranges and
 * template so the panel can never drift from the adapter on bounds or
 * defaults. This is one schema among others — starters declare theirs. */
export const PANTS_PARAMETERS: ParameterSchema = createParameterSchema(
  (Object.keys(PANT_MEASUREMENT_RANGES) as Array<keyof PantMeasurements>).map(
    (key) =>
      createParameterSpec({
        key,
        label: PANTS_FIELD_META[key].label,
        explainer: PANTS_FIELD_META[key].explainer,
        unit: PANTS_FIELD_META[key].unit,
        min: PANT_MEASUREMENT_RANGES[key].min,
        max: PANT_MEASUREMENT_RANGES[key].max,
        step: PANT_MEASUREMENT_RANGES[key].step,
        value: TITAN_PANTS_TEMPLATE[key],
      }),
  ),
);

/**
 * Schema-value record → typed measurements (the UX-03 boundary): the panel
 * speaks ParameterValues, Titan needs PantMeasurements. The mapping is
 * explicit — every PANTS_PARAMETERS key is a PantMeasurements key — and a
 * missing or non-finite key fails in clampMeasurements (MeasurementError)
 * rather than silently defaulting, so a bad redraft is narrated and the
 * last valid pattern stays on the mat.
 */
export function toPantMeasurements(values: ParameterValues): PantMeasurements {
  return clampMeasurements({
    waistCm: values.waistCm,
    hipCm: values.hipCm,
    risePct: values.risePct,
    inseamCm: values.inseamCm,
    easePct: values.easePct,
    waistEasePct: values.waistEasePct,
    kneeEasePct: values.kneeEasePct,
    crotchDropPct: values.crotchDropPct,
  });
}

/** Body constants from the size-40 model (mm) that Titan needs but the panel
 * does not expose — crotch depth is a body fact, not a style choice here. */
const MODEL_WAIST_TO_UPPER_LEG_MM = cisMaleAdult40.waistToUpperLeg; // 352
const MODEL_KNEE_MM = cisMaleAdult40.knee; // 424
// Knee position along the leg, from the model's own proportions:
// (waistToKnee − waistToUpperLeg) / (waistToFloor − waistToUpperLeg).
const KNEE_ALONG_LEG =
  (cisMaleAdult40.waistToKnee - cisMaleAdult40.waistToUpperLeg) /
  (cisMaleAdult40.waistToFloor - cisMaleAdult40.waistToUpperLeg);

export class MeasurementError extends Error {}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new MeasurementError(`${label} must be finite, got ${value}`);
  }
  return value;
}

/** Clamp panel input into the field ranges — UI bounds are the same numbers. */
export function clampMeasurements(input: PantMeasurements): PantMeasurements {
  const clamped = {} as Record<keyof PantMeasurements, number>;
  for (const key of Object.keys(PANT_MEASUREMENT_RANGES) as Array<
    keyof PantMeasurements
  >) {
    const value = requireFinite(input[key], key);
    const { min, max } = PANT_MEASUREMENT_RANGES[key];
    clamped[key] = clamp(value, min, max);
  }
  return clamped as PantMeasurements;
}

/**
 * Crotch depth below the waist line, cm: waistToUpperLeg × (1 + crotchDrop).
 * Exported because starter data (fly shield) and fit explainers size off the
 * fork depth too — one formula, quoted once.
 */
export function forkDepthCm(input: PantMeasurements): number {
  const m = clampMeasurements(input);
  return (MODEL_WAIST_TO_UPPER_LEG_MM * (1 + m.crotchDropPct / 100)) / 10;
}

export interface TitanSettings {
  readonly measurements: FreeSewingMeasurements;
  readonly options: FreeSewingOptions;
  /** Derived depths the tests (and the fit explainers) can quote, in mm. */
  readonly derived: {
    /** Crotch depth from the waist line: waistToUpperLeg × (1 + crotchDrop). */
    readonly forkDepthMm: number;
    /** Hem distance from the waist line: fork depth + inseam (lengthBonus 0). */
    readonly waistToFloorMm: number;
  };
}

/**
 * Map panel measurements to Titan settings. Throws MeasurementError on
 * non-finite input; out-of-range values clamp (the panel enforces the same
 * ranges, so clamping is a belt-and-braces for programmatic callers).
 */
export function toTitanSettings(input: PantMeasurements): TitanSettings {
  const m = clampMeasurements(input);

  const forkDepthMm = forkDepthCm(m) * 10;
  const inseamMm = m.inseamCm * 10;
  const waistToFloorMm = forkDepthMm + inseamMm;

  const measurements: FreeSewingMeasurements = {
    // Base model (mm) — plugin-measurements derives the seat/waist arcs and
    // cross-seams from these at preDraft (spike gotcha 3).
    ...cisMaleAdult40,
    waist: m.waistCm * 10,
    seat: m.hipCm * 10,
    // Knee girth is not panel-exposed; kneeEase is the learner lever on top.
    knee: MODEL_KNEE_MM,
    // Leg length: hem sits exactly `inseam` below the fork.
    waistToFloor: waistToFloorMm,
    waistToKnee: forkDepthMm + inseamMm * KNEE_ALONG_LEG,
  };

  const options: FreeSewingOptions = {
    waistHeight: m.risePct / 100,
    crotchDrop: m.crotchDropPct / 100,
    seatEase: m.easePct / 100,
    waistEase: m.waistEasePct / 100,
    kneeEase: m.kneeEasePct / 100,
    // Inseam is delivered exactly through waistToFloor above; a non-zero
    // lengthBonus would silently rescale it.
    lengthBonus: 0,
    // fitCrossSeam* / fitKnee keep their part-level defaults — spike gotcha 2:
    // back.mjs only creates points.forkCp2 inside the fit block, and both
    // parts' inseam paths consume it. Never pass anything for them.
  };

  return { measurements, options, derived: { forkDepthMm, waistToFloorMm } };
}
