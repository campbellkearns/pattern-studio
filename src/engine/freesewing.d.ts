/**
 * Ambient declarations for the FreeSewing 4.10.1 packages the engine adapter
 * uses. The upstream packages ship no TypeScript types (their package.json
 * has no `types` field), so the boundary surface is declared here — narrowly:
 * only what src/engine consumes, typed strictly on this side.
 *
 * Behaviour contract comes from docs/spike-freesewing.md (D2 spike):
 * - Design constructors take ONE variadic settings object — never a nested
 *   array (a nested array silently drafts with empty measurements).
 * - `pattern.parts` is keyed first by settings-set index, then by part name
 *   (`titan.back` / `titan.front`).
 * - `pattern.draft()`/`pattern.render()` are synchronous and DOM-free; only
 *   three.js's SVGLoader needs a DOMParser.
 *
 * This file must stay a script (no top-level imports/exports) so its
 * `declare module` blocks are ambient, not augmentations.
 */

type FreeSewingMeasurements = Record<string, number>;

/** Option values as the draft consumes them: fractions (pct/100) or degrees. */
type FreeSewingOptions = Record<string, number | string | boolean>;

interface FreeSewingSettings {
  measurements?: FreeSewingMeasurements;
  options?: FreeSewingOptions;
  [key: string]: unknown;
}

interface FreeSewingPoint {
  readonly x: number;
  readonly y: number;
}

/** A drafted FreeSewing path: bounding box plus macro metadata, in mm. */
interface FreeSewingPartPath {
  readonly topLeft?: FreeSewingPoint;
  readonly bottomRight?: FreeSewingPoint;
}

/** A drafted part: paths and snippets keyed by name. */
interface FreeSewingPart {
  readonly paths: Record<string, FreeSewingPartPath>;
  readonly snippets: Record<string, unknown>;
}

interface FreeSewingPlugin {
  readonly name: string;
  [key: string]: unknown;
}

declare module '@freesewing/titan' {
  export class Titan {
    constructor(settings?: FreeSewingSettings);
    use(plugin: FreeSewingPlugin): void;
    draft(): void;
    render(): string;
    /** Keyed by settings-set index, then by design part name. */
    readonly parts: Record<string, Record<string, FreeSewingPart>>;
  }
}

declare module '@freesewing/plugin-measurements' {
  export const measurementsPlugin: FreeSewingPlugin;
}

declare module '@freesewing/models' {
  /** Published size-40 adult male model, in millimetres. */
  export const cisMaleAdult40: Record<string, number>;
}
