/**
 * The 3D viewport: cutting mat, orbit, lighting, selection.
 *
 * World contract: 1 unit = 1 cm — the mat grid, piece geometry, and camera
 * distances are all true scale. Input model per the blueprint: Pointer
 * Events everywhere; OrbitControls' native touch map (one-finger rotate,
 * two-finger pinch/pan) set explicitly; hover on mouse/pen only, with tap
 * as the universal selection gesture; pointercancel/visibility recovery for
 * the WebKit stale-pointer bug. Browser-only by nature — the WebGL shell is
 * covered by dogfood evidence, the pure logic around it by unit tests.
 */
import {
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Fog,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshPhysicalMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Raycaster,
  Scene,
  TOUCH,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { SCENE } from '../tokens';
import type { FabricSpec, Piece, Project, SeamStep } from '../model';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { chainPolyline } from '../engine/assembly';
import {
  BACKSTITCH_DASH_CM,
  BACKSTITCH_GAP_CM,
  DEFAULT_STITCH,
  stitchChainPoints,
} from './stitchGlyph';
import { createFabricTextures, roughnessFor } from './fabricTexture';
import { layoutOnMat, placementToWorld } from './layout';
import {
  MAT_DEPTH_CM,
  MAT_WIDTH_CM,
  ROOM_FOG_FAR_CM,
  ROOM_FOG_NEAR_CM,
  paperSurfaceExtentCm,
  surfaceHeightCm,
  workBoundsCm,
  type BoundsCm,
} from './matSurface';
import {
  FIT_VIEW_DIRECTION,
  createFitController,
  easeInOutCubic,
  fitCameraToWork,
  shadowFrustumHalfExtentCm,
  type CameraPoseCm,
} from './cameraFit';
import { createSurfaceMeshes } from './surfaceMeshes';
import {
  applyGrainlineUVs,
  marksGeometry,
  pieceExtents,
  pieceOutlineGeometry,
} from './pieceGeometry';
import { watchPointerRecovery } from './pointerGestures';
import type { SelectionStore } from './selection';

export type CameraPreset = 'top' | 'three-d';

export interface ViewportOptions {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  project: Project;
  selection: SelectionStore;
  onHoverChange?(pieceId: string | null): void;
}

export interface Viewport {
  applyPreset(preset: CameraPreset): void;
  /** Re-skin every piece with a new fabric spec, live. */
  applyFabric(spec: FabricSpec): void;
  /** Replace the rendered pieces (parametric redraft); layout recomputes. */
  updatePieces(pieces: readonly Piece[], assembly?: readonly SeamStep[]): void;
  /**
   * Animate the camera back to the fitted work bounds — the tap equivalent
   * of the F shortcut. Always obeys: refit is the user's explicit hand.
   */
  refit(): void;
  /** Dev/dogfood aid: each piece's centre in client coordinates. */
  pieceScreenPositions(): Array<{ id: string; x: number; y: number }>;
  /**
   * Highlight a piece exactly as a canvas hover would (legend ↔ viewport
   * linkage); null clears. Drives the same visuals and onHoverChange
   * callback as a pointer hover.
   */
  setHover(pieceId: string | null): void;
  dispose(): void;
}

/** Lift pieces off the mat to avoid z-fighting with the grid. */
const PIECE_LIFT_CM = 0.06;
/** UX-12 stitch lines ride just above the piece surface, above the marks. */
const SEAM_STITCH_LIFT_CM = 0.1;
/** Marks hover slightly above their piece's surface. */
const MARKS_LIFT_CM = 0.04;
/** Max pointer travel (px) between down and up that still counts as a tap. */
const TAP_SLOP_PX = 8;
/** Duration of the animated camera fit (blueprint States table: animated). */
const FIT_ANIMATION_MS = 700;

interface PieceView {
  id: string;
  group: Group;
  mesh: Mesh;
  material: MeshPhysicalMaterial;
  highlight: LineSegments;
}

export function createViewport(options: ViewportOptions): Viewport {
  const { canvas, container, project, selection } = options;

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  scene.background = new Color(SCENE.background);
  // Soft room-air fade (UX-04): distant geometry dissolves into the
  // drafting-room backdrop, giving the workroom depth without extra
  // geometry — the work area itself stays crisp (fog starts well beyond it).
  scene.fog = new Fog(SCENE.background, ROOM_FOG_NEAR_CM, ROOM_FOG_FAR_CM);

  const camera = new PerspectiveCamera(40, 1, 0.5, 4000);

  // --- Lights -----------------------------------------------------------
  const hemi = new HemisphereLight(SCENE.hemiSky, SCENE.hemiGround, 1.0);
  scene.add(hemi);
  const sun = new DirectionalLight(SCENE.sun, 2.2);
  sun.position.set(90, 170, 110);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 500;
  scene.add(sun);

  /**
   * Square shadow-frustum box for a half-extent in cm, centred on the rig
   * origin: the box must cover the declared surfaces plus the laid-out
   * work (or the assembly's posed footprint) — the old fixed ±130 box
   * clipped shadows on oversized layouts. Recomputed when the work moves.
   */
  const applyShadowFrustum = (halfExtentCm: number): void => {
    sun.shadow.camera.left = -halfExtentCm;
    sun.shadow.camera.right = halfExtentCm;
    sun.shadow.camera.top = halfExtentCm;
    sun.shadow.camera.bottom = -halfExtentCm;
    sun.shadow.camera.updateProjectionMatrix();
  };

  // --- Surfaces: fixed reference mat + paper roll (shared module) ---------
  const surfaces = createSurfaceMeshes();
  scene.add(surfaces.group);

  // --- Pieces at true scale ---------------------------------------------
  const piecesGroup = new Group();
  scene.add(piecesGroup);

  // One shared weave texture set serves every piece: each piece's UVs are
  // rotated to its own grainline (below), so per-piece texture clones are
  // unnecessary — and a fabric swap repaints three canvases once.
  // Live fabric spec: applyFabric updates this so a later redraft rebuild
  // (updatePieces) re-skins new meshes with the CURRENT fabric, not the
  // project's original one. Project.fabric is readonly by design.
  let currentFabric: FabricSpec = project.fabric;
  const fabricTextures = createFabricTextures(currentFabric);
  // UX-12: the assembly whose seams render on placed pieces. Redrafts pass
  // the fresh assembly through updatePieces; chains resolve against the
  // live piece geometry each rebuild.
  let currentAssembly: readonly SeamStep[] = project.assembly;

  const sharedDisposables: { dispose(): void }[] = [surfaces, fabricTextures];
  let pieceDisposables: { dispose(): void }[] = [];
  let views: PieceView[] = [];
  let meshes: Mesh[] = [];
  /** Ground bounds of the current layout, in mat cm — the fit's subject. */
  let currentWork: BoundsCm | null = null;

  /** Remove every piece view, freeing only the per-piece GPU resources. */
  const clearPieceViews = (): void => {
    for (const view of views) piecesGroup.remove(view.group);
    for (const d of pieceDisposables) d.dispose();
    pieceDisposables = [];
    views = [];
    meshes = [];
  };

  const buildPieceViews = (pieces: readonly Piece[]): void => {
    // Depth-aware layout: rows past the mat's depth budget land on the
    // paper surface (Placement.surface), which the shared surface module
    // renders beyond the mat's far edge.
    const placements = layoutOnMat(
      pieces.map((piece) => {
        const e = pieceExtents(piece);
        return { id: piece.id, widthCm: e.width, heightCm: e.height };
      }),
      { gapCm: 6, matWidthCm: MAT_WIDTH_CM, matDepthCm: MAT_DEPTH_CM },
    );
    const placementById = new Map(placements.map((p) => [p.id, p]));

    // The paper roll tracks the placed work: overflow rows extend it, and
    // a minimal apron shows when everything fits on the mat.
    const placedBoxes = pieces.map((piece) => {
      const placement = placementById.get(piece.id);
      if (!placement) throw new Error(`no layout for piece ${piece.id}`);
      const e = pieceExtents(piece);
      return {
        xCm: placement.xCm,
        yCm: placement.yCm,
        widthCm: e.width,
        heightCm: e.height,
      };
    });
    const work = workBoundsCm(placedBoxes);
    currentWork = work;
    surfaces.setPaperExtent(paperSurfaceExtentCm(work));
    // Shadows follow the work: paper extension and overflow rows must cast,
    // so the frustum is re-sized with every layout. The first build (load)
    // lands here too — before any frame renders.
    applyShadowFrustum(shadowFrustumHalfExtentCm(work));

    for (const piece of pieces) {
      const extents = pieceExtents(piece);
      const outlineGeometry = pieceOutlineGeometry(piece);
      // Weave and stripes run true to this piece's grain (the grainline lock).
      applyGrainlineUVs(outlineGeometry, piece);
      // Move the bbox min-corner to the origin so placement positions the
      // piece by its layout slot, then lay it flat on the mat (XY → XZ).
      outlineGeometry.translate(-extents.minX, -extents.minY, 0);
      outlineGeometry.rotateX(-Math.PI / 2);

      const material = new MeshPhysicalMaterial({
        map: fabricTextures.map,
        normalMap: fabricTextures.normalMap,
        roughnessMap: fabricTextures.roughnessMap,
        color: currentFabric.color,
        roughness: roughnessFor(currentFabric.weave),
        metalness: 0,
        // Cloth response: sheen is the three.js material feature built for
        // fabric (findings log §2); tint follows the fabric color, lightened.
        sheen: 0.5,
        sheenRoughness: 0.55,
        sheenColor: new Color(currentFabric.color).lerp(
          new Color('#ffffff'),
          0.55,
        ),
        // No polygonOffset: on SwiftShader (Chrome 153 headless, iPad-class
        // GPUs) a textured MeshPhysicalMaterial with polygonOffset factor/units
        // 1 rasterizes to zero pixels — pieces vanish entirely. PIECE_LIFT_CM
        // already separates pieces from the mat, so the offset is redundant.
      });
      const mesh = new Mesh(outlineGeometry, material);
      mesh.castShadow = true;
      mesh.userData.pieceId = piece.id;

      const edgeGeometry = new EdgesGeometry(outlineGeometry, 10);
      const baseOutline = new LineSegments(
        edgeGeometry,
        new LineBasicMaterial({ color: SCENE.outline }),
      );
      const highlight = new LineSegments(
        edgeGeometry,
        // Hover/select recolor this line in refreshVisuals below.
        new LineBasicMaterial({ color: SCENE.hoverHighlight }),
      );
      highlight.visible = false;

      const marks = new LineSegments(
        marksGeometry(piece.internal),
        new LineBasicMaterial({ color: SCENE.marks }),
      );
      marks.position.y = MARKS_LIFT_CM;

      // --- UX-12 stitch layer -----------------------------------------
      // Every assembly step joining this piece draws its stitch glyph along
      // the piece-local edge chain, tinted by the step's thread color when
      // present. Lines are children of the piece's group, so they ride the
      // same placement and lift as the piece — never polygonOffset (the
      // SwiftShader zero-pixel bug noted on the material above).
      const stitchLines: Line[] = [];
      for (let stepIndex = 0; stepIndex < currentAssembly.length; stepIndex++) {
        const step = currentAssembly[stepIndex];
        if (!step) continue;
        // Which side of the seam runs along this piece (null: neither).
        const side: 0 | 1 | null =
          step.pieces[0] === piece.id
            ? 0
            : step.pieces[1] === piece.id
              ? 1
              : null;
        if (side === null) continue;
        const chain = chainPolyline(piece, step.edges[side]);
        const glyph = stitchChainPoints(step.stitch ?? DEFAULT_STITCH, chain);
        const seamGeometry = new BufferGeometry().setFromPoints(
          glyph.map((p) => new Vector3(p.x, p.y, 0)),
        );
        // Same placement pipeline as the outline: bbox min-corner to the
        // origin, then lay flat (XY → XZ).
        seamGeometry.translate(-extents.minX, -extents.minY, 0);
        seamGeometry.rotateX(-Math.PI / 2);
        const seamMaterial: LineBasicMaterial | LineDashedMaterial =
          step.stitch === 'backstitch'
            ? new LineDashedMaterial({
                color: step.threadColor ?? SCENE.seam,
                dashSize: BACKSTITCH_DASH_CM,
                gapSize: BACKSTITCH_GAP_CM,
              })
            : new LineBasicMaterial({ color: step.threadColor ?? SCENE.seam });
        const seam = new Line(seamGeometry, seamMaterial);
        seam.position.y = SEAM_STITCH_LIFT_CM;
        if (seamMaterial instanceof LineDashedMaterial) {
          seam.computeLineDistances();
        }
        stitchLines.push(seam);
        pieceDisposables.push(seamGeometry, seamMaterial);
      }

      const group = new Group();
      const placement = placementById.get(piece.id);
      if (!placement) throw new Error(`no layout for piece ${piece.id}`);
      // Mat-space placements are 0-based; the mat mesh is centred on the
      // origin, so the placement must be re-centred or pieces hang off
      // the mat's right edge.
      const world = placementToWorld(placement, MAT_WIDTH_CM, MAT_DEPTH_CM);
      group.position.set(
        world.xCm,
        surfaceHeightCm(placement.surface) + PIECE_LIFT_CM,
        world.zCm,
      );
      group.add(mesh, baseOutline, highlight, marks, ...stitchLines);
      piecesGroup.add(group);

      views.push({ id: piece.id, group, mesh, material, highlight });
      meshes.push(mesh);
      pieceDisposables.push(
        outlineGeometry,
        material,
        edgeGeometry,
        baseOutline.material as LineBasicMaterial,
        highlight.material as LineBasicMaterial,
        marks.geometry,
        marks.material as LineBasicMaterial,
      );
    }
  };

  buildPieceViews(project.pieces);

  const updatePieces = (
    pieces: readonly Piece[],
    assembly?: readonly SeamStep[],
  ): void => {
    if (assembly) currentAssembly = assembly;
    clearPieceViews();
    buildPieceViews(pieces);
    // A redrafted piece set can drop ids the selection/hover still name.
    setHover(null);
    refreshVisuals();
    // Blueprint States table, redraft row: the auto-fit re-fires only when
    // the redraft flips the overflow state — and the fit controller keeps
    // it off entirely once the user's hand has taken the camera.
    if (fitController.workChanged(currentWork)) animateFit();
  };

  // --- Camera fit: autopilot that never fights the user's hand ------------
  const fitController = createFitController();

  interface FitAnimation {
    fromPosition: Vector3;
    fromTarget: Vector3;
    to: CameraPoseCm;
    startedAt: number;
  }
  let fitAnimation: FitAnimation | null = null;

  const poseVector = (p: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  }): Vector3 => new Vector3(p.x, p.y, p.z);

  const animateFit = (): void => {
    if (!currentWork) return; // nothing to frame — keep the current pose
    fitAnimation = {
      fromPosition: camera.position.clone(),
      fromTarget: controls.target.clone(),
      to: fitCameraToWork(currentWork, {
        fovDeg: camera.fov,
        aspect: camera.aspect,
      }),
      startedAt: performance.now(),
    };
  };

  const stepFitAnimation = (nowMs: number): void => {
    if (!fitAnimation) return;
    const linear = Math.min(
      (nowMs - fitAnimation.startedAt) / FIT_ANIMATION_MS,
      1,
    );
    const k = easeInOutCubic(linear);
    camera.position.lerpVectors(
      fitAnimation.fromPosition,
      poseVector(fitAnimation.to.position),
      k,
    );
    controls.target.lerpVectors(
      fitAnimation.fromTarget,
      poseVector(fitAnimation.to.target),
      k,
    );
    if (linear >= 1) fitAnimation = null;
  };

  const cameraPose = (): CameraPoseCm => ({
    position: {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    },
    target: {
      x: controls.target.x,
      y: controls.target.y,
      z: controls.target.z,
    },
  });

  const refit = (): void => {
    if (fitController.refit()) animateFit();
  };

  // --- Camera + controls (native touch map, set explicitly) --------------
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 15;
  controls.maxDistance = 900;

  const applyPreset = (preset: CameraPreset): void => {
    // An explicit preset is the user's hand too — auto-fit must not undo it.
    fitController.commandApplied();
    if (preset === 'top') {
      camera.position.set(0, 250, 0.001);
    } else {
      // Same direction the fit uses, so preset → refit reads as one move.
      camera.position.set(
        FIT_VIEW_DIRECTION.x,
        FIT_VIEW_DIRECTION.y,
        FIT_VIEW_DIRECTION.z,
      );
    }
    controls.target.set(0, 0, 0);
    controls.update();
  };
  applyPreset('three-d');

  // Grabbing the camera cancels an in-flight fit immediately; a real
  // orbit/zoom (pose moved by gesture end) mutes further auto-fits.
  controls.addEventListener('start', () => {
    fitAnimation = null;
    fitController.gestureBegan(cameraPose());
  });
  controls.addEventListener('end', () =>
    fitController.gestureEnded(cameraPose()),
  );

  // --- Live fabric swap: one repaint, every piece re-skinned -------------
  const applyFabric = (spec: FabricSpec): void => {
    currentFabric = spec;
    fabricTextures.update(spec);
    const tint = new Color(spec.color).lerp(new Color('#ffffff'), 0.55);
    for (const view of views) {
      view.material.color.set(spec.color);
      view.material.roughness = roughnessFor(spec.weave);
      view.material.sheenColor.copy(tint);
    }
  };

  // --- Hover + tap selection (Pointer Events; hover is never required) ---
  const raycaster = new Raycaster();
  let hoverId: string | null = null;

  const pieceIdAt = (clientX: number, clientY: number): string | null => {
    const rect = canvas.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return (hit?.object.userData.pieceId as string | undefined) ?? null;
  };

  const refreshVisuals = (): void => {
    const selectedId = selection.get();
    for (const view of views) {
      const hovered = hoverId === view.id;
      const selected = selectedId === view.id;
      view.material.emissive.set(
        selected
          ? SCENE.selectEmissive
          : hovered
            ? SCENE.hoverEmissive
            : '#000000',
      );
      // Amber marks transient attention (hover); cobalt marks the
      // committed choice, matching the panel's selected treatment.
      (view.highlight.material as LineBasicMaterial).color.set(
        selected ? SCENE.selectHighlight : SCENE.hoverHighlight,
      );
      view.highlight.visible = selected || hovered;
    }
  };

  const setHover = (id: string | null): void => {
    if (id === hoverId) return;
    hoverId = id;
    refreshVisuals();
    options.onHoverChange?.(id);
  };

  const onPointerMove = (event: PointerEvent): void => {
    // Touch has no hover — tap-selection is the affordance there.
    if (event.pointerType === 'touch') return;
    setHover(pieceIdAt(event.clientX, event.clientY));
  };
  const onPointerLeave = (): void => {
    setHover(null);
  };

  interface TapGesture {
    pointerId: number;
    startX: number;
    startY: number;
  }
  let tap: TapGesture | null = null;
  const activePointers = new Set<number>();

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    activePointers.add(event.pointerId);
    // A second finger (pinch) cancels any in-flight tap.
    tap =
      activePointers.size === 1
        ? {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
          }
        : null;
  };
  const onPointerUp = (event: PointerEvent): void => {
    activePointers.delete(event.pointerId);
    if (!tap || tap.pointerId !== event.pointerId) return;
    const travel = Math.hypot(
      event.clientX - tap.startX,
      event.clientY - tap.startY,
    );
    tap = null;
    if (travel > TAP_SLOP_PX) return; // it was a drag/orbit, not a tap
    selection.select(pieceIdAt(event.clientX, event.clientY));
  };
  const onPointerCancel = (event: PointerEvent): void => {
    activePointers.delete(event.pointerId);
    if (tap?.pointerId === event.pointerId) tap = null;
    setHover(null);
  };

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);

  // WebKit ghost-gesture recovery (pointercancel + visibility).
  const recovery = watchPointerRecovery(canvas);

  const unsubscribeSelection = selection.subscribe(refreshVisuals);
  refreshVisuals();

  // --- Resize + render loop ----------------------------------------------
  const resize = (): void => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    // The fit has the last word each frame: a fresh lerp wins over any
    // residual damping drift, until a gesture cancels it (see 'start').
    stepFitAnimation(performance.now());
    renderer.render(scene, camera);
  });

  // Blueprint States table, load row: fit once now — before the first
  // orbit — animated, and let manual zoom win until an explicit refit.
  if (fitController.load(currentWork)) animateFit();

  // --- Teardown -----------------------------------------------------------
  const dispose = (): void => {
    renderer.setAnimationLoop(null);
    observer.disconnect();
    recovery.dispose();
    unsubscribeSelection();
    controls.dispose();
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    for (const d of sharedDisposables) d.dispose();
    for (const d of pieceDisposables) d.dispose();
    renderer.dispose();
  };

  const pieceScreenPositions = (): Array<{
    id: string;
    x: number;
    y: number;
  }> => {
    const rect = canvas.getBoundingClientRect();
    const centre = new Vector3();
    return views.map((view) => {
      // Project the piece's bbox centre, not the group origin (which is
      // the layout slot's min-corner) so taps can aim at the visible body.
      view.mesh.geometry.computeBoundingBox();
      view.mesh.geometry.boundingBox?.getCenter(centre);
      view.mesh.localToWorld(centre);
      const ndc = centre.project(camera);
      return {
        id: view.id,
        x: rect.left + ((ndc.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - ndc.y) / 2) * rect.height,
      };
    });
  };

  return {
    applyPreset,
    applyFabric,
    updatePieces,
    setHover,
    refit,
    pieceScreenPositions,
    dispose,
  };
}
