/**
 * The starter registry (blueprint starter ladder): every selectable starter
 * in one place, each able to build a fresh validated StarterProject, to
 * declare its own adjustable parameters (UX-03), and — when it has any — to
 * redraft its pieces at given parameter values. The app shell reads this
 * list: adding a starter is a data change, not an app-shell change, and the
 * measurements panel renders exactly the active starter's schema.
 *
 * Parameters/redraft semantics per entry:
 * - Pants: the full pants set — adapter legs plus the measurement-sized
 *   auxiliaries; its eight declared parameters redraft everything live.
 * - Notebook holder / Toiletry rollup / Tote: no adjustable parameters —
 *   hand-authored or fixed-size starters (the blueprint's starter spec
 *   defines no dimensions for these rungs). The measurements panel shows
 *   its narrated empty state and the pieces never change; in particular
 *   the notebook holder no longer pretends to drive Titan legs (the
 *   pre-UX-03 mis-wiring this ticket removes).
 */
import { createStarterProject, EMPTY_PARAMETERS } from '../model';
import type {
  ParameterSchema,
  ParameterValues,
  Piece,
  Project,
  SeamStep,
  StarterProject,
} from '../model';
import { PANTS_PARAMETERS, toPantMeasurements } from '../engine/titanSettings';
import { NOTEBOOK_HOLDER_STARTER } from './notebookHolder';
import { TOILETRY_ROLLUP_STARTER } from './toiletryRollup';
import { TOTE_STARTER } from './tote';
import { pantsStarter, redraftPantsStarter } from './pantsStarter';

export interface StarterEntry {
  /** Stable starter id — matches the StarterProject's id and saved projects. */
  readonly id: string;
  /** Picker label. */
  readonly name: string;
  /** A fresh, validated starter instance (never hand the same object twice). */
  readonly build: () => StarterProject;
  /** This starter's declared adjustable parameters — the measurements
   * panel renders exactly these, and nothing else. */
  readonly parameters: ParameterSchema;
  /** Live redraft at the given parameter values. Present exactly when
   * parameters is non-empty (registry invariant, tested); returns the
   * redrafted piece set. */
  readonly redraft?: (values: ParameterValues) => readonly Piece[];
  /** Draft-and-resolve in one call for starters whose seam chains depend
   * on the draft's geometry (pants): returns the fresh pieces AND the
   * assembly resolved from that same draft, so a redraft never leaves
   * stale chain indices behind. Present exactly when redraft is, and
   * every piece redraft() returns is a piece this returns — callers that
   * want assembly-aware redrafting prefer this over redraft. */
  readonly redraftAssembly?: (values: ParameterValues) => {
    readonly pieces: readonly Piece[];
    readonly assembly?: readonly SeamStep[];
  };
}

export const STARTERS: readonly StarterEntry[] = [
  {
    id: 'starter-notebook-holder',
    name: 'Notebook holder',
    build: () => createStarterProject(NOTEBOOK_HOLDER_STARTER),
    parameters: EMPTY_PARAMETERS,
  },
  {
    id: 'starter-toiletry-rollup',
    name: 'Toiletry rollup',
    build: () => createStarterProject(TOILETRY_ROLLUP_STARTER),
    parameters: EMPTY_PARAMETERS,
  },
  {
    id: 'starter-tote',
    name: 'Tote',
    build: () => createStarterProject(TOTE_STARTER),
    parameters: EMPTY_PARAMETERS,
  },
  {
    id: 'starter-pants',
    name: 'Pants',
    build: () => pantsStarter(),
    parameters: PANTS_PARAMETERS,
    redraft: (values) => redraftPantsStarter(toPantMeasurements(values)).pieces,
    redraftAssembly: (values) =>
      redraftPantsStarter(toPantMeasurements(values)),
  },
];

/** Registry entry for a live project's id, if it is (based on) a starter. */
export function starterById(id: string): StarterEntry | undefined {
  return STARTERS.find((entry) => entry.id === id);
}

/** Type guard helper for callers that only need the Project shape. */
export function isStarterProject(project: Project): project is StarterProject {
  return 'learnCard' in project;
}
