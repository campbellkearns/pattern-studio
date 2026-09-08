import { describe, expect, it } from 'vitest';
import { isTextEntryTarget, shortcutAction, shortcutHint } from './shortcuts';

describe('shortcutAction', () => {
  it('maps the bare keys to shell actions', () => {
    expect(shortcutAction('1')).toBe('preset-top');
    expect(shortcutAction('2')).toBe('preset-3d');
    expect(shortcutAction('a')).toBe('assemble');
    expect(shortcutAction('A')).toBe('assemble');
    expect(shortcutAction('Escape')).toBe('exit-or-deselect');
    expect(shortcutAction('?')).toBe('show-shortcuts');
  });

  it('rejects keys that are not shortcuts', () => {
    expect(shortcutAction('x')).toBeNull();
    expect(shortcutAction('Enter')).toBeNull();
    expect(shortcutAction('Shift')).toBeNull();
  });

  it('rejects modifier chords so shortcuts never fight the OS', () => {
    expect(shortcutAction('a', { ctrl: true })).toBeNull();
    expect(shortcutAction('a', { meta: true })).toBeNull();
    expect(shortcutAction('a', { alt: true })).toBeNull();
    // Shift is reserved for '?' — capital A is typing, not a shortcut.
    expect(shortcutAction('A', { shift: true })).toBeNull();
    expect(shortcutAction('1', { shift: true })).toBeNull();
  });

  it('keeps "?" working under shift, which most layouts require', () => {
    expect(shortcutAction('?', { shift: true })).toBe('show-shortcuts');
  });
});

describe('isTextEntryTarget', () => {
  it('treats form fields and editable regions as typing targets', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    // The attribute form: jsdom does not reflect the contentEditable
    // property, and the router reads the attribute for exactly that reason.
    editable.setAttribute('contenteditable', 'true');

    expect(isTextEntryTarget(input)).toBe(true);
    expect(isTextEntryTarget(textarea)).toBe(true);
    expect(isTextEntryTarget(select)).toBe(true);
    expect(isTextEntryTarget(editable)).toBe(true);
  });

  it('treats everything else as shortcut territory', () => {
    expect(isTextEntryTarget(document.body)).toBe(false);
    expect(isTextEntryTarget(document.createElement('button'))).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});

describe('shortcutHint', () => {
  it('names every routed shortcut so ? is discoverable', () => {
    const hint = shortcutHint();
    for (const fragment of ['1', '2', 'A', 'Esc', '?']) {
      expect(hint).toContain(fragment);
    }
  });
});
