import { describe, expect, it } from 'vitest';

describe('app entry', () => {
  it('renders the placeholder page into #app', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    await import('./main');
    expect(document.querySelector('h1')?.textContent).toContain(
      'Pattern Studio',
    );
    expect(document.querySelector('.meta')?.textContent).toMatch(
      /three\.js r\d+/,
    );
  });
});
