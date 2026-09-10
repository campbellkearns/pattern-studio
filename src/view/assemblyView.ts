/**
 * Assembly view: the same true-scale mat and fabric materials as the
 * cutting-mat viewport, but piece placement comes from the assembly
 * engine — each scrub state applies evaluateAssemblyPose's matrices
 * directly to per-piece groups (rigid, deterministic, no animation
 * library). The current seam's anchor chain is drawn as an accent line
 * that sits exactly on the anchor piece, because the plan's chain points
 * were sampled in the anchor's pose at that step.
 *
 * Geometry alignment contract: piece geometry is pre-translated by
 * outlineBBoxCentre (the engine's placement origin), so engine poses map
 * straight onto meshes with no per-piece offset math here.
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
  MathUtils,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  TOUCH,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Box3 } from 'three';
import type { FabricSpec, Project, SeamStep, StitchType } from '../model';
import { vec2 } from '../model';
import { SCENE } from '../tokens';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  evaluateAssemblyPose,
  outlineBBoxCentre,
  planAssembly,
} from '../engine/assembly';
import type { AssemblyPlan } from '../engine/assembly';
import {
  BACKSTITCH_DASH_CM,
  BACKSTITCH_GAP_CM,
  DEFAULT_STITCH,
  stitchChainPoints,
} from './stitchGlyph';
import { createFabricTextures, roughnessFor } from './fabricTexture';
import {
  cameraDurationMs,
  computeSeamFrame,
  easedProgress01,
  foldDurationMs,
  prefersReducedMotion,
  seamIsCurved,
} from './walkthroughMotion';
import {
  shadowFrustumHalfExtentForRectsCm,
  surfacesWorldRectCm,
  sweptGroundRectCm,
  type WorldRectCm,
} from './cameraFit';
import { createSurfaceMeshes } from './surfaceMeshes';
import { applyLinePoints } from './seamAccentGeometry';
import { ROOM_FOG_FAR_CM, ROOM_FOG_NEAR_CM } from './matSurface';
import {
  applyGrainlineUVs,
  marksGeometry,
  pieceOutlineGeometry,
} from './pieceGeometry';
import { watchPointerRecovery } from './pointerGestures';

/** Lift pieces off the mat to avoid z-fighting with the grid. */
const PIECE_LIFT_CM = 0.06;
/** Seam highlight rides just above the anchor's surface. */
const SEAM_LIFT_CM = 0.12;

interface AssemblyPieceView {
  id: string;
  poseGroup: Group;
}

export interface AssemblyViewOptions {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  project: Project;
}

export interface AssemblyView {
  /** Engine plan backing this view (steps carry labels + seam chains). */
  readonly plan: AssemblyPlan;
  /** Apply a scrub state: prior seams folded, seam stepIndex at t. */
  setScrub(stepIndex: number, t: number): void;
  /**
   * UX-01: pre-frame the camera on the seam about to fold (per the motion
   * spec) so the fold in progress is always visible. Glides unless reduced
   * motion is requested; a user orbit cancels the glide.
   */
  preFrameSeam(stepIndex: number, forward: boolean): void;
  /** Re-skin every piece with a new fabric spec, live. */
  applyFabric(spec: FabricSpec): void;
  /**
   * UX-12: a seam's design changed through the per-seam pickers (the step
   * is the already-validated model object). Repaints the stitch layer when
   * that seam is the active one.
   */
  applySeamDesign(stepIndex: number, step: SeamStep): void;
  /** Dev/dogfood aid: live state of the UX-12 accent line. */
  seamAccentDebug(): {
    visible: boolean;
    pointCount: number;
    color: string;
    positionY: number;
    bboxMin: { x: number; y: number; z: number } | null;
    bboxMax: { x: number; y: number; z: number } | null;
  };
  /** Dev/dogfood aid: each piece's centre in client coordinates. */
  pieceScreenPositions(): Array<{ id: string; x: number; y: number }>;
  dispose(): void;
}

