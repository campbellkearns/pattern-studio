import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AMBER_INK,
  AZURE_LINE,
  BLUEPRINT_TINT,
  BODY_INK,
  COBALT_BLUE,
  CUTTING_MAT_GREEN,
  DRAFTING_AMBER,
  GRID_AZURE,
  HOVER_EMISSIVE,
  PAPER,
  SCENE,
  SELECT_EMISSIVE,
} from './tokens';

/**
 * UX-06 contract: five tokens, verbatim, defined once as CSS custom
 * properties in style.css :root and re-exported here for the WebGL scenes.
 * If either side drifts, the two halves of the design system diverge.
 */

const FIVE_TOKENS = [
  ['--cobalt', '#1A40B0', COBALT_BLUE],
  ['--tint', '#E8EEF9', BLUEPRINT_TINT],
  ['--mat-green', '#105B43', CUTTING_MAT_GREEN],
  ['--amber', '#F59E0B', DRAFTING_AMBER],
  ['--azure', '#94AEDB', GRID_AZURE],
] as const;

const styleCss = readFileSync(join(process.cwd(), 'src/style.css'), 'utf8');

describe('five-token design system (UX-06)', () => {
  it.each(FIVE_TOKENS)('exports %s verbatim as %s', (_cssName, hex, value) => {
    expect(value).toBe(hex);
  });

  it.each(FIVE_TOKENS)(
    'declares %s with the same verbatim value in style.css :root',
    (cssName, hex) => {
      expect(styleCss).toMatch(new RegExp(`${cssName}:\\s*${hex}\\s*;`));
    },
  );

  it('retires every PR #11 premium color literal from style.css', () => {
    const retired = [
      '#171b1f',
      '#21262c',
      '#2a313a',
      '#313a45',
      '#3a434d',
      '#e9eef3',
      '#9aa8b5',
      '#6d7a87',
      '#ffd166',
      '#e5484d',
      '#5bb98c',
      '#f2a0a3',
      '#97a4b1',
      '#3d4a5c',
    ];
    for (const hex of retired) {
      expect(styleCss.toLowerCase()).not.toContain(hex);
    }
  });

  it('maps the WebGL scene palette onto the five tokens', () => {
    expect(SCENE.background).toBe(BLUEPRINT_TINT);
    expect(SCENE.hemiSky).toBe(BLUEPRINT_TINT);
    expect(SCENE.hemiGround).toBe(GRID_AZURE);
    expect(SCENE.outline).toBe(COBALT_BLUE);
    expect(SCENE.marks).toBe(GRID_AZURE);
    expect(SCENE.hoverHighlight).toBe(DRAFTING_AMBER);
    expect(SCENE.selectHighlight).toBe(COBALT_BLUE);
    expect(SCENE.seam).toBe(CUTTING_MAT_GREEN);
  });

  it('keeps scene extras within documented variants and neutrals', () => {
    expect(SCENE.sun).toBe(PAPER);
    expect(SCENE.hoverEmissive).toBe(HOVER_EMISSIVE);
    expect(SCENE.selectEmissive).toBe(SELECT_EMISSIVE);
    expect(PAPER).toBe('#FFFFFF');
    expect(BODY_INK).toBe('#1B1E24');
    expect(AMBER_INK).toBe('#6B4400');
    expect(AZURE_LINE).toBe('#4F6C9E');
  });

  it('derives the workroom table inside its stated token ramps (UX-04)', () => {
    // A derivation introduces no sixth hue when every RGB channel stays
    // within the span of the two colors it lerps — pin exactly that.
    const channels = (hex: string): number[] =>
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const withinRamp = (hex: string, a: string, b: string): boolean => {
      const c = channels(hex);
      return c.every(
        (v, i) =>
          v >= Math.min(channels(a)[i], channels(b)[i]) &&
          v <= Math.max(channels(a)[i], channels(b)[i]),
      );
    };
    // tableTop: Blueprint Tint deepened toward Grid Azure.
    expect(withinRamp(SCENE.tableTop, BLUEPRINT_TINT, GRID_AZURE)).toBe(true);
    // tableEdge: tableTop deepened toward Azure Line.
    expect(withinRamp(SCENE.tableEdge, SCENE.tableTop, AZURE_LINE)).toBe(true);
  });
});
