import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from './app';
import { curatedBlankProject } from './data/curatedBlank';
import { STARTERS } from './data/starters';
import { saveProject } from './io/projectIo';
import { planShare } from './io/shareLink';

// jsdom's canvas cannot produce a WebGL 2 context, so the default mount
// path dead-ends at the unsupported screen before any shell exists. The
// flag flips per suite: the first suite pins the gate itself; the entry
// suite mounts the real shell with three.js faked at the viewport seam
// (the DOM wiring under test — entry flow, toolbar, narration — runs for
// real; scene rendering is browser-dogfooded, not unit-tested).
const webglState = vi.hoisted(() => ({ available: false }));
vi.mock('./view/webgl', () => ({
  supportsWebGL2: () => webglState.available,
}));
vi.mock('./view/viewport', () => ({
  createViewport: () => ({
    dispose: () => {},
    refresh: () => {},
    updatePieces: () => {},
    applyFabric: () => {},
    applyPreset: () => {},
    refit: () => {},
    pieceScreenPositions: () => [],
  }),
}));

// The assembly scene is faked at the same seam: the walkthrough's DOM bar is
// real, but no WebGL runs in jsdom. The fake plan mirrors the project's real
// assembly steps so the shell's labels and entry narration are exercised
// with the data it would actually show.
vi.mock('./view/assemblyView', () => ({
  createAssemblyView: (options: {
    project: { assembly: readonly unknown[] };
  }) => ({
    plan: { steps: options.project.assembly.map((step) => ({ step })) },
    setScrub: () => {},
    applyFabric: () => {},
    preFrameSeam: () => {},
    pieceScreenPositions: () => [],
    dispose: () => {},
  }),
}));

const root = (): HTMLElement => {
  const el = document.querySelector<HTMLElement>('#app');
  if (!el) throw new Error('#app missing');
  return el;
};

const entryFlow = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('.entry-flow');

const statusText = (): string =>
  document.querySelector('.status-bar')?.textContent ?? '';

const toolbarButton = (label: string): HTMLButtonElement => {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>('.toolbar-btn'),
  ].find((b) => b.textContent === label);
  if (!button) throw new Error(`toolbar button not found: ${label}`);
  return button;
};

const entryButton = (label: string): HTMLButtonElement => {
  const button = [
    ...(entryFlow()?.querySelectorAll<HTMLButtonElement>('button') ?? []),
  ].find((b) => b.textContent === label);
  if (!button) throw new Error(`entry button not found: ${label}`);
  return button;
};

const entryStepHidden = (step: 'fabric' | 'project'): boolean => {
  const pane = document.querySelector<HTMLElement>(
    `[data-entry-step="${step}"]`,
  );
  return pane === null || Boolean(pane.hidden);
};

describe('app entry', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('renders the WebGL 2 unsupported state when WebGL2 is missing (jsdom)', async () => {
    await import('./main');
    // jsdom's canvas has no webgl2 context, so mountApp must surface the
    // explicit unsupported-device screen instead of a blank page.
    expect(document.querySelector('.unsupported h2')?.textContent).toContain(
      'WebGL 2 not available',
    );
  });
});