export function createAssemblyView(options: AssemblyViewOptions): AssemblyView {
  const { canvas, container, project } = options;

  // Pure and fast; a throw here is the app shell's "cannot assemble"
  // signal (narrated, never silent).
  const plan = planAssembly(project);

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  scene.background = new Color(SCENE.background);
  // Soft room-air fade (UX-04), same workroom as the viewport.
  scene.fog = new Fog(SCENE.background, ROOM_FOG_NEAR_CM, ROOM_FOG_FAR_CM);

  const camera = new PerspectiveCamera(40, 1, 0.5, 4000);

  // --- Lights (same rig as the viewport) ---------------------------------
  const hemi = new HemisphereLight(SCENE.hemiSky, SCENE.hemiGround, 1.0);
  scene.add(hemi);
  const sun = new DirectionalLight(SCENE.sun, 2.2);
  sun.position.set(90, 170, 110);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 500;
  scene.add(sun);

  // --- Surfaces: fixed reference mat + paper roll (shared module) ---------
  const surfaces = createSurfaceMeshes();
  scene.add(surfaces.group);

  // --- Pieces -------------------------------------------------------------
  const piecesRoot = new Group();
  scene.add(piecesRoot);

  let currentFabric: FabricSpec = project.fabric;
  const fabricTextures = createFabricTextures(currentFabric);

  const disposables: { dispose(): void }[] = [surfaces, fabricTextures];
  const pieceViews: AssemblyPieceView[] = [];
  const meshes: Mesh[] = [];
  /**
   * Piece-local bounding boxes (UX-01): the camera pre-frame sweeps these
   * through the engine's step poses to frame the fold's full motion.
   */
  const localBoxes = new Map<string, Box3>();
  /** pose · T(0, lift, 0): engine pose with the anti-z-fight lift. */
  const liftedPose = new Matrix4();
  const lift = new Matrix4().makeTranslation(0, PIECE_LIFT_CM, 0);

  for (const piece of project.pieces) {
    const centre = outlineBBoxCentre(piece);
    const outlineGeometry = pieceOutlineGeometry(piece);
    applyGrainlineUVs(outlineGeometry, piece);
    // The engine places pieces by their outline bbox centre: move that
    // centre to the local origin so poses map straight onto this mesh.
    outlineGeometry.translate(-centre.x, -centre.y, 0);
    outlineGeometry.rotateX(-Math.PI / 2);
    outlineGeometry.computeBoundingBox();
    if (outlineGeometry.boundingBox) {
      localBoxes.set(piece.id, outlineGeometry.boundingBox.clone());
    }

    const material = new MeshPhysicalMaterial({
      map: fabricTextures.map,
      normalMap: fabricTextures.normalMap,
      roughnessMap: fabricTextures.roughnessMap,
      color: currentFabric.color,
      roughness: roughnessFor(currentFabric.weave),
      metalness: 0,
      sheen: 0.5,
      sheenRoughness: 0.55,
      sheenColor: new Color(currentFabric.color).lerp(
        new Color('#ffffff'),
        0.55,
      ),
      // No polygonOffset — see the viewport's SwiftShader note: textured
      // MeshPhysicalMaterial + polygonOffset rasterizes to zero pixels on
      // iPad-class GPUs.
    });
    const mesh = new Mesh(outlineGeometry, material);
    mesh.castShadow = true;

    const edgeGeometry = new EdgesGeometry(outlineGeometry, 10);
    const outline = new LineSegments(
      edgeGeometry,
      new LineBasicMaterial({ color: SCENE.outline }),
    );
    const marks = new LineSegments(
      marksGeometry(piece.internal),
      new LineBasicMaterial({ color: SCENE.marks }),
    );
    marks.position.y = 0.04;

    const poseGroup = new Group();
    poseGroup.matrixAutoUpdate = false;
    poseGroup.add(mesh, outline, marks);
    piecesRoot.add(poseGroup);
    pieceViews.push({ id: piece.id, poseGroup });
    meshes.push(mesh);
    disposables.push(
      outlineGeometry,
      material,
      edgeGeometry,
      outline.material as LineBasicMaterial,
      marks.geometry,
      marks.material as LineBasicMaterial,
    );
  }

  // --- Shadow frustum: sized to every pose the walkthrough can reach ------
  // The old fixed ±130 box clipped shadows for oversized layouts; here the
  // sun's box covers the mat + apron surfaces plus the ground projection of
  // every piece swept through each scrub step (endpoints and mid-fold
  // samples), so no reachable pose can clip.
  const applyAssemblyShadowFrustum = (): void => {
    const rects: WorldRectCm[] = [surfacesWorldRectCm(null)];
    for (const view of pieceViews) {
      const mesh = view.poseGroup.children[0] as Mesh;
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      if (!box) throw new Error(`piece ${view.id} geometry has no bounds`);
      // A step-free plan keeps every piece at its base pose — sample (0,0).
      const samples: Array<[number, number]> =
        plan.steps.length === 0 ? [[0, 0]] : [];
      for (let stepIndex = 0; stepIndex < plan.steps.length; stepIndex++) {
        for (const t of [0, 0.25, 0.5, 0.75, 1]) samples.push([stepIndex, t]);
      }
      const matrices: number[][] = [];
      for (const [stepIndex, t] of samples) {
        const pose = evaluateAssemblyPose(plan, stepIndex, t).get(view.id);
        if (!pose) {
          throw new Error(`assembly plan has no pose for piece "${view.id}"`);
        }
        matrices.push(pose.elements);
      }
      rects.push(sweptGroundRectCm(box, matrices));
    }
    const halfExtentCm = shadowFrustumHalfExtentForRectsCm(rects);
    sun.shadow.camera.left = -halfExtentCm;
    sun.shadow.camera.right = halfExtentCm;
    sun.shadow.camera.top = halfExtentCm;
    sun.shadow.camera.bottom = -halfExtentCm;
    sun.shadow.camera.updateProjectionMatrix();
  };
  applyAssemblyShadowFrustum();

  // --- Current-seam stitch layer (UX-12) -----------------------------------
  // The active seam's accent line: the stitch type picks the glyph (solid
  // chain, resampled chevron, or long-dash material) and the thread color
  // picks the tint — the design layer's fields, read from the seam step.
  // The line rides SEAM_LIFT_CM; never polygonOffset (SwiftShader renders
  // textured materials with polygonOffset at zero pixels — see viewport.ts).
  const seamMaterials: Record<
    StitchType,
    LineBasicMaterial | LineDashedMaterial
  > = {
    straight: new LineBasicMaterial({ color: SCENE.seam }),
    zigzag: new LineBasicMaterial({ color: SCENE.seam }),
    backstitch: new LineDashedMaterial({
      color: SCENE.seam,
      dashSize: BACKSTITCH_DASH_CM,
      gapSize: BACKSTITCH_GAP_CM,
    }),
  };
  const seamLine = new Line(new BufferGeometry(), seamMaterials.straight);
  seamLine.visible = false;
  seamLine.position.y = SEAM_LIFT_CM;
  scene.add(seamLine);
  disposables.push(...Object.values(seamMaterials), seamLine.geometry);

  /** Live design per step, seeded from the project, updated by the pickers. */
  const seamDesigns = plan.steps.map((stepPlan) => ({
    stitch: stepPlan.step.stitch ?? DEFAULT_STITCH,
    threadColor: stepPlan.step.threadColor,
  }));

  let currentStepIndex = -1;

  const showSeam = (stepIndex: number): void => {
    if (stepIndex === currentStepIndex) return;
    currentStepIndex = stepIndex;
    const step = plan.steps[stepIndex];
    if (!step) {
      seamLine.visible = false;
      return;
    }
    const design = seamDesigns[stepIndex]!;
    // The glyph samples the anchor chain (world cm, flat on the mat) in
    // its own plane; the line stays at SEAM_LIFT_CM above it.
    const chain2 = step.anchorChainWorld.map((p) => vec2(p.x, p.z));
    const glyph = stitchChainPoints(design.stitch, chain2);
    // three's BufferGeometry.setFromPoints caps an existing position
    // attribute at its previous length — resampled glyphs (35-point
    // zigzags) would render as a 2-point stub. applyLinePoints swaps the
    // attribute when the count changes so the full glyph lands.
    applyLinePoints(
      seamLine.geometry,
      glyph.map((p) => new Vector3(p.x, 0, p.y)),
    );
    const material = seamMaterials[design.stitch];
    material.color.set(design.threadColor ?? SCENE.seam);
    seamLine.material = material;
    if (material instanceof LineDashedMaterial) {
      seamLine.computeLineDistances();
    }
    seamLine.visible = true;
  };

  /**
   * UX-12: a seam's design changed (per-seam pickers write through the
   * model). Already validated by createSeamStep — this only repaints.
   */
  const applySeamDesign = (stepIndex: number, step: SeamStep): void => {
    const design = seamDesigns[stepIndex];
    if (!design) return;
    design.stitch = step.stitch ?? DEFAULT_STITCH;
    design.threadColor = step.threadColor;
    if (stepIndex === currentStepIndex) {
      // showSeam dedupes on the step index; force the rebuild.
      currentStepIndex = -1;
      showSeam(stepIndex);
    }
  };

  /** Dev/dogfood aid: live state of the UX-12 accent line. */
  const seamAccentDebug = (): {
    visible: boolean;
    pointCount: number;
    color: string;
    positionY: number;
    bboxMin: { x: number; y: number; z: number } | null;
    bboxMax: { x: number; y: number; z: number } | null;
  } => {
    const geometry = seamLine.geometry;
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    const material = seamLine.material as LineBasicMaterial;
    return {
      visible: seamLine.visible,
      pointCount: geometry.attributes.position?.count ?? 0,
      color: `#${material.color.getHexString()}`,
      positionY: seamLine.position.y,
      bboxMin: bbox ? { x: bbox.min.x, y: bbox.min.y, z: bbox.min.z } : null,
      bboxMax: bbox ? { x: bbox.max.x, y: bbox.max.y, z: bbox.max.z } : null,
    };
  };

  // --- Scrub application ----------------------------------------------------
  const setScrub = (stepIndex: number, t: number): void => {
    const poses = evaluateAssemblyPose(plan, stepIndex, t);
    for (const view of pieceViews) {
      const pose = poses.get(view.id);
      if (!pose) {
        throw new Error(`assembly plan has no pose for piece "${view.id}"`);
      }
      liftedPose.multiplyMatrices(lift, pose);
      view.poseGroup.matrix.copy(liftedPose);
      view.poseGroup.matrixWorldNeedsUpdate = true;
    }
    showSeam(stepIndex);
  };

  // --- Camera + controls ----------------------------------------------------
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 15;
  controls.maxDistance = 900;
  camera.position.set(10, 95, 135);
  controls.target.set(0, 0, -5);
  controls.update();

  // --- Camera pre-frame (UX-01) ---------------------------------------------
  // On each button step the camera glides to frame the seam about to fold —
  // the fold's swept volume — so the motion in progress is always visible.
  // Only target and distance move; the user's viewing angle is preserved.
  interface CameraGlide {
    fromPos: Vector3;
    toPos: Vector3;
    fromTarget: Vector3;
    toTarget: Vector3;
    startMs: number;
    durationMs: number;
  }
  let cameraGlide: CameraGlide | null = null;

  const preFrameSeam = (stepIndex: number, forward: boolean): void => {
    const step = plan.steps[stepIndex];
    if (!step) return;
    const frame = computeSeamFrame({
      plan,
      stepIndex,
      localBoxes,
      fovYRad: MathUtils.degToRad(camera.fov),
      aspect: camera.aspect,
      cameraPosition: camera.position,
      cameraTarget: controls.target,
      minDistance: controls.minDistance,
      maxDistance: controls.maxDistance,
    });
    if (!frame) return;
    if (prefersReducedMotion()) {
      // Reduced motion: jump straight to the legible seam frame.
      cameraGlide = null;
      camera.position.copy(frame.position);
      controls.target.copy(frame.target);
      controls.update();
      return;
    }
    cameraGlide = {
      fromPos: camera.position.clone(),
      toPos: frame.position,
      fromTarget: controls.target.clone(),
      toTarget: frame.target,
      startMs: performance.now(),
      durationMs: cameraDurationMs(
        foldDurationMs(forward, seamIsCurved(step.anchorChainWorld)),
      ),
    };
  };

  // The user wins in between steps: touching the canvas cancels the glide.
  controls.addEventListener('start', () => {
    cameraGlide = null;
  });

  // --- Live fabric swap -------------------------------------------------------
  const applyFabric = (spec: FabricSpec): void => {
    currentFabric = spec;
    fabricTextures.update(spec);
    const tint = new Color(spec.color).lerp(new Color('#ffffff'), 0.55);
    for (const view of pieceViews) {
      const mesh = view.poseGroup.children[0] as Mesh;
      const material = mesh.material as MeshPhysicalMaterial;
      material.color.set(spec.color);
      material.roughness = roughnessFor(spec.weave);
      material.sheenColor.copy(tint);
    }
  };

  // WebKit ghost-gesture recovery, same as the viewport.
  const recovery = watchPointerRecovery(canvas);

  // --- Resize + render loop -----------------------------------------------------
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

  renderer.setAnimationLoop((time) => {
    if (cameraGlide) {
      // UX-01: ease the camera onto the seam frame (rAF timestamps and
      // performance.now share the time-origin millisecond clock).
      const progress = easedProgress01(
        time - cameraGlide.startMs,
        cameraGlide.durationMs,
      );
      camera.position.lerpVectors(
        cameraGlide.fromPos,
        cameraGlide.toPos,
        progress,
      );
      controls.target.lerpVectors(
        cameraGlide.fromTarget,
        cameraGlide.toTarget,
        progress,
      );
      if (progress >= 1) cameraGlide = null;
    }
    controls.update();
    renderer.render(scene, camera);
  });

  // --- Teardown --------------------------------------------------------------
  const dispose = (): void => {
    renderer.setAnimationLoop(null);
    observer.disconnect();
    recovery.dispose();
    controls.dispose();
    for (const d of disposables) d.dispose();
    renderer.dispose();
  };

  const pieceScreenPositions = (): Array<{
    id: string;
    x: number;
    y: number;
  }> => {
    const rect = canvas.getBoundingClientRect();
    const centre = new Vector3();
    return pieceViews.map((view) => {
      const mesh = view.poseGroup.children[0] as Mesh;
      mesh.geometry.computeBoundingBox();
      mesh.geometry.boundingBox?.getCenter(centre);
      view.poseGroup.localToWorld(centre);
      const ndc = centre.project(camera);
      return {
        id: view.id,
        x: rect.left + ((ndc.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - ndc.y) / 2) * rect.height,
      };
    });
  };

  // Initial state: everything flat, first seam highlighted, camera pre-framed
  // on seam 1 (UX-01) — the walkthrough opens on the fold about to happen.
  setScrub(0, 0);
  preFrameSeam(0, true);

  return {
    plan,
    setScrub,
    preFrameSeam,
    applyFabric,
    applySeamDesign,
    seamAccentDebug,
    pieceScreenPositions,
    dispose,
  };
}
