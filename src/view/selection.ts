/**
 * Selection state for the viewport ↔ panel link. One source of truth:
 * the viewport taps write here, the panel reads and writes here, and both
 * re-render from subscriptions. `null` means "nothing selected".
 */
export type SelectionListener = (selectedId: string | null) => void;

export interface SelectionStore {
  /** Currently selected piece id, or null. */
  get(): string | null;
  /** Select a piece (or deselect with null). Re-selecting the same id is a no-op. */
  select(id: string | null): void;
  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe(listener: SelectionListener): () => void;
}

export function createSelectionStore(): SelectionStore {
  let selectedId: string | null = null;
  const listeners = new Set<SelectionListener>();

  return {
    get: () => selectedId,
    select(id: string | null): void {
      if (id === selectedId) return;
      selectedId = id;
      for (const listener of listeners) listener(selectedId);
    },
    subscribe(listener: SelectionListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
