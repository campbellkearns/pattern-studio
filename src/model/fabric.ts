/**
 * Procedural fabric material parameters. The renderer derives weave textures
 * from these; each piece's grainline rotates the texture transform so the
 * weave runs true to grain. That grainline coupling — physical weave scale
 * anchored in centimetres plus per-piece rotation — is what makes a
 * FabricSpec grainline-aware rather than just a color swatch.
 */
import { requirePositive } from './assert';

export type WeaveType = 'plain' | 'twill' | 'satin';

export interface FabricSpec {
  readonly weave: WeaveType;
  /** Centimetres of fabric per weave repeat — anchors texture scale to physical cm. */
  readonly weaveScale: number;
  /** Hex color: `#rgb` or `#rrggbb`. */
  readonly color: string;
  /** Fabric weight in grams per square metre (gsm). */
  readonly weight: number;
  /**
   * Colored warp-stripe band width in centimetres; undefined = solid colour.
   * Stripes run along the grainline — the visual proof that each piece's
   * grainline-locked UVs rotate the weave true to grain.
   */
  readonly stripeCm?: number;
}

const WEAVE_TYPES: readonly WeaveType[] = ['plain', 'twill', 'satin'];
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * The hex rule every color field in the model shares (`#rgb` or `#rrggbb`).
 * UX-12 reuses it for thread colors so a swatch is valid everywhere or
 * nowhere — one rule, not two callers' worth of drift.
 */
export function requireHexColor(color: string, label = 'fabric color'): string {
  if (!HEX_COLOR.test(color)) {
    throw new Error(
      `${label} must be a hex string like "#a1b2c3", got "${color}"`,
    );
  }
  return color;
}

export function createFabricSpec(input: FabricSpec): FabricSpec {
  if (!WEAVE_TYPES.includes(input.weave)) {
    throw new Error(
      `fabric weave must be one of ${WEAVE_TYPES.join(' | ')}, got "${String(input.weave)}"`,
    );
  }
  const color = requireHexColor(input.color);
  return Object.freeze({
    weave: input.weave,
    weaveScale: requirePositive(input.weaveScale, 'fabric weaveScale'),
    color,
    weight: requirePositive(input.weight, 'fabric weight'),
    // Additive optional parameter: only validated when present.
    stripeCm:
      input.stripeCm === undefined
        ? undefined
        : requirePositive(input.stripeCm, 'fabric stripeCm'),
  });
}
