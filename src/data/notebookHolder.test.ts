import { describe, expect, it } from 'vitest';
import { createStarterProject } from '../model';
import { NOTEBOOK_HOLDER_STARTER } from './notebookHolder';

describe('notebook holder starter', () => {
  it('passes the full aggregate validation gate', () => {
    const project = createStarterProject(NOTEBOOK_HOLDER_STARTER);
    expect(project.id).toBe('starter-notebook-holder');
    expect(project.pieces).toHaveLength(3);
    expect(project.learnCard).toMatch(/learn/i);
  });

  it('has unique piece ids and closed outlines', () => {
    const { pieces } = NOTEBOOK_HOLDER_STARTER;
    const ids = pieces.map((piece) => piece.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const piece of pieces) {
      expect(piece.outline[piece.outline.length - 1]?.type).toBe('Z');
      expect(piece.outline[0]?.type).toBe('M');
    }
  });

  it('covers the blueprint starter ladder: notebook holder first', () => {
    expect(NOTEBOOK_HOLDER_STARTER.name).toBe('Notebook holder');
    // Assembly arrives with M3; M1 ships pieces + mat only.
    expect(NOTEBOOK_HOLDER_STARTER.assembly).toHaveLength(0);
  });

  it('pieces carry grainlines, marks, and cut counts', () => {
    const { pieces } = NOTEBOOK_HOLDER_STARTER;
    const cover = pieces.find((piece) => piece.id === 'cover');
    const pocket = pieces.find((piece) => piece.id === 'pocket');
    expect(cover?.cutCount).toBe(1);
    expect(pocket?.cutCount).toBe(2);
    for (const piece of pieces) {
      expect(piece.internal.length).toBeGreaterThan(0);
      expect(piece.seamAllowance).toBeGreaterThan(0);
    }
  });
});
