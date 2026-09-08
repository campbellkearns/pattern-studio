/**
 * The toolbar's refit control (blueprint cutting-mat States table): the tap
 * equivalent of the F shortcut, riding the same .toolbar-btn 44 px touch
 * target the other toolbar actions use. Pure DOM creation — the app shell
 * owns mounting, narration, and the viewport; this module only builds the
 * button, so the wiring is unit-testable in jsdom.
 */

export interface RefitButtonHandle {
  readonly button: HTMLButtonElement;
  /**
   * Assembly mode swaps the mat viewport out — refit has nothing to fit,
   * so the button says so instead of accepting taps that do nothing.
   */
  setEnabled(enabled: boolean): void;
}

/** Visible label; the tooltip carries the F pairing. */
export const REFIT_BUTTON_LABEL = 'Refit';

/** Tooltip + accessible name: what it does and that F does the same. */
export const REFIT_BUTTON_TIP = 'Refit camera to the work (F)';

export function createRefitButton(
  container: HTMLElement,
  onRefit: () => void,
): RefitButtonHandle {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toolbar-btn';
  button.textContent = REFIT_BUTTON_LABEL;
  button.title = REFIT_BUTTON_TIP;
  button.setAttribute('aria-label', REFIT_BUTTON_TIP);
  button.addEventListener('click', onRefit);
  container.appendChild(button);
  return {
    button,
    setEnabled(enabled: boolean): void {
      button.disabled = !enabled;
    },
  };
}
