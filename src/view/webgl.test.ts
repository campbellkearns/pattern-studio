import { describe, expect, it } from 'vitest';
import { supportsWebGL2 } from './webgl';

describe('supportsWebGL2', () => {
  it('is false in jsdom (no webgl2 context)', () => {
    expect(supportsWebGL2()).toBe(false);
  });

  it('is true when a canvas reports a webgl2 context', () => {
    const fakeDoc = {
      createElement: (tag: string) => ({
        tagName: tag,
        getContext: (type: string) => (type === 'webgl2' ? {} : null),
      }),
    } as unknown as Document;
    expect(supportsWebGL2(fakeDoc)).toBe(true);
  });

  it('is false when only webgl1 contexts exist', () => {
    const fakeDoc = {
      createElement: (tag: string) => ({
        tagName: tag,
        getContext: () => null,
      }),
    } as unknown as Document;
    expect(supportsWebGL2(fakeDoc)).toBe(false);
  });
});
