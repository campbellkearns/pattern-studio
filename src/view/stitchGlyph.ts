/**
 * Stitch glyph geometry (UX-12): the mark a stitch type draws along a seam
 * chain. Pure — points in, points out — so the geometry is unit-tested
 * without WebGL and both views share one definition; the views only wrap
 * it in materials and buffers.
 *
 * Glyphs (wave spec): straight = the chain polyline itself (solid line);
 * zigzag = the chain resampled into a chevron alternating across it;
 * backstitch = the chain polyline drawn with a long-dash material — the
 * dash pattern is the glyph, so the geometry is unchanged.
 *
 * Points are 2-D in the seam's own plane. The assembly view maps its
 * world chains (y = 0) into the plane; the mat view maps piece-local
 * domain coordinates. Either way the cross direction is the in-plane
 * perpendicular, so the glyph lies flat on the fabric.
 */
import type { StitchType, Vec2 } from '../model';
import { distance, vec2 } from '../model';

/** Stitch a seam without design fields draws (pre-UX-12 seams). */
export const DEFAULT_STITCH: StitchType = 'straight';

/** Zigzag repeat along the chain, in centimetres. */
export const ZIGZAG_PERIOD_CM = 2.0;
/** Zigzag half-width either side of the chain, in centimetres. */
export const ZIGZAG_AMPLITUDE_CM = 0.5;
/** Backstitch dash length, in centimetres (LineDashedMaterial). */
export const BACKSTITCH_DASH_CM = 2.6;
/** Backstitch gap between dashes, in centimetres. */
export const BACKSTITCH_GAP_CM = 1.1;

/**
 * The glyph polyline for a stitch along a chain. Straight and backstitch
 * return the chain unchanged (their look is the line style, not the
 * geometry); zigzag re-samples the chain into chevrons.
 */
export function stitchChainPoints(
  stitch: StitchType,
  chain: readonly Vec2[],
): readonly Vec2[] {
  if (stitch === 'zigzag') return zigzagAlong(chain);
  return chain;
}

/**
 * Resample a polyline into a zigzag: interior vertices alternate across
 * the chain every half period, and both endpoints stay ON the chain so
 * the seam still meets piece corners exactly. Curved chains are followed
 * — sampling walks arc length, so the chevrons track the seam's bend.
 */
export function zigzagAlong(
  chain: readonly Vec2[],
  periodCm: number = ZIGZAG_PERIOD_CM,
  amplitudeCm: number = ZIGZAG_AMPLITUDE_CM,
): Vec2[] {
  if (chain.length < 2) return [...chain];
  const cumulative: number[] = [0];
  for (let i = 1; i < chain.length; i++) {
    cumulative.push(cumulative[i - 1] + distance(chain[i - 1], chain[i]));
  }
  const total = cumulative[cumulative.length - 1];
  if (total <= 0) return [...chain];

  const samples = Math.max(2, Math.ceil(total / (periodCm / 2)));
  const out: Vec2[] = [];
  for (let i = 0; i <= samples; i++) {
    const s = (i / samples) * total;
    const { point, tangent } = sampleChain(chain, cumulative, s);
    if (i === 0 || i === samples) {
      out.push(point);
      continue;
    }
    // In-plane perpendicular of the unit tangent: a quarter turn.
    const perp = vec2(-tangent.y, tangent.x);
    const side = i % 2 === 0 ? -1 : 1;
    out.push(
      vec2(
        point.x + perp.x * amplitudeCm * side,
        point.y + perp.y * amplitudeCm * side,
      ),
    );
  }
  return out;
}

/** Point and unit tangent at arc length s along the chain. */
function sampleChain(
  chain: readonly Vec2[],
  cumulative: readonly number[],
  s: number,
): { point: Vec2; tangent: Vec2 } {
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i] < s) i++;
  const start = chain[i - 1];
  const end = chain[i];
  const segLength = cumulative[i] - cumulative[i - 1];
  const t = segLength > 0 ? (s - cumulative[i - 1]) / segLength : 0;
  const point = vec2(
    start.x + (end.x - start.x) * t,
    start.y + (end.y - start.y) * t,
  );
  // A zero-length segment (degenerate edge) has no direction; any unit
  // tangent keeps the zigzag finite — the perpendicular offset dominates.
  const tangent =
    segLength > 0
      ? vec2((end.x - start.x) / segLength, (end.y - start.y) / segLength)
      : vec2(1, 0);
  return { point, tangent };
}
