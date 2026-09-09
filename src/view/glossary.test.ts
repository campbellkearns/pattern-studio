/**
 * UX-07 glossary core tests: the dictionary inventory is pinned, the
 * scanner's contract (case-insensitivity, boundaries, inflections,
 * first-use annotation) is exercised, and the narration copy audit runs
 * two-way over the app's REAL copy — every glossary entry must occur in
 * teaching copy (no dead definitions), and the copy's known jargon must be
 * findable where it appears (no unexplained jargon in narration).
 */
import { describe, expect, it } from 'vitest';
import {
  assemblyEntryMessage,
  initialAppState,
  NOTHING_SELECTED_MESSAGE,
  statusText,
} from '../appState';
import { NOTEBOOK_HOLDER_STARTER } from '../data/notebookHolder';
import { STARTERS } from '../data/starters';
import { TOILETRY_ROLLUP_STARTER } from '../data/toiletryRollup';
import { TOTE_STARTER } from '../data/tote';
import { createStarterProject } from '../model';
import { annotateGlossary, findTerms, GLOSSARY } from './glossary';

/** Every user-facing sentence the app ships: starter learn cards, seam
 * notes, and the status-bar copy with real interpolations applied. */
function copyCorpus(): string[] {
  const corpus: string[] = [];
  for (const entry of STARTERS) {
    const project = createStarterProject(entry.build());
    corpus.push(project.learnCard);
    for (const step of project.assembly) corpus.push(step.note);
  }
  corpus.push(NOTHING_SELECTED_MESSAGE);
  const notebook = initialAppState(
    createStarterProject(NOTEBOOK_HOLDER_STARTER),
  );
  const selected = notebook.project.pieces[0]!;
  corpus.push(statusText({ ...notebook, selectedId: selected.id })!);
  // Piece-panel meta (panel.ts) and walkthrough counter (assemblyControls.ts)
  // formats — the interpolated copy shapes that carry terms.
  corpus.push(`cut ${selected.cutCount} · 40.0 × 28.0 cm`);
  corpus.push('Seam 2 of 6 — Rise seam: Front → Back');
  corpus.push(assemblyEntryMessage(6, 'Fly shield seam'));
  corpus.push(assemblyEntryMessage(2, 'Facing seam'));
  corpus.push(assemblyEntryMessage(0));
  return corpus;
}

describe('glossary inventory', () => {
  it('pins the exact term list — additions and removals are conscious', () => {
    expect(GLOSSARY.map((entry) => entry.term)).toEqual([
      'seam',
      'stay-stitch',
      'baste',
      'ease',
      'right sides together',
      'grainline',
      'selvedge',
      'notch',
      'raw edge',
      'facing',
      'press',
      'placket',
      'cut count',
      'lining',
      'webbing',
      'turning corners',
      'rise',
      'box the base',
    ]);
  });

  it('defines every term with a non-empty definition and patterns', () => {
    for (const entry of GLOSSARY) {
      expect(entry.definition.trim()).not.toBe('');
      expect(entry.patterns.length).toBeGreaterThan(0);
    }
  });
});

describe('findTerms', () => {
  it('finds terms case-insensitively and reports their span', () => {
    const text = 'Baste the fly shield first.';
    const matches = findTerms(text);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.entry.term).toBe('baste');
    expect(matches[0]!.matched).toBe('Baste');
    expect(text.slice(matches[0]!.start, matches[0]!.end)).toBe('Baste');
  });

  it('respects word boundaries — no matches inside other words', () => {
    expect(findTerms('This seam is seamless.')).toHaveLength(1); // only "seam"
    expect(findTerms('Increase the tension.')).toHaveLength(0); // "ease" inside
  });

  it('finds inflections: notches, basting, easing, staystitching', () => {
    for (const [text, terms] of [
      ['their notches mark the mouth', ['notch']],
      ['basting holds the pieces', ['baste']],
      ['easing the seam', ['ease', 'seam']],
      ['staystitch the curve', ['stay-stitch']],
      ['stay-stitching the curve', ['stay-stitch']],
    ] as const) {
      expect(findTerms(text).map((m) => m.entry.term)).toEqual([...terms]);
    }
  });

  it('finds multi-word phrases whole', () => {
    const matches = findTerms('Right sides together along the front waist.');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.entry.term).toBe('right sides together');
  });

  it('treats "cut 2" as the cut-count shorthand', () => {
    const matches = findTerms('cut 2 · 40.0 × 28.0 cm');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.entry.term).toBe('cut count');
  });

  it('returns matches in copy order, non-overlapping', () => {
    const matches = findTerms(
      'Sew the side seams next. The notches meet. Press the band.',
    );
    expect(matches.map((m) => m.entry.term)).toEqual([
      'seam',
      'notch',
      'press',
    ]);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i]!.start).toBeGreaterThanOrEqual(matches[i - 1]!.end);
    }
  });
});

