/**
 * UX-06 five-token design system (UD1: 'clean technical precision').
 *
 * The five tokens are defined once, verbatim, as CSS custom properties in
 * src/style.css (:root). This module re-exports the same verbatim values
 * for the WebGL scenes, which cannot read CSS variables — keep the two in
 * lockstep; tokens.test.ts guards the contract.
 *
 * Derived values below stay inside the five hues (same hue, lightness
 * adjusted — the PRD's stated WCAG path) plus two documented neutrals
 * (near-black body ink, paper white). Measured ratios live in the PR.
 */

/** Cobalt Blue — brand header, primary buttons, major contour lines. */
export const COBALT_BLUE = '#1A40B0';
/** Blueprint Tint — drafting workspace, cool technical atmosphere. */
export const BLUEPRINT_TINT = '#E8EEF9';
/** Cutting Mat Green — status badges, verified measurements, seam checks. */
export const CUTTING_MAT_GREEN = '#105B43';
/** Drafting Amber — warning flags, notch highlights, balance alerts. */
export const DRAFTING_AMBER = '#F59E0B';
/** Grid Azure — technical grid lines, bounding boxes, card dividers. */
export const GRID_AZURE = '#94AEDB';

/**
 * Amber darkened within its hue for small text and thin state borders
 * (raw #F59E0B fails AA at 2.15:1 on white): 7.35:1 on Tint, 8.56:1 on
 * white.
 */
export const AMBER_INK = '#6B4400';

/**
 * Azure darkened within its hue for component borders, which must clear
 * WCAG 1.4.11's 3:1 (raw #94AEDB measures 2.25:1 on white): 5.29:1 on
 * white, 4.54:1 on Tint. Pure Azure stays for decorative grid/dividers.
 */
export const AZURE_LINE = '#4F6C9E';

/**
 * Hover/select piece-glow targets, old-emissive visual weight preserved:
 * dark amber (h≈38) and dark cobalt (h≈225) respectively.
 */
export const HOVER_EMISSIVE = '#573804';
export const SELECT_EMISSIVE = '#192A5C';

/**
 * Documented neutrals: near-black body ink (14.33:1 on Tint) and paper
 * white (also the text color on Cobalt/Mat Green fills). The sun light is
 * pure white — light, not a surface color.
 */
export const BODY_INK = '#1B1E24';
export const PAPER = '#FFFFFF';

/**
 * The WebGL scene palette: every color the two views paint, mapped onto
 * the five tokens (+ documented neutrals). Nothing here may introduce a
 * sixth hue.
 */
export const SCENE = {
  /** Backdrop of both the cutting mat and the assembly stage. */
  background: BLUEPRINT_TINT,
  /** Sky bounce reads as the tinted drafting-room air. */
  hemiSky: BLUEPRINT_TINT,
  /** Ground bounce echoes the azure grid — cool technical atmosphere. */
  hemiGround: GRID_AZURE,
  /** Neutral key light for 'clean technical precision' (not warm). */
  sun: PAPER,
  /** Piece outlines: the pattern's major contours. */
  outline: COBALT_BLUE,
  /** Internal marks (notches, drill points): soft technical annotation. */
  marks: GRID_AZURE,
  /** Hover = transient attention (amber highlight). */
  hoverHighlight: DRAFTING_AMBER,
  /** Selection = committed choice (cobalt, matching the panels). */
  selectHighlight: COBALT_BLUE,
  /** The current seam in the assembly walkthrough: a seam check. */
  seam: CUTTING_MAT_GREEN,
  hoverEmissive: HOVER_EMISSIVE,
  selectEmissive: SELECT_EMISSIVE,
  /**
   * Workroom table top (UX-04): Blueprint Tint deepened 62% toward Grid
   * Azure — a lerp of two tokens stays inside their shared hue ramp, so
   * the workroom adds no sixth hue. The mat's cool green reads against it
   * as resting on a surface instead of floating in the backdrop.
   */
  tableTop: '#B4C6E6',
  /** Table edge/apron faces: tableTop deepened 40% toward Azure Line. */
  tableEdge: '#8CA2C9',
} as const;
