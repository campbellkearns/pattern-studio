import { describe, expect, it } from 'vitest';
import { statusClassName } from './statusTone';

describe('statusClassName', () => {
  it('maps tones to the status bar classes', () => {
    expect(statusClassName('error')).toBe('error');
    expect(statusClassName('success')).toBe('success');
    // Info is the pill's default look — no class at all.
    expect(statusClassName('info')).toBe('');
  });
});
