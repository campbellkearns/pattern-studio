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
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  TOUCH,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { FabricSpec, Project } from '../model';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  evaluateAssemblyPose,
  outlineBBoxCentre,
  planAssembly,
} from '../engine/assembly';
import type { AssemblyPlan } from '../engine/assembly';
import { createFabricTextures, roughnessFor } from './fabricTexture';
import { createMatTexture, MAT_TILE_CM } from './matTexture';
import {
  applyGrainlineUVs,
  marksGeometry,
  pieceOutlineGeometry,
} from './pieceGeometry';
import { watchPointerRecovery } from './pointerGestures';

/** Cutting mat size in true centimetres (matches the viewport). */
const MAT_WIDTH_CM = 150;
const MAT_DEPTH_CM = 100;
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
  /** Re-skin every piece with a new fabric spec, live. */
  applyFabric(spec: FabricSpec): void;
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
  scene.background = new Color('#23282e');

  const camera = new PerspectiveCamera(40, 1, 0.5, 4000);

  // --- Lights (same rig as the viewport) ---------------------------------
  const hemi = new HemisphereLight('#e8eef4', '#3a4038', 1.0);
  scene.add(hemi);
  const sun = new DirectionalLight('#fff8ec', 2.2);
  sun.position.set(90, 170, 110);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -130;
  sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130;
  sun.shadow.camera.bottom = -130;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 500;
  scene.add(sun);

  // --- Cutting mat --------------------------------------------------------
  const matGeometry = new PlaneGeometry(MAT_WIDTH_CM, MAT_DEPTH_CM);
  const matTexture = createMatTexture();
  matTexture.repeat.set(MAT_WIDTH_CM / MAT_TILE_CM, MAT_DEPTH_CM / MAT_TILE_CM);
  const matMaterial = new MeshStandardMaterial({
    map: matTexture,
    roughness: 0.95,
    metalness: 0,
  });
  const mat = new Mesh(matGeometry, matMaterial);
  mat.rotation.x = -Math.PI / 2;
  mat.receiveShadow = true;
  scene.add(mat);

  // --- Pieces -------------------------------------------------------------
  const piecesRoot = new Group();
  scene.add(piecesRoot);

  let currentFabric: FabricSpec = project.fabric;
  const fabricTextures = createFabricTextures(currentFabric);

  const disposables: { dispose(): void }[] = [
    matGeometry,
    matMaterial,
    matTexture,
    fabricTextures,
  ];
  const pieceViews: AssemblyPieceView[] = [];
  const meshes: Mesh[] = [];
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
      new LineBasicMaterial({ color: '#1c242b' }),
    );
    const marks = new LineSegments(
      marksGeometry(piece.internal),
      new LineBasicMaterial({ color: '#24303a' }),
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

  // --- Current-seam highlight ---------------------------------------------
  const seamMaterial = new LineBasicMaterial({ color: '#ffd166' });
  const seamLine = new Line(new BufferGeometry(), seamMaterial);
  seamLine.visible = false;
  seamLine.position.y = SEAM_LIFT_CM;
  scene.add(seamLine);
  disposables.push(seamMaterial, seamLine.geometry);

  let currentStepIndex = -1;

  const showSeam = (stepIndex: number): void => {
    if (stepIndex === currentStepIndex) return;
    currentStepIndex = stepIndex;
    const step = plan.steps[stepIndex];
    if (!step) {
      seamLine.visible = false;
      return;
    }
    // Rebuild the accent line along this seam's anchor chain (world cm).
    const points = step.anchorChainWorld.map((p) => p.clone());
    seamLine.geometry.setFromPoints(points);
    seamLine.visible = true;
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

  renderer.setAnimationLoop(() => {
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

  // Initial state: everything flat, first seam highlighted.
  setScrub(0, 0);

  return { plan, setScrub, applyFabric, pieceScreenPositions, dispose };
}
