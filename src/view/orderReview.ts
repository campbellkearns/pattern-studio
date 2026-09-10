/**
 * Order review (UX-10): the pre-flight list of a project's seams, in build
 * order, shown before any walkthrough scene mounts. Pure data — the rows
 * come straight off `project.assembly` via orderReviewRows (no planning, no
 * WebGL), so review is cheap and total even for a project that cannot plan.
 * Like the entry flow, this is a pure render of the model: every action
 * dispatches a transition through the shell's single dispatch path, and the
 * surface itself holds no state to drift.
 */
import { orderReviewRows } from '../appState';
import type { Project } from '../model';
import { createGlossaryPopover, renderAnnotatedText } from './glossaryDom';

export interface OrderReviewCallbacks {
  /** Start stitching: the shell's existing assembly entry path. */
  onStart(): void;
  /** Back: leave the review for the mat it opened from. */
  onBack(): void;
}

export interface OrderReviewHandle {
  dispose(): void;
}

export function createOrderReview(
  container: HTMLElement,
  project: Project,
  callbacks: OrderReviewCallbacks,
): OrderReviewHandle {
  const root = document.createElement('div');
  root.className = 'order-review';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Review the stitching order');

  const heading = document.createElement('h2');
  heading.textContent = 'The stitching order';

  const copy = document.createElement('p');
  copy.className = 'entry-copy';
  copy.textContent =
    `Orthodox order for '${project.name}' — read it once, then start. ` +
    'Every seam still teaches itself in the walkthrough.';

  const rows = orderReviewRows(project);

  // Glossary chips on the learner notes (UX-07), one popover per surface,
  // disposed with it — the same lifecycle the assembly bar uses.
  const popover = createGlossaryPopover();

  const list = document.createElement('ol');
  list.className = 'order-review-list';
  for (const row of rows) {
    const item = document.createElement('li');
    item.className = 'order-review-step';
    // The spec's row shape: "1 · Side seams — pin, then stitch".
    const title = document.createElement('span');
    title.className = 'order-review-title';
    renderAnnotatedText(title, `${row.order} · ${row.title}`, { popover });
    const note = document.createElement('span');
    note.className = 'order-review-note';
    renderAnnotatedText(note, ` — ${row.note}`, { popover });
    item.append(title, note);
    list.appendChild(item);
  }

  const empty = document.createElement('p');
  empty.className = 'order-review-empty';
  // Narrated empty state (UX-03's pattern): say why the list is bare, never
  // a void. Start stays hidden — there is nothing to start — while the way
  // back remains.
  empty.textContent = `'${project.name}' has no seams yet — the stitching order appears once pieces are joined.`;
  empty.hidden = rows.length > 0;
  list.hidden = rows.length === 0;

  const actions = document.createElement('div');
  actions.className = 'entry-actions';
  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.className = 'entry-btn entry-btn-primary';
  startButton.textContent = 'Start stitching';
  startButton.addEventListener('click', () => callbacks.onStart());
  startButton.hidden = rows.length === 0;
  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'entry-btn';
  backButton.textContent = '← Back to the mat';
  backButton.addEventListener('click', () => callbacks.onBack());
  actions.append(startButton, backButton);

  root.append(heading, copy, list, empty, actions);
  container.appendChild(root);

  return {
    dispose(): void {
      popover.close();
      popover.dispose();
      root.remove();
    },
  };
}
