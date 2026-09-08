import { beforeEach, describe, expect, it, vi } from 'vitest';

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
