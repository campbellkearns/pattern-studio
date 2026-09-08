import { describe, expect, it, vi } from 'vitest';
import { createSelectionStore } from './selection';

describe('selection store', () => {
  it('starts empty and selects/deselects piece ids', () => {
    const store = createSelectionStore();
    expect(store.get()).toBeNull();

    store.select('cover');
    expect(store.get()).toBe('cover');

    store.select(null);
    expect(store.get()).toBeNull();
  });

  it('notifies subscribers of changes', () => {
    const store = createSelectionStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.select('flap');
    expect(listener).toHaveBeenCalledWith('flap');

    store.select(null);
    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it('does not notify when re-selecting the same id', () => {
    const store = createSelectionStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.select('cover');
    store.select('cover');
    expect(listener).toHaveBeenCalledTimes(1);

    store.select(null);
    store.select(null);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops notifying after unsubscribe', () => {
    const store = createSelectionStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.select('pocket');
    expect(listener).not.toHaveBeenCalled();
  });
});
