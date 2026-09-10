/**
 * The curated blank (UX-08): the project step's non-starter choice. It is
 * not a rung on the starter ladder — it is the "start from nothing, but
 * never a void" option: a valid, fully validated project with zero pieces,
 * so the mat's panels (piece list, legend, measurements) show their own
 * narrated empty states and every tool keeps working. Fresh instance per
 * call, same convention as the starters' build().
 */
import { createProject } from '../model';
import type { Project } from '../model';

export const CURATED_BLANK_ID = 'curated-blank';

/** A fresh, validated blank project — plain azure fabric, nothing cut. */
export function curatedBlankProject(): Project {
  return createProject({
    id: CURATED_BLANK_ID,
    name: 'Blank pattern',
    measurements: {},
    fabric: {
      weave: 'plain',
      weaveScale: 0.12,
      color: '#94AEDB',
      weight: 150,
    },
    pieces: [],
    assembly: [],
  });
}
