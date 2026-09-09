import { describe, expect, it } from 'vitest';
import {
  EMPTY_PARAMETERS,
  clampValues,
  createParameterSchema,
  createParameterSpec,
  defaultValues,
} from './parameters';

const SPEC_INPUT = {
  key: 'waistCm',
  label: 'Waist',
  explainer: 'Body circumference where the waistband sits.',
  unit: 'cm',
  min: 60,
  max: 140,
  step: 0.5,
  value: 84.6,
};

describe('createParameterSpec', () => {
  it('passes a valid spec through, frozen', () => {
    const spec = createParameterSpec(SPEC_INPUT);
    expect(spec).toEqual(SPEC_INPUT);
    expect(Object.isFrozen(spec)).toBe(true);
  });

  it('rejects empty key, label, explainer, or unit', () => {
    for (const field of ['key', 'label', 'explainer', 'unit'] as const) {
      expect(() =>
        createParameterSpec({ ...SPEC_INPUT, [field]: '' }),
      ).toThrow();
    }
  });

  it('rejects non-finite numbers and a non-positive step', () => {
    expect(() =>
      createParameterSpec({ ...SPEC_INPUT, min: Number.NaN }),
    ).toThrow();
    expect(() =>
      createParameterSpec({ ...SPEC_INPUT, max: Number.POSITIVE_INFINITY }),
    ).toThrow();
    expect(() => createParameterSpec({ ...SPEC_INPUT, value: NaN })).toThrow();
    expect(() => createParameterSpec({ ...SPEC_INPUT, step: 0 })).toThrow();
  });

  it('rejects min >= max', () => {
    expect(() =>
      createParameterSpec({ ...SPEC_INPUT, min: 140, max: 140 }),
    ).toThrow(/min must be below max/);
    expect(() =>
      createParameterSpec({ ...SPEC_INPUT, min: 150, max: 140 }),
    ).toThrow(/min must be below max/);
  });

  it('rejects a declared value outside its own range instead of clamping', () => {
    expect(() =>
      createParameterSpec({ ...SPEC_INPUT, value: 150 }),
    ).toThrow(/outside its range/);
    expect(() => createParameterSpec({ ...SPEC_INPUT, value: 0 })).toThrow(
      /outside its range/,
    );
  });
});

describe('createParameterSchema', () => {
  it('freezes the schema and preserves declaration order', () => {
    const schema = createParameterSchema([
      SPEC_INPUT,
      {
        ...SPEC_INPUT,
        key: 'risePct',
        label: 'Rise',
        unit: '%',
        min: 0,
        max: 100,
        step: 5,
        value: 100,
      },
    ]);
    expect(Object.isFrozen(schema)).toBe(true);
    expect(schema.map((spec) => spec.key)).toEqual(['waistCm', 'risePct']);
    expect(schema.every((spec) => Object.isFrozen(spec))).toBe(true);
  });

  it('rejects duplicate keys — they name redraft inputs', () => {
    expect(() =>
      createParameterSchema([SPEC_INPUT, { ...SPEC_INPUT }]),
    ).toThrow(/duplicate key "waistCm"/);
  });

  it('accepts the empty schema (the narrated-empty-state case)', () => {
    expect(createParameterSchema([])).toEqual([]);
  });
});

describe('EMPTY_PARAMETERS', () => {
  it('is a frozen, reusable empty schema', () => {
    expect(EMPTY_PARAMETERS).toHaveLength(0);
    expect(Object.isFrozen(EMPTY_PARAMETERS)).toBe(true);
  });
});

describe('clampValues', () => {
  const schema = createParameterSchema([
    SPEC_INPUT,
    {
      ...SPEC_INPUT,
      key: 'risePct',
      label: 'Rise',
      unit: '%',
      min: 0,
      max: 100,
      step: 5,
      value: 100,
    },
  ]);

  it('clamps every value into its own spec range', () => {
    expect(clampValues(schema, { waistCm: 500, risePct: -10 })).toEqual({
      waistCm: 140,
      risePct: 0,
    });
  });

  it('passes in-range values through unchanged', () => {
    expect(clampValues(schema, { waistCm: 84.6, risePct: 100 })).toEqual({
      waistCm: 84.6,
      risePct: 100,
    });
  });
});

describe('defaultValues', () => {
  it('seeds each spec key with its declared current value', () => {
    const schema = createParameterSchema([SPEC_INPUT]);
    expect(defaultValues(schema)).toEqual({ waistCm: 84.6 });
  });
});
