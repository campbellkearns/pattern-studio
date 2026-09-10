/**
 * Order-review surface tests (UX-10, jsdom): the review is a pure render of
 * project.assembly — one row per step in build order, the spec's "1 · Name —
 * note" shape — and every action reaches the shell as a callback (Start
 * stitching → the existing assembly entry; Back → the mat). No WebGL, no
 * scene: the surface is DOM only.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { curatedBlankProject } from '../data/curatedBlank';
import { STARTERS } from '../data/starters';
import type { Project } from '../model';
import { createOrderReview } from './orderReview';

const notebook = (): Project => STARTERS[0]!.build();

/** Rendered text with the glossary chips' ⓘ affordance glyph removed. */
const plainText = (element: HTMLElement | null): string =>
  element?.textContent?.replace(/ⓘ/g, '').replace(/\s{2,}/g, ' ').trim() ?? '';

describe('order review surface (UX-10, jsdom mounts)', () => {
  beforeEach(() => {
    // Fresh document per test: the glossary popover attaches to <body>, so
    // a leaked one from a previous test would defeat the disposal assertion.
    document.body.innerHTML = '';
  });

  it('renders one row per assembly step, in project.assembly order', () => {
    const project = notebook();
    const host = document.createElement('div');
    createOrderReview(host, project, { onStart: () => {}, onBack: () => {} });

    const items = [...host.querySelectorAll<HTMLElement>('.order-review-step')];
    expect(items).toHaveLength(project.assembly.length);
    items.forEach((item, i) => {
      const step = project.assembly[i]!;
      expect(plainText(item)).toBe(
        `${step.order} · ${step.name} — ${step.note}`,
      );
    });
    // The review's opening line names the project it reviews.
    expect(plainText(host.querySelector('.order-review'))).toContain(
      `Orthodox order for '${project.name}'`,
    );
  });

  it('Start stitching fires the onStart callback (the assembly entry path)', () => {
    const host = document.createElement('div');
    let started = 0;
    createOrderReview(host, notebook(), {
      onStart: () => {
        started += 1;
      },
      onBack: () => {},
    });
    const start = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Start stitching',
    );
    if (!start) throw new Error('Start stitching button not found');
    start.click();
    expect(started).toBe(1);
  });

  it('Back fires the onBack callback — the review has no dead end', () => {
    const host = document.createElement('div');
    let backed = 0;
    createOrderReview(host, notebook(), {
      onStart: () => {},
      onBack: () => {
        backed += 1;
      },
    });
    const back = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === '← Back to the mat',
    );
    if (!back) throw new Error('Back button not found');
    back.click();
    expect(backed).toBe(1);
  });

  it('a project with no assembly gets the narrated empty state, no Start', () => {
    const project = curatedBlankProject();
    const host = document.createElement('div');
    createOrderReview(host, project, { onStart: () => {}, onBack: () => {} });

    const empty = host.querySelector<HTMLElement>('.order-review-empty');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain(
      `'${project.name}' has no seams yet`,
    );
    const start = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Start stitching',
    );
    // Hidden, not removed: there is nothing to start, but the layout stays.
    expect(start?.hidden).toBe(true);
    expect(
      host.querySelector<HTMLElement>('.order-review-list')?.hidden,
    ).toBe(true);
    // The way back stays: never a dead end.
    const back = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === '← Back to the mat',
    );
    expect(back).toBeDefined();
  });

  it('disposing removes the surface and its glossary popover', () => {
    const host = document.createElement('div');
    const handle = createOrderReview(host, notebook(), {
      onStart: () => {},
      onBack: () => {},
    });
    expect(host.querySelector('.order-review')).not.toBeNull();
    expect(document.querySelector('.glossary-popover')).not.toBeNull();
    handle.dispose();
    expect(host.querySelector('.order-review')).toBeNull();
    expect(document.querySelector('.glossary-popover')).toBeNull();
  });
});
