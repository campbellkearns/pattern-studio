/**
 * UX-07 glossary core: the sewing vocabulary the app's copy actually uses,
 * plus the pure machinery that finds terms in copy and decides where the
 * inline affordance appears. No DOM here — the chip/popover layer lives in
 * glossaryDom.ts, which renders these tokens.
 *
 * The vocabulary rule (PRD): every sewing term in user-facing copy is either
 * taught in place by the copy itself or chip-linked to a definition below.
 * glossary.test.ts audits this two-way: each entry must occur in real app
 * copy (no dead definitions), and the scanner must find every term the copy
 * uses (no unexplained jargon).
 */

export interface GlossaryEntry {
  /** Canonical display form, e.g. "stay-stitch". */
  readonly term: string;
  /** The beginner definition the popover shows. Short, jargon-free. */
  readonly definition: string;
  /**
   * Case-insensitive regex sources matching this term's inflections in copy
   * ("stay-?stitch(ed|ing)?"). The scanner supplies the word boundaries.
   */
  readonly patterns: readonly string[];
}

/** The app's sewing vocabulary, curated against the copy audit. */
export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: 'seam',
    definition:
      'The line where two pieces of fabric are sewn together — "Seam 2 of 6" ' +
      'is the second join in the build order.',
    patterns: ['seams?'],
  },
  {
    term: 'stay-stitch',
    definition:
      'A straight row of stitching sewn just inside the seam line, keeping ' +
      'curves from stretching out of shape before they are joined.',
    patterns: ['stay-?stitch(ed|ing)?'],
  },
  {
    term: 'baste',
    definition:
      'Long, temporary stitches that hold pieces together. Basting is removed ' +
      'or replaced by the real seam later.',
    patterns: ['bast(e|es|ed|ing)'],
  },
  {
    term: 'ease',
    definition:
      'Joining two edges of slightly different length by spreading the extra ' +
      'fullness evenly along the seam — no puckers, no stretching.',
    patterns: ['eas(e|es|ed|ing)'],
  },
  {
    term: 'right sides together',
    definition:
      'Placing two pieces so their outer faces touch each other; the seam ' +
      'then ends up hidden on the inside.',
    patterns: ['right sides together'],
  },
  {
    term: 'grainline',
    definition:
      'The arrow printed on a pattern piece showing how it must lie on the ' +
      'fabric — parallel to the selvedge unless told otherwise.',
    patterns: ['grainlines?'],
  },
  {
    term: 'selvedge',
    definition:
      "The factory-finished lengthwise edge of the fabric (spelled selvage in " +
      "the US). It doesn't fray; keep pieces clear of it when cutting.",
    patterns: ['selvedges?', 'selvages?'],
  },
  {
    term: 'notch',
    definition:
      "A small mark on a piece's edge. Matching notches must meet when you " +
      'sew the seam — they show how the pieces align.',
    patterns: ['notch(es|ed)?'],
  },
  {
    term: 'raw edge',
    definition:
      'A freshly cut fabric edge that could fray. Seams or bindings hide raw ' +
      'edges inside the finished project.',
    patterns: ['raw edges?'],
  },
  {
    term: 'facing',
    definition:
      "A strip that sews to an opening's edge and folds to the inside, " +
      "binding the raw edge — like the tote's top facing.",
    patterns: ['facings?'],
  },
  {
    term: 'press',
    definition:
      'Lifting the iron up and down onto the seam to flatten it — unlike ' +
      'ironing, which slides and can stretch the fabric.',
    patterns: ['press(es|ed|ing)?'],
  },
  {
    term: 'placket',
    definition:
      'The layered fabric band behind an opening such as a button fly or ' +
      'cuff.',
    patterns: ['plackets?'],
  },
  {
    term: 'cut count',
    definition:
      'Pattern shorthand for how many of this piece to cut from the fabric — ' +
      '"cut 2" means cut two.',
    patterns: ['cut\\s+\\d+'],
  },
  {
    term: 'lining',
    definition:
      'A fabric layer sewn inside the project to cover the seams and give a ' +
      'clean finish.',
    patterns: ['linings?'],
  },
  {
    term: 'webbing',
    definition:
      'Strong woven strap used for handles and ties. It is cut by length, so ' +
      'it has no pattern piece.',
    patterns: ['webbing'],
  },
  {
    term: 'turning corners',
    definition:
      'Sewing neatly across the point where two edges meet: stop with the ' +
      'needle down, pivot the fabric, continue.',
    patterns: ['turn(ing)? corners?'],
  },
  {
    term: 'rise',
    definition:
      'The curved seam from front to back between the legs. Fitting the rise ' +
      'first sets how the pants sit.',
    patterns: ['rise'],
  },
  {
    term: 'box the base',
    definition:
      'Bag-making term: folding and pressing flat pieces so the bottom holds ' +
      'a three-dimensional box shape.',
    patterns: [
      'box(?:es|ed)?\\s+(?:the\\s+)?(?:bottom|base)',
      'become a box',
      'into a box',
    ],
  },
];

