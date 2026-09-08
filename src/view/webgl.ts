/**
 * WebGL 2 feature detection — the blueprint's Safari defense from M1.
 * three.js r185 requires WebGL 2; devices without it get the explicit
 * unsupported-device state instead of a blank canvas or a cryptic throw.
 */
export function supportsWebGL2(doc: Document = document): boolean {
  if (typeof doc.createElement !== 'function') return false;
  const canvas = doc.createElement('canvas');
  return typeof canvas.getContext === 'function'
    ? canvas.getContext('webgl2') !== null
    : false;
}
