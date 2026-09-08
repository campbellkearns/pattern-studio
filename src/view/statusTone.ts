/**
 * Status-bar tones (off-happy-path state handling, blueprint states
 * table): every narration carries a tone, and the tone decides the pill's
 * border before the user reads a word. Pure mapping — the shell owns the
 * DOM side.
 */

export type StatusTone = 'info' | 'error' | 'success';

/** The class the status bar wears for a tone ('' for the default info). */
export function statusClassName(tone: StatusTone): string {
  switch (tone) {
    case 'error':
      return 'error';
    case 'success':
      return 'success';
    case 'info':
      return '';
  }
}
