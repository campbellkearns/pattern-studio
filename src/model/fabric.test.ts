import { describe, expect, it } from 'vitest';
import { createFabricSpec, type FabricSpec, type WeaveType } from './fabric';

function denim(overrides: Partial<FabricSpec> = {}): FabricSpec {
  return {
    weave: 'twill',
    weaveScale: 0.05,
    color: '#3b5998',
    weight: 340,
    ...overrides,
  };
}

describe('createFabricSpec', () => {
  it('creates a valid spec with its fields intact', () => {
    const spec = createFabricSpec(denim());
    expect(spec.weave).toBe('twill');
    expect(spec.weaveScale).toBe(0.05);
    expect(spec.color).toBe('#3b5998');
    expect(spec.weight).toBe(340);
  });

  it('accepts every weave type', () => {
    const weaves: WeaveType[] = ['plain', 'twill', 'satin'];
    for (const weave of weaves) {
      expect(createFabricSpec(denim({ weave })).weave).toBe(weave);
    }
  });

  it('rejects unknown weaves', () => {
    expect(() =>
      createFabricSpec(denim({ weave: 'basket' as WeaveType })),
    ).toThrow(/weave must be one of/);
  });

  it('rejects non-positive weave scale or weight', () => {
    expect(() => createFabricSpec(denim({ weaveScale: 0 }))).toThrow(/> 0/);
    expect(() => createFabricSpec(denim({ weaveScale: -0.05 }))).toThrow(/> 0/);
    expect(() => createFabricSpec(denim({ weight: 0 }))).toThrow(/> 0/);
    expect(() => createFabricSpec(denim({ weight: Number.NaN }))).toThrow(
      /finite/,
    );
  });

  it('rejects non-hex colors', () => {
    expect(() => createFabricSpec(denim({ color: 'red' }))).toThrow(/hex/);
    expect(() => createFabricSpec(denim({ color: '#1234' }))).toThrow(/hex/);
    expect(() => createFabricSpec(denim({ color: 'aabbcc' }))).toThrow(/hex/);
  });

  it('accepts 3- and 6-digit hex colors', () => {
    expect(createFabricSpec(denim({ color: '#fff' })).color).toBe('#fff');
    expect(createFabricSpec(denim({ color: '#A1b2C3' })).color).toBe('#A1b2C3');
  });
});

describe('createFabricSpec stripeCm (additive)', () => {
  it('leaves stripeCm undefined when omitted', () => {
    const spec = createFabricSpec(denim());
    expect(spec.stripeCm).toBeUndefined();
  });

  it('keeps a positive stripeCm intact', () => {
    const spec = createFabricSpec(denim({ stripeCm: 0.8 }));
    expect(spec.stripeCm).toBe(0.8);
  });

  it('rejects non-positive stripeCm when present', () => {
    expect(() => createFabricSpec(denim({ stripeCm: 0 }))).toThrow(/> 0/);
    expect(() => createFabricSpec(denim({ stripeCm: -1 }))).toThrow(/> 0/);
    expect(() => createFabricSpec(denim({ stripeCm: Number.NaN }))).toThrow(
      /finite/,
    );
  });
});
