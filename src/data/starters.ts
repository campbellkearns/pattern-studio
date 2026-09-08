/**
 * The starter registry (blueprint starter ladder): every selectable starter
 * in one place, each able to build a fresh validated StarterProject and to
 * redraft its pieces at arbitrary measurements. The app shell reads this
 * list — adding a starter is a data change, not an app-shell change.
 *
 * redraft() semantics per entry:
 * - Notebook holder: the M2 parametric redraft (measurements drive Titan
 *   legs on top of the hand-authored starter — main's behavior, kept).
 * - Toiletry rollup / Tote: fixed-size starters (the blueprint's starter
 *   spec defines no dimensions for these rungs) — redraft ignores the
 *   measurements and returns a fresh copy of the same fixed pieces.
 * - Pants: the full pants set — adapter legs plus the measurement-sized
 *   auxiliaries, so the waistband/fly shield/pocket bag track the panel.
 */
import { createStarterProject } from '../model';
import type { Piece, Project, StarterProject } from '../model';
import { redraftPants } from '../engine/titanPants';
import type { PantMeasurements } from '../engine/titanSettings';
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
  /** Pieces for the live redraft at the given measurements. */
  readonly redraft: (measurements: PantMeasurements) => readonly Piece[];
}

export const STARTERS: readonly StarterEntry[] = [
  {
    id: 'starter-notebook-holder',
    name: 'Notebook holder',
    build: () => createStarterProject(NOTEBOOK_HOLDER_STARTER),
    redraft: (measurements) => redraftPants(measurements),
  },
  {
    id: 'starter-toiletry-rollup',
    name: 'Toiletry rollup',
    build: () => createStarterProject(TOILETRY_ROLLUP_STARTER),
    redraft: () => createStarterProject(TOILETRY_ROLLUP_STARTER).pieces,
  },
  {
    id: 'starter-tote',
    name: 'Tote',
    build: () => createStarterProject(TOTE_STARTER),
    redraft: () => createStarterProject(TOTE_STARTER).pieces,
  },
  {
    id: 'starter-pants',
    name: 'Pants',
    build: () => pantsStarter(),
    redraft: (measurements) => redraftPantsStarter(measurements),
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
