/**
 * Keyboard shortcuts (blueprint polish bar), kept pure so the routing is
 * unit-testable without a DOM. The app shell owns the listener and the
 * effects; this module only decides what a key means.
 *
 * The map is deliberately tiny and hover-free — every shortcut has an
 * on-screen tap equivalent, so keys are an accelerator, never the path.
 */

/** What a keypress means to the shell. */
export type ShortcutAction =
  | 'preset-top'
  | 'preset-3d'
  | 'refit-camera'
  | 'assemble'
  | 'exit-or-deselect'
  | 'show-shortcuts';

/** Modifier state, mirrored off a KeyboardEvent by the caller. */
export interface ShortcutMods {
  readonly alt?: boolean;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly shift?: boolean;
}

/**
 * Route a KeyboardEvent's key + modifiers to an action, or null when the
 * key is not a shortcut. Modifier chords are rejected (except shift for
 * '?', which most layouts require) so shortcuts never fight OS chords.
 */
export function shortcutAction(
  key: string,
  mods: ShortcutMods = {},
): ShortcutAction | null {
  if (mods.alt || mods.ctrl || mods.meta) return null;
  if (mods.shift && key !== '?') return null;

  switch (key) {
    case '1':
      return 'preset-top';
    case '2':
      return 'preset-3d';
    case 'f':
    case 'F':
      return 'refit-camera';
    case 'a':
    case 'A':
      return 'assemble';
    case 'Escape':
      return 'exit-or-deselect';
    case '?':
      return 'show-shortcuts';
    default:
      return null;
  }
}

/**
 * True when the event's target swallows typing (form fields, editable
 * regions) — shortcuts must not fire while the user is entering data.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  if (target === null) return false;
  const element = target as HTMLElement;
  // The property is the browser signal; the attribute keeps this branch
  // honest in engines (jsdom) that never define the property at all.
  const editableProperty =
    'isContentEditable' in element && element.isContentEditable;
  return editableProperty || element.getAttribute('contenteditable') === 'true';
}

/** The '?' narration: discoverability for a map nobody has memorised. */
export function shortcutHint(): string {
  return (
    'Shortcuts — 1: top view, 2: 3D view, F: refit camera, A: assemble, ' +
    'Esc: exit assembly or clear selection, ?: this hint.'
  );
}
