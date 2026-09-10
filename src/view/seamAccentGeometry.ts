/**
 * Accent-line geometry updates (UX-12): the one place a THREE.Line's
 * geometry is re-pointed at a new polyline of varying length.
 *
 * three's BufferGeometry.setFromPoints updates an existing position
 * attribute IN PLACE, capped at its previous vertex count (three 0.185:
 * `Math.min(points.length, positionAttribute.count)`, then a console
 * warning). A 2-point straight chain followed by a 35-point zigzag
 * therefore renders as a 2-point stub. Callers that re-point one line at
 * varying-length polylines must swap the attribute when the count grows.
 */
import {
  BufferAttribute,
  BufferGeometry,
  type InterleavedBufferAttribute,
  type Vector3,
} from 'three';

const isPlainAttribute = (
  attribute: BufferAttribute | InterleavedBufferAttribute | undefined,
): attribute is BufferAttribute =>
  attribute !== undefined && 'isBufferAttribute' in attribute;

export function applyLinePoints(
  geometry: BufferGeometry,
  points: readonly Vector3[],
): void {
  const previous = geometry.getAttribute('position');
  if (isPlainAttribute(previous) && previous.count !== points.length) {
    previous.dispose();
    const flat = new Float32Array(points.length * 3);
    for (const [i, point] of points.entries()) {
      flat[i * 3] = point.x;
      flat[i * 3 + 1] = point.y;
      flat[i * 3 + 2] = point.z;
    }
    geometry.setAttribute('position', new BufferAttribute(flat, 3));
    // Stale bounds would frustum-cull the longer line after a camera move.
    geometry.boundingBox = null;
    geometry.boundingSphere = null;
  } else {
    geometry.setFromPoints([...points]);
  }
}
