/**
 * Clipboard adapter for the Share mode's fallback: copy a link or, over the
 * length limit, the project JSON. `navigator.clipboard` needs a secure
 * context; the execCommand path covers the rest (legacy Safari, http).
 */

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyViaExecCommand(text);
  }
}

function execCommandCopy(): boolean {
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

function copyViaExecCommand(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  // Off-screen but focusable: display:none makes execCommand a no-op.
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.setAttribute('readonly', 'true');
  document.body.appendChild(textarea);
  textarea.select();
  const ok = execCommandCopy();
  textarea.remove();
  return ok;
}
