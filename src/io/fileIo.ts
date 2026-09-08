/**
 * File interchange adapters (F7): trigger a browser download and open a
 * file picker. Thin DOM on purpose — all validation lives in
 * `parseProject`, all serialization in `serializeProject`.
 */

/** Download text as a file. Throws on Blob/URL failures — never silent. */
export function downloadTextFile(
  filename: string,
  text: string,
  mime: string,
): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give Safari a beat to start the download before the object URL dies.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Open a JSON file picker and resolve with the file's text.
 * Resolves `null` when the user dismisses the picker — cancellation is not
 * an error. Rejects when the file cannot be read.
 */
export function pickJsonText(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null;
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then(resolve, reject);
    });
    input.click();
  });
}