export interface GlossaryMatch {
  readonly entry: GlossaryEntry;
  /** The text as it appears in the copy, e.g. "Stay-stitch". */
  readonly matched: string;
  readonly start: number;
  readonly end: number;
}

/** Entries compiled once: word-boundaried, case-insensitive matchers. */
const COMPILED = GLOSSARY.map((entry) => ({
  entry,
  regexes: entry.patterns.map(
    (source) => new RegExp(`\\b(?:${source})\\b`, 'gi'),
  ),
}));

/**
 * All glossary terms in `text`, left to right, non-overlapping. When two
 * entries' matches claim the same span, the longer match wins, so a future
 * multi-word entry would shadow the shorter term inside it.
 */
export function findTerms(text: string): GlossaryMatch[] {
  const candidates: GlossaryMatch[] = [];
  for (const { entry, regexes } of COMPILED) {
    for (const regex of regexes) {
      regex.lastIndex = 0;
      for (
        let match = regex.exec(text);
        match !== null;
        match = regex.exec(text)
      ) {
        candidates.push({
          entry,
          matched: match[0],
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }
  }
  candidates.sort(
    (a, b) =>
      a.start - b.start ||
      b.end - b.start - (a.end - a.start) ||
      GLOSSARY.indexOf(a.entry) - GLOSSARY.indexOf(b.entry),
  );
  const accepted: GlossaryMatch[] = [];
  let lastEnd = -1;
  for (const match of candidates) {
    if (match.start < lastEnd) continue;
    accepted.push(match);
    lastEnd = match.end;
  }
  return accepted;
}

export type GlossaryToken =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'term'; readonly value: string; readonly match: GlossaryMatch };

/**
 * Split copy into text/term tokens. The first-use rule: only the first
 * occurrence of each entry in this text carries the affordance — later
 * occurrences stay plain text. `seen` suppresses terms already chipped
 * elsewhere on the same surface.
 */
export function annotateGlossary(
  text: string,
  seen: ReadonlySet<string> = new Set<string>(),
): GlossaryToken[] {
  const tokens: GlossaryToken[] = [];
  const firstUse = new Set<string>();
  let cursor = 0;
  for (const match of findTerms(text)) {
    if (match.start > cursor) {
      tokens.push({ kind: 'text', value: text.slice(cursor, match.start) });
    }
    if (firstUse.has(match.entry.term) || seen.has(match.entry.term)) {
      tokens.push({ kind: 'text', value: match.matched });
    } else {
      firstUse.add(match.entry.term);
      tokens.push({ kind: 'term', value: match.matched, match });
    }
    cursor = match.end;
  }
  if (cursor < text.length) {
    tokens.push({ kind: 'text', value: text.slice(cursor) });
  }
  return tokens;
}
