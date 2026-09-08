/**
 * Project persistence — JSON serialization and localStorage storage (F7).
 *
 * The trust boundary: stored JSON is never trusted. `parseProject` routes
 * everything through `createProject`, the same aggregate-root gate that
 * validates hand-assembled data, so corrupted or hostile storage cannot
 * produce an invalid domain object. Failures are values (`ParseResult` /
 * `StoredProject`), never silent — callers narrate them.
 *
 * Pure module: no DOM. `Storage` is injected so callers pass
 * `window.localStorage` and tests pass a fake.
 */
import { createProject } from '../model';
import type { Project } from '../model';

/** Where the working project is saved in this browser. */
export const STORAGE_KEY = 'pattern-studio.project';

export type ParseResult =
  | { readonly status: 'ok'; readonly project: Project }
  | { readonly status: 'invalid'; readonly reason: string };

/** Outcome of reading the saved project from a storage. */
export type StoredProject =
  | { readonly status: 'found'; readonly project: Project }
  | { readonly status: 'empty' }
  | { readonly status: 'invalid'; readonly reason: string };

/**
 * Serialize a project to JSON. Files and devtools benefit from the
 * pretty form; share links use `compact` because whitespace inflates URLs.
 */
export function serializeProject(
  project: Project,
  format: 'pretty' | 'compact' = 'pretty',
): string {
  return JSON.stringify(project, null, format === 'compact' ? undefined : 2);
}

/**
 * Parse and validate a JSON project string. Anything that fails the model's
 * invariants — malformed JSON, wrong shape, NaN coordinates, duplicate ids —
 * comes back as `invalid` with the reason, never as a half-validated project.
 */
export function parseProject(json: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    return {
      status: 'invalid',
      reason: `not valid JSON (${error instanceof Error ? error.message : String(error)})`,
    };
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { status: 'invalid', reason: 'project must be a JSON object' };
  }
  try {
    return { status: 'ok', project: createProject(data as Project) };
  } catch (error) {
    return {
      status: 'invalid',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Save the working project. Throws on storage failure (quota, private mode) — narrate, don't swallow. */
export function saveProject(storage: Storage, project: Project): void {
  storage.setItem(STORAGE_KEY, serializeProject(project));
}

/** Read the saved project; `empty` when nothing was ever saved. */
export function loadProject(storage: Storage): StoredProject {
  const json = storage.getItem(STORAGE_KEY);
  if (json === null) return { status: 'empty' };
  const parsed = parseProject(json);
  return parsed.status === 'ok'
    ? { status: 'found', project: parsed.project }
    : { status: 'invalid', reason: parsed.reason };
}
