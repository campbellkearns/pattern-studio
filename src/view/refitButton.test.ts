import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REFIT_BUTTON_LABEL,
  REFIT_BUTTON_TIP,
  createRefitButton,
} from './refitButton';

describe('createRefitButton', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('mounts a 44 pt toolbar button with tooltip and accessible name', () => {
    const { button } = createRefitButton(container, () => {});
    expect(button.parentElement).toBe(container);
    expect(button.classList.contains('toolbar-btn')).toBe(true);
    expect(button.type).toBe('button');
    expect(button.textContent).toBe(REFIT_BUTTON_LABEL);
    expect(button.title).toBe(REFIT_BUTTON_TIP);
    expect(button.getAttribute('aria-label')).toBe(REFIT_BUTTON_TIP);
  });

  it('fires the refit callback on click', () => {
    const onRefit = vi.fn();
    const { button } = createRefitButton(container, onRefit);
    button.click();
    expect(onRefit).toHaveBeenCalledTimes(1);
  });

  it('disabled state ignores clicks — assembly mode has no work to fit', () => {
    const onRefit = vi.fn();
    const handle = createRefitButton(container, onRefit);
    handle.setEnabled(false);
    expect(handle.button.disabled).toBe(true);
    handle.button.click();
    expect(onRefit).not.toHaveBeenCalled();
    handle.setEnabled(true);
    expect(handle.button.disabled).toBe(false);
  });
});