describe('entry flow (UX-08, jsdom mounts)', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
    window.localStorage.clear();
    window.location.hash = '';
    webglState.available = true;
  });

  it('a fresh profile (no link, no save) lands on the fabric step', () => {
    mountApp(root());
    expect(entryFlow()).not.toBeNull();
    expect(entryStepHidden('fabric')).toBe(false);
    expect(entryStepHidden('project')).toBe(true);
    // The flow narrates its opening in the shell's own status bar.
    expect(statusText()).toContain('Fabric first');
  });

  it('a saved cold start opens on the mat, not the entry flow', () => {
    const project = STARTERS[0].build();
    saveProject(window.localStorage, project);
    mountApp(root());
    expect(entryFlow()).toBeNull();
    expect(statusText()).toContain(
      `Restored '${project.name}' from this browser.`,
    );
  });

  it('a share-link cold start opens on the mat, not the entry flow', () => {
    const project = STARTERS[0].build();
    const plan = planShare(project, 'https://studio.test/');
    if (plan.kind !== 'url') throw new Error('expected a share URL plan');
    window.location.hash = `#${plan.url.split('#')[1] ?? ''}`;
    mountApp(root());
    expect(entryFlow()).toBeNull();
    expect(statusText()).toContain(
      `Loaded '${project.name}' from the shared link.`,
    );
  });

  it('the New button re-enters the flow from the mat', () => {
    saveProject(window.localStorage, STARTERS[0].build());
    mountApp(root());
    expect(entryFlow()).toBeNull(); // returning user: mat first
    toolbarButton('New').click();
    expect(entryFlow()).not.toBeNull();
    expect(entryStepHidden('fabric')).toBe(false);
    expect(statusText()).toContain('Fabric first');
  });

  it('the fabric step back path returns to the mat and narrates it', () => {
    mountApp(root());
    entryButton('Back to the mat').click();
    expect(entryFlow()).toBeNull();
    expect(statusText()).toContain(
      `Back on the cutting mat — '${STARTERS[0].build().name}' is on the table.`,
    );
  });

  it('the project step back path returns to the fabric step', () => {
    mountApp(root());
    entryButton('Choose a project →').click();
    expect(entryStepHidden('project')).toBe(false);
    expect(statusText()).toContain('Fabric chosen');
    entryButton('← Back to fabric').click();
    expect(entryStepHidden('fabric')).toBe(false);
    expect(entryStepHidden('project')).toBe(true);
  });

  it('the full first-session walk lands the curated blank with the chosen fabric', () => {
    mountApp(root());
    // Choose a fabric through the panel's real FabricSpec machinery.
    const colorInput = document.querySelector<HTMLInputElement>(
      '.entry-fabric-host input[type="color"]',
    );
    if (!colorInput) throw new Error('fabric color input not found');
    colorInput.value = '#2468ac';
    colorInput.dispatchEvent(new Event('input', { bubbles: true }));
    entryButton('Choose a project →').click();
    entryButton('Curated blank').click();
    expect(entryFlow()).toBeNull();
    expect(statusText()).toContain('is on the mat with your fabric.');
  });
});

describe('order review (UX-10, jsdom mounts)', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
    window.localStorage.clear();
    window.location.hash = '';
    webglState.available = true;
  });

  const orderReview = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('.order-review');

  const reviewButton = (label: string): HTMLButtonElement => {
    const button = [
      ...(orderReview()?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ].find((b) => b.textContent === label);
    if (!button) throw new Error(`review button not found: ${label}`);
    return button;
  };

  it('Assemble opens the order review; Start stitching enters the walkthrough', () => {
    const project = STARTERS[0].build();
    saveProject(window.localStorage, project);
    mountApp(root());
    expect(orderReview()).toBeNull(); // returning user: mat first
    toolbarButton('Assemble').click();
    // The review holds the stage and narrates what is ahead.
    expect(orderReview()).not.toBeNull();
    expect(statusText()).toContain(`Stitching order for '${project.name}'`);
    // The rows are the starter's assembly, in build order.
    const rows = [
      ...document.querySelectorAll<HTMLElement>('.order-review-step'),
    ];
    expect(rows).toHaveLength(project.assembly.length);
    expect(
      rows[0]!.textContent
        .replace(/ⓘ/g, '')
        .replace(/\s+([,.:;!?])/g, '$1')
        .replace(/\s{2,}/g, ' '),
    ).toBe(
      `${project.assembly[0]!.order} · ${project.assembly[0]!.name} — ${project.assembly[0]!.note}`,
    );
    // Start stitching dispatches the existing assembly entry path.
    reviewButton('Start stitching').click();
    expect(orderReview()).toBeNull();
    expect(statusText()).toContain('Assembly —');
  });

  it('the review Back action returns to the mat and narrates it', () => {
    saveProject(window.localStorage, STARTERS[0].build());
    mountApp(root());
    toolbarButton('Assemble').click();
    expect(orderReview()).not.toBeNull();
    reviewButton('← Back to the mat').click();
    expect(orderReview()).toBeNull();
    expect(statusText()).toContain('Back on the cutting mat.');
    // The walkthrough did not start: no assembly narration happened.
    expect(statusText()).not.toContain('Assembly —');
  });

  it('a project with no assembly gets the narrated empty review, no Start', () => {
    const project = curatedBlankProject();
    saveProject(window.localStorage, project);
    mountApp(root());
    toolbarButton('Assemble').click();
    expect(orderReview()).not.toBeNull();
    const empty = document.querySelector<HTMLElement>('.order-review-empty');
    expect(empty?.textContent).toContain(
      `'${project.name}' has no seams yet`,
    );
    const start = [
      ...(orderReview()?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ].find((button) => button.textContent === 'Start stitching');
    expect(start?.hidden).toBe(true);
    // The status bar narrates through the glossary, so strip the chip glyph
    // (and its spacing) before matching the copy.
    expect(
      statusText()
        .replace(/ⓘ/g, '')
        .replace(/\s+([,.:;!?])/g, '$1')
        .replace(/\s{2,}/g, ' ')
    ).toContain('has no seams yet');
  });
});