describe('annotateGlossary', () => {
  it('chips only the first occurrence of each term (first-use rule)', () => {
    const tokens = annotateGlossary('Sew the seam. Press the seam open.');
    const termTokens = tokens.filter((t) => t.kind === 'term');
    expect(termTokens).toHaveLength(2); // "seam" + "Press", once each
    const seamTokens = tokens.filter(
      (t) => t.kind === 'term' && t.match.entry.term === 'seam',
    );
    expect(seamTokens).toHaveLength(1);
    // The second "seam" survives as plain text between the trailing tokens.
    expect(tokens.at(-1)).toMatchObject({ kind: 'text', value: ' open.' });
  });

  it('suppresses terms already chipped elsewhere on the surface', () => {
    const tokens = annotateGlossary('Sew the seam flat.', new Set(['seam']));
    expect(tokens.filter((t) => t.kind === 'term')).toHaveLength(0);
  });

  it('keeps the full text reconstructable across tokens', () => {
    const text =
      'Stay-stitch both crotch curves before joining — this rise seam sets the fit.';
    const reconstructed = annotateGlossary(text)
      .map((t) => t.value)
      .join('');
    expect(reconstructed).toBe(text);
  });
});

describe('narration copy audit (UX-07): every term taught or linked', () => {
  it('every glossary entry occurs in the app’s real copy — no dead definitions', () => {
    const used = new Set<string>();
    for (const text of copyCorpus()) {
      for (const match of findTerms(text)) used.add(match.entry.term);
    }
    for (const entry of GLOSSARY) {
      expect(used).toContain(entry.term);
    }
  });

  it('the copy’s known jargon is detected where it actually appears', () => {
    // Pants rise note (real data): stay-stitch, the rise, its seam, ease.
    const pantsEntry = STARTERS.find((entry) => entry.id === 'starter-pants')!;
    const pants = createStarterProject(pantsEntry.build());
    expect(findTerms(pants.assembly[1]!.note).map((m) => m.entry.term)).toEqual([
      'stay-stitch',
      'rise',
      'seam',
      'ease',
    ]);

    // Tote facing note: facing and raw edge in one sentence.
    const tote = createStarterProject(TOTE_STARTER);
    expect(findTerms(tote.assembly[0]!.note).map((m) => m.entry.term)).toEqual([
      'facing',
      'raw edge',
    ]);

    // Notebook holder learn card: lining, turning corners, press.
    const learnTerms = findTerms(
      createStarterProject(NOTEBOOK_HOLDER_STARTER).learnCard,
    ).map((m) => m.entry.term);
    expect(learnTerms).toContain('lining');
    expect(learnTerms).toContain('turning corners');
    expect(learnTerms).toContain('press');

    // Tote learn card: webbing and the boxed base.
    const toteLearnTerms = findTerms(
      createStarterProject(TOTE_STARTER).learnCard,
    ).map((m) => m.entry.term);
    expect(toteLearnTerms).toContain('webbing');
    expect(toteLearnTerms).toContain('box the base');
  });

  it('seam names flow into the walkthrough entry narration', () => {
    const toiletry = createStarterProject(TOILETRY_ROLLUP_STARTER);
    const firstName = toiletry.assembly[0]!.name!;
    expect(assemblyEntryMessage(toiletry.assembly.length, firstName)).toBe(
      `Assembly — 2 seams to fold, starting with the ${firstName}. Scrub through them.`,
    );
    expect(
      findTerms(assemblyEntryMessage(6, 'Fly shield seam')).map(
        (m) => m.entry.term,
      ),
    ).toEqual(['seam', 'seam']); // the count and the named first seam
    expect(assemblyEntryMessage(0)).toBe(
      'Assembly — 0 seams to fold. Scrub through them.',
    );
  });
});
