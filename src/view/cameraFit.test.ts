import { describe, expect, it } from 'vitest';
import { MAT_DEPTH_CM, MAT_WIDTH_CM } from './matSurface';
import {
  FIT_MARGIN_FRACTION,
  FIT_VIEW_DIRECTION,
  createFitController,
  easeInOutCubic,
  fitCameraToWork,
  shadowFrustumHalfExtentCm,
  shadowFrustumHalfExtentForRectsCm,
  surfacesWorldRectCm,
  sweptGroundRectCm,
  workRectToWorldCm,
  type CameraPoseCm,
} from './cameraFit';

const FOV_DEG = 40;
const DESKTOP_ASPECT = 1.7;

/** Work bounds of a single 76 × 121 cm leg at the layout's origin slot. */
const SINGLE_LEG = { minX: 6, minY: 6, maxX: 82, maxY: 127 };

/** Bounds like the pants layout: one leg row, the second row on paper. */
const PANTS_LIKE = { minX: 6, minY: 6, maxX: 82, maxY: 254 };

function poseDistance(pose: CameraPoseCm): number {
  return Math.hypot(
    pose.position.x - pose.target.x,
    pose.position.y - pose.target.y,
    pose.position.z - pose.target.z,
  );
}

describe('workRectToWorldCm', () => {
  it('maps the full mat onto the centred world rect', () => {
    expect(
      workRectToWorldCm({
        minX: 0,
        minY: 0,
        maxX: MAT_WIDTH_CM,
        maxY: MAT_DEPTH_CM,
      }),
    ).toEqual({ minX: -75, maxX: 75, minZ: -50, maxZ: 50 });
  });

  it('maps mat-down (+y) to world −z, per the layout contract', () => {
    const rect = workRectToWorldCm({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(rect.minZ).toBe(50 - 10);
    expect(rect.maxZ).toBe(50 - 0);
  });
});

describe('fitCameraToWork', () => {
  it('throws on a nonsense fov or aspect instead of making a NaN pose', () => {
    expect(() => fitCameraToWork(SINGLE_LEG, { fovDeg: 0, aspect: 1 })).toThrow(
      RangeError,
    );
    expect(() =>
      fitCameraToWork(SINGLE_LEG, { fovDeg: 180, aspect: 1 }),
    ).toThrow(RangeError);
    expect(() =>
      fitCameraToWork(SINGLE_LEG, { fovDeg: NaN, aspect: 1 }),
    ).toThrow(RangeError);
    expect(() =>
      fitCameraToWork(SINGLE_LEG, { fovDeg: FOV_DEG, aspect: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      fitCameraToWork(SINGLE_LEG, { fovDeg: FOV_DEG, aspect: -1 }),
    ).toThrow(RangeError);
  });

  it('frames a 76 × 121 leg at the hand-computed distance', () => {
    // Grown rect: 76 + 2·(0.15·121) = 112.3 wide, 157.3 deep → r = 96.63;
    // vertical fov 40° binds on desktop → d = r / sin(20°) ≈ 282.5.
    const pose = fitCameraToWork(SINGLE_LEG, {
      fovDeg: FOV_DEG,
      aspect: DESKTOP_ASPECT,
    });
    expect(poseDistance(pose)).toBeCloseTo(282.5, 1);
  });

  it('targets the centre of the grown rect on the ground plane', () => {
    const pose = fitCameraToWork(SINGLE_LEG, {
      fovDeg: FOV_DEG,
      aspect: DESKTOP_ASPECT,
    });
    // Work x [6, 82] → world x [-69, 7]; y [6, 127] → z [-77, 44];
    // margin 18.15 grows both → centre (−31, −16.5).
    expect(pose.target.x).toBeCloseTo(-31, 5);
    expect(pose.target.y).toBe(0);
    expect(pose.target.z).toBeCloseTo(-16.5, 5);
  });

  it('looks along the 3D preset direction from the target', () => {
    const pose = fitCameraToWork(SINGLE_LEG, {
      fovDeg: FOV_DEG,
      aspect: DESKTOP_ASPECT,
    });
    const dx = pose.position.x - pose.target.x;
    const dy = pose.position.y - pose.target.y;
    const dz = pose.position.z - pose.target.z;
    expect(dx / FIT_VIEW_DIRECTION.x).toBeCloseTo(dy / FIT_VIEW_DIRECTION.y, 6);
    expect(dy / FIT_VIEW_DIRECTION.y).toBeCloseTo(dz / FIT_VIEW_DIRECTION.z, 6);
  });

  it('pulls back for bigger work — the pants layout fits whole', () => {
    const leg = fitCameraToWork(SINGLE_LEG, {
      fovDeg: FOV_DEG,
      aspect: DESKTOP_ASPECT,
    });
    const pants = fitCameraToWork(PANTS_LIKE, {
      fovDeg: FOV_DEG,
      aspect: DESKTOP_ASPECT,
    });
    expect(poseDistance(pants)).toBeGreaterThan(poseDistance(leg));
    // The framed ground circle encloses the grown rect's half-diagonal.
    const pantsDepth = PANTS_LIKE.maxY - PANTS_LIKE.minY;
    const margin = FIT_MARGIN_FRACTION * pantsDepth;
    const radius =
      Math.hypot(
        PANTS_LIKE.maxX - PANTS_LIKE.minX + 2 * margin,
        pantsDepth + 2 * margin,
      ) / 2;
    expect(
      poseDistance(pants) * Math.sin(((FOV_DEG / 2) * Math.PI) / 180),
    ).toBeGreaterThanOrEqual(radius);
  });

  it('binds on width for portrait tablets, not on the vertical fov', () => {
    const square = fitCameraToWork(PANTS_LIKE, { fovDeg: FOV_DEG, aspect: 1 });
    const tablet = fitCameraToWork(PANTS_LIKE, {
      fovDeg: FOV_DEG,
      aspect: 1024 / 1366,
    });
    expect(poseDistance(tablet)).toBeGreaterThan(poseDistance(square));
  });

  it('ignores extra landscape width — the vertical fov stays binding', () => {
    const wide = fitCameraToWork(PANTS_LIKE, { fovDeg: FOV_DEG, aspect: 2.4 });
    const standard = fitCameraToWork(PANTS_LIKE, {
      fovDeg: FOV_DEG,
      aspect: 1.5,
    });
    expect(poseDistance(wide)).toBeCloseTo(poseDistance(standard), 6);
  });
});

describe('shadowFrustumHalfExtentCm', () => {
  it('covers mat plus the minimal apron when there is no work', () => {
    // Union x [-75, 75], z [-60, 50]; +20 margin → 190 × 150 → half-diagonal.
    expect(shadowFrustumHalfExtentCm(null)).toBeCloseTo(
      Math.hypot(190, 150) / 2,
      3,
    );
  });

  it('grows to cover the paper extension of a pants layout', () => {
    // Paper extent for maxY 254 runs to y 264 → world z to −214; the union
    // with the mat grown by 20 spans 194 × 304 → half-diagonal ≈ 180.3.
    const extent = shadowFrustumHalfExtentCm(PANTS_LIKE);
    expect(extent).toBeCloseTo(Math.hypot(194, 304) / 2, 1);
    expect(extent).toBeGreaterThan(shadowFrustumHalfExtentCm(null));
  });

  it('exceeds the old fixed ±130 only for oversized layouts', () => {
    // A small on-mat project keeps the frustum near the old constant...
    expect(
      shadowFrustumHalfExtentCm({ minX: 10, minY: 10, maxX: 40, maxY: 60 }),
    ).toBeLessThan(130);
    // ...the pants layout breaks past it so shadows never clip.
    expect(shadowFrustumHalfExtentCm(PANTS_LIKE)).toBeGreaterThan(130);
  });
});

describe('shadowFrustumHalfExtentForRectsCm', () => {
  it('unions caller rects with the shadow margin', () => {
    const half = shadowFrustumHalfExtentForRectsCm([
      { minX: 0, maxX: 100, minZ: 0, maxZ: 0 },
      { minX: -50, maxX: 0, minZ: 0, maxZ: 10 },
    ]);
    // Union x [-50, 100], z [0, 10]; +20 → 190 × 50 → half-diagonal.
    expect(half).toBeCloseTo(Math.hypot(190, 50) / 2, 3);
  });

  it('sizes an assembly posed footprint alongside the surfaces', () => {
    const surfaces = surfacesWorldRectCm(null);
    const posed = { minX: -90, maxX: 90, minZ: -60, maxZ: 80 };
    const half = shadowFrustumHalfExtentForRectsCm([surfaces, posed]);
    // Union x [-90, 90], z [-60, 80]; +20 → 220 × 180 → half-diagonal.
    expect(half).toBeCloseTo(Math.hypot(220, 180) / 2, 3);
  });
});

describe('sweptGroundRectCm', () => {
  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const BOX = {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 2, y: 2, z: 1 },
  };

  it('passes the box straight through under the identity matrix', () => {
    expect(sweptGroundRectCm(BOX, [IDENTITY])).toEqual({
      minX: 0,
      maxX: 2,
      minZ: 0,
      maxZ: 1,
    });
  });

  it('translates with the matrix (assembly lifts and slides)', () => {
    const moved = [...IDENTITY];
    moved[12] = 10; // column-major: elements[12] is the x translation
    moved[14] = -5; // ...and elements[14] the z translation
    expect(sweptGroundRectCm(BOX, [moved])).toEqual({
      minX: 10,
      maxX: 12,
      minZ: -5,
      maxZ: -4,
    });
  });

  it('rotates extents — a 90° yaw swaps x and z reach', () => {
    // Column-major 90° about y: x' = z, z' = −x.
    const yaw = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];
    expect(sweptGroundRectCm(BOX, [yaw])).toEqual({
      minX: 0,
      maxX: 1,
      minZ: -2,
      maxZ: 0,
    });
  });

  it('unions the sweep — a fold swing widens the ground rect', () => {
    const swung = [...IDENTITY];
    swung[12] = -3; // second pose: shifted −3 in x
    const swept = sweptGroundRectCm(BOX, [IDENTITY, swung]);
    expect(swept.minX).toBe(-3);
    expect(swept.maxX).toBe(2);
  });

  it('rejects malformed matrices and empty sweeps', () => {
    expect(() => sweptGroundRectCm(BOX, [])).toThrow(RangeError);
    expect(() => sweptGroundRectCm(BOX, [[1, 2, 3]])).toThrow(RangeError);
  });
});

describe('easeInOutCubic', () => {
  it('pins the ends and midpoint', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('eases through the first quarter and is monotonic', () => {
    expect(easeInOutCubic(0.25)).toBeCloseTo(0.0625, 10);
    let last = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      expect(easeInOutCubic(t)).toBeGreaterThanOrEqual(last);
      last = easeInOutCubic(t);
    }
  });
});

describe('fit controller', () => {
  const FITS_MAT = { minX: 10, minY: 10, maxX: 40, maxY: 60 };
  const OVERFLOWS = PANTS_LIKE;
  const STILL_POSE: CameraPoseCm = {
    position: { x: 95, y: 135, z: 150 },
    target: { x: 0, y: 0, z: 0 },
  };

  it('fits on load and re-arms auto-fit', () => {
    const fit = createFitController();
    expect(fit.load(OVERFLOWS)).toBe(true);
  });

  it('does not fit a load with no work to frame', () => {
    const fit = createFitController();
    expect(fit.load(null)).toBe(false);
  });

  it('re-fires only when the overflow state flips', () => {
    const fit = createFitController();
    fit.load(OVERFLOWS);
    // A redraft that keeps overflowing (bigger pants) must not re-fit…
    expect(fit.workChanged({ ...OVERFLOWS, maxY: 320 })).toBe(false);
    // …but a draft that pulls the work back onto the mat flips it.
    expect(fit.workChanged(FITS_MAT)).toBe(true);
  });

  it('a motionless tap gesture does not mute auto-fit', () => {
    const fit = createFitController();
    fit.load(FITS_MAT);
    fit.gestureBegan(STILL_POSE);
    fit.gestureEnded(STILL_POSE); // a tap — selection, not an orbit
    expect(fit.workChanged(OVERFLOWS)).toBe(true);
  });

  it('never fights the user’s hand: a moved gesture mutes auto-fit', () => {
    const fit = createFitController();
    fit.load(FITS_MAT);
    fit.gestureBegan(STILL_POSE);
    fit.gestureEnded({
      position: { x: 95, y: 135, z: 150.5 },
      target: { x: 0, y: 0, z: 0 },
    });
    expect(fit.workChanged(OVERFLOWS)).toBe(false);
  });

  it('treats an explicit preset as the user’s hand too', () => {
    const fit = createFitController();
    fit.load(FITS_MAT);
    fit.commandApplied();
    expect(fit.workChanged(OVERFLOWS)).toBe(false);
  });

  it('an explicit refit always fits and re-arms the auto-fit', () => {
    const fit = createFitController();
    fit.load(FITS_MAT);
    fit.commandApplied();
    expect(fit.refit()).toBe(true);
    expect(fit.workChanged(OVERFLOWS)).toBe(true);
  });

  it('gestureEnded without a begin is a harmless no-op', () => {
    const fit = createFitController();
    fit.load(FITS_MAT);
    fit.gestureEnded({
      position: { x: 0, y: 0, z: 100 },
      target: { x: 0, y: 0, z: 0 },
    });
    expect(fit.workChanged(OVERFLOWS)).toBe(true);
  });
});
