/**
 * The app's core aggregate: a named, measurement-driven pattern project.
 * There is no template enum — a project is whatever the user made and named;
 * starters are data files of the same shape (see StarterProject).
 *
 * `createProject` is the aggregate-root gate: it re-validates nested values
 * through their own factories, so hand-assembled or deserialized input
 * cannot smuggle invalid data past `createPiece`/`createSeamStep`.
 */
import { requireFinite, requireNonEmptyString } from './assert';
import type { FabricSpec } from './fabric';
import { createFabricSpec } from './fabric';
import type { Piece } from './piece';
import { createPiece } from './piece';
import { pathVertexCount } from './path';
import type { SeamStep } from './seam';
import { createSeamStep } from './seam';

export interface Project {
  readonly id: string;
  /** Free text, chosen by the user — deliberately not a template-ID union. */
  readonly name: string;
  /** Provenance: id of the starter project this one began from, if any. */
  readonly basedOn?: string;
  /** Body measurements in centimetres, keyed by measurement name (e.g. "waist"). */
  readonly measurements: Readonly<Record<string, number>>;
  readonly fabric: FabricSpec;
  readonly pieces: readonly Piece[];
  /** Ordered seam list; each step's `order` must be strictly increasing. */
  readonly assembly: readonly SeamStep[];
}

export function createProject(input: Project): Project {
  const id = requireNonEmptyString(input.id, 'project id');
  const name = requireNonEmptyString(input.name, 'project name');
  const basedOn =
    input.basedOn === undefined
      ? undefined
      : requireNonEmptyString(input.basedOn, 'project basedOn');

  const measurements: Record<string, number> = {};
  for (const [key, value] of Object.entries(input.measurements)) {
    const measurementName = requireNonEmptyString(key, 'measurement name');
    measurements[measurementName] = requireFinite(
      value,
      `measurement "${measurementName}"`,
    );
  }

  const fabric = createFabricSpec(input.fabric);
  const pieces = input.pieces.map((piece) => createPiece(piece));

  const pieceIds = pieces.map((piece) => piece.id);
  if (new Set(pieceIds).size !== pieceIds.length) {
    throw new Error('project pieces must have unique ids');
  }

  const assembly = input.assembly.map((step) => createSeamStep(step));
  for (let i = 1; i < assembly.length; i++) {
    if (assembly[i].order <= assembly[i - 1].order) {
      throw new Error(
        `project assembly seam orders must be strictly increasing: step ${i - 1} has order ${assembly[i - 1].order}, step ${i} has order ${assembly[i].order}`,
      );
    }
  }

  const piecesById = new Map(pieces.map((piece) => [piece.id, piece]));
  for (const step of assembly) {
    for (const chain of step.edges) {
      const piece = piecesById.get(chain.pieceId);
      if (!piece) {
        throw new Error(
          `seam step ${step.order} references unknown piece "${chain.pieceId}"`,
        );
      }
      const vertexCount = pathVertexCount(piece.outline);
      if (chain.startVertex + chain.edgeCount > vertexCount) {
        throw new Error(
          `seam step ${step.order}: edge chain on piece "${chain.pieceId}" runs past the outline (${chain.startVertex} + ${chain.edgeCount} > ${vertexCount} vertices)`,
        );
      }
    }
  }

  return Object.freeze({
    id,
    name,
    basedOn,
    measurements: Object.freeze(measurements),
    fabric,
    pieces,
    assembly,
  });
}

/** A starter ships as data — the same shape as any project plus a learn card. */
export interface StarterProject extends Project {
  /** "What you'll learn" card shown as the assembly completes. */
  readonly learnCard: string;
}

export function createStarterProject(
  input: Project & { readonly learnCard: string },
): StarterProject {
  const learnCard = requireNonEmptyString(input.learnCard, 'starter learnCard');
  return Object.freeze({ ...createProject(input), learnCard });
}
