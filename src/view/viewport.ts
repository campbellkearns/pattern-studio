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
  Color,
  DirectionalLight,
  EdgesGeometry,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  TOUCH,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { FabricSpec, Project } from '../model';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createFabricTextures, roughnessFor } from './fabricTexture';
import { layoutOnMat, placementToWorld } from './layout';
import { createMatTexture, MAT_TILE_CM } from './matTexture';
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
  /** Dev/dogfood aid: each piece's centre in client coordinates. */
  pieceScreenPositions(): Array<{ id: string; x: number; y: number }>;
  dispose(): void;
}

/** Cutting mat size in true centimetres. */
const MAT_WIDTH_CM = 150;
const MAT_DEPTH_CM = 100;
/** Lift pieces off the mat to avoid z-fighting with the grid. */
const PIECE_LIFT_CM = 0.06;
/** Marks hover slightly above their piece's surface. */
const MARKS_LIFT_CM = 0.04;
/** Max pointer travel (px) between down and up that still counts as a tap. */
const TAP_SLOP_PX = 8;

const HOVER_EMISSIVE = 0x2a3b44;
const SELECT_EMISSIVE = 0x5a4410;

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
  scene.background = new Color('#23282e');

  const camera = new PerspectiveCamera(40, 1, 0.5, 4000);

  // --- Lights -----------------------------------------------------------
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

  // --- Cutting mat (true cm grid) ---------------------------------------
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

  // --- Pieces at true scale ---------------------------------------------
  const piecesGroup = new Group();
  scene.add(piecesGroup);

  const placements = layoutOnMat(
    project.pieces.map((piece) => {
      const e = pieceExtents(piece);
      return { id: piece.id, widthCm: e.width, heightCm: e.height };
    }),
    { gapCm: 6, matWidthCm: MAT_WIDTH_CM },
  );
  const placementById = new Map(placements.map((p) => [p.id, p]));

  const views: PieceView[] = [];
  const meshes: Mesh[] = [];
  const disposables: { dispose(): void }[] = [
    matGeometry,
    matMaterial,
    matTexture,
  ];

  // One shared weave texture set serves every piece: each piece's UVs are
  // rotated to its own grainline (below), so per-piece texture clones are
  // unnecessary — and a fabric swap repaints three canvases once.
  const fabricTextures = createFabricTextures(project.fabric);
  disposables.push(fabricTextures);

  for (const piece of project.pieces) {
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
      color: project.fabric.color,
      roughness: roughnessFor(project.fabric.weave),
      metalness: 0,
      // Cloth response: sheen is the three.js material feature built for
      // fabric (findings log §2); tint follows the fabric color, lightened.
      sheen: 0.5,
      sheenRoughness: 0.55,
      sheenColor: new Color(project.fabric.color).lerp(
        new Color('#ffffff'),
        0.55,
      ),
      // Push the fill behind its outline edges so the cutting line reads.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const mesh = new Mesh(outlineGeometry, material);
    mesh.castShadow = true;
    mesh.userData.pieceId = piece.id;

    const edgeGeometry = new EdgesGeometry(outlineGeometry, 10);
    const baseOutline = new LineSegments(
      edgeGeometry,
      new LineBasicMaterial({ color: '#1c242b' }),
    );
    const highlight = new LineSegments(
      edgeGeometry,
      new LineBasicMaterial({ color: '#ffd166' }),
    );
    highlight.visible = false;

    const marks = new LineSegments(
      marksGeometry(piece.internal),
      new LineBasicMaterial({ color: '#24303a' }),
    );
    marks.position.y = MARKS_LIFT_CM;

    const group = new Group();
    const placement = placementById.get(piece.id);
    if (!placement) throw new Error(`no layout for piece ${piece.id}`);
    // Mat-space placements are 0-based; the mat mesh is centred on the
    // origin, so the placement must be re-centred or pieces hang off the
    // mat's right edge.
    const world = placementToWorld(placement, MAT_WIDTH_CM, MAT_DEPTH_CM);
    group.position.set(world.xCm, PIECE_LIFT_CM, world.zCm);
    group.add(mesh, baseOutline, highlight, marks);
    piecesGroup.add(group);

    views.push({ id: piece.id, group, mesh, material, highlight });
    meshes.push(mesh);
    disposables.push(
      outlineGeometry,
      material,
      edgeGeometry,
      baseOutline.material as LineBasicMaterial,
      highlight.material as LineBasicMaterial,
      marks.geometry,
      marks.material as LineBasicMaterial,
    );
  }

  // --- Camera + controls (native touch map, set explicitly) --------------
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 15;
  controls.maxDistance = 900;

  const applyPreset = (preset: CameraPreset): void => {
    if (preset === 'top') {
      camera.position.set(0, 250, 0.001);
    } else {
      camera.position.set(95, 135, 150);
    }
    controls.target.set(0, 0, 0);
    controls.update();
  };
  applyPreset('three-d');

  // --- Live fabric swap: one repaint, every piece re-skinned -------------
  const applyFabric = (spec: FabricSpec): void => {
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
      view.material.emissive.setHex(
        selected ? SELECT_EMISSIVE : hovered ? HOVER_EMISSIVE : 0x000000,
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
    renderer.render(scene, camera);
  });

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

  return { applyPreset, applyFabric, pieceScreenPositions, dispose };
}
