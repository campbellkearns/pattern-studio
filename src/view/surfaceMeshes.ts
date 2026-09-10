/**
 * Shared surface meshes for both viewports: the workroom table (UX-04), the
 * fixed reference mat, and the paper roll beyond its far edge, plus the
 * dashed boundary between them. One definition (the blueprint's build
 * acceptance forbids a second one) — each viewport adds `group` to its scene
 * and calls `setPaperExtent` with the project's paper extent. Browser-only;
 * the geometry it consumes is unit-tested in matTexture/paperTexture/matSurface.
 */
import {
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  Group,
  Line,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';
import { SCENE } from '../tokens';
import type { BoundsCm } from './matSurface';
import {
  MAT_DEPTH_CM,
  MAT_WIDTH_CM,
  MAT_TILE_CM,
  PAPER_SURFACE_Y_CM,
  TABLE_DEPTH_CM,
  TABLE_THICKNESS_CM,
  TABLE_TOP_Y_CM,
  TABLE_WIDTH_CM,
  paperSurfaceExtentCm,
} from './matSurface';
import { createMatTexture } from './matTexture';
import {
  PAPER_PX_PER_CM,
  createPaperLabelTexture,
  createPaperTileTexture,
  paperLabel,
  paperLabelPos,
} from './paperTexture';

/** Lift the dashed boundary line above both surfaces at the shared edge. */
const BOUNDARY_LIFT_CM = 0.03;
/** The label plane rides just above the paper, below paper-lifted pieces. */
const LABEL_LIFT_CM = 0.05;
/** Dash pattern for the mat/paper boundary, in world centimetres. */
const BOUNDARY_DASH_CM = { dash: 4, gap: 3 } as const;

export interface SurfaceMeshes {
  /** Add to the scene; holds table, mat, paper, label, and boundary meshes. */
  readonly group: Group;
  /** Rebuild the paper roll for a new extent (redraft can grow it). */
  setPaperExtent(extent: BoundsCm): void;
  dispose(): void;
}

export function createSurfaceMeshes(): SurfaceMeshes {
  const group = new Group();

  // --- Workroom table (UX-04): the mat rests on it instead of floating ----
  // One slab; BoxGeometry's face order is [+x, -x, +y(top), -y, +z, -z], so
  // the top face wears tableTop and the five edge faces wear tableEdge.
  const tableGeometry = new BoxGeometry(
    TABLE_WIDTH_CM,
    TABLE_THICKNESS_CM,
    TABLE_DEPTH_CM,
  );
  const tableTopMaterial = new MeshStandardMaterial({
    color: SCENE.tableTop,
    roughness: 0.95,
    metalness: 0,
  });
  const tableEdgeMaterial = new MeshStandardMaterial({
    color: SCENE.tableEdge,
    roughness: 0.95,
    metalness: 0,
  });
  const table = new Mesh(tableGeometry, [
    tableEdgeMaterial,
    tableEdgeMaterial,
    tableTopMaterial,
    tableEdgeMaterial,
    tableEdgeMaterial,
    tableEdgeMaterial,
  ]);
  table.position.y = TABLE_TOP_Y_CM - TABLE_THICKNESS_CM / 2;
  table.receiveShadow = true;
  group.add(table);

  // --- Fixed reference mat (true cm print, one full-mat canvas) -----------
  const matGeometry = new PlaneGeometry(MAT_WIDTH_CM, MAT_DEPTH_CM);
  const matTexture = createMatTexture();
  const matMaterial = new MeshStandardMaterial({
    map: matTexture,
    roughness: 0.95,
    metalness: 0,
  });
  const mat = new Mesh(matGeometry, matMaterial);
  mat.rotation.x = -Math.PI / 2;
  mat.receiveShadow = true;
  // The mat casts a contact shadow onto the table — the cue that it rests
  // there rather than hovering (UX-04).
  mat.castShadow = true;
  group.add(mat);

  // --- Paper roll (seamless spot-and-cross tile, extent-driven) -----------
  const paperGeometry = new PlaneGeometry(1, 1);
  const paperTexture = createPaperTileTexture();
  const paperMaterial = new MeshStandardMaterial({
    map: paperTexture,
    roughness: 1,
    metalness: 0,
  });
  const paper = new Mesh(paperGeometry, paperMaterial);
  paper.rotation.x = -Math.PI / 2;
  paper.receiveShadow = true;
  paper.castShadow = true;

  // The paper's own dimension label — a small transparent plane on the roll.
  const labelGeometry = new PlaneGeometry(
    640 / PAPER_PX_PER_CM,
    160 / PAPER_PX_PER_CM,
  );
  // Unlit print on an unlit sheet: Basic keeps it free of scene shading;
  // double-sided so it reads from grazing angles.
  const labelMaterial = new MeshBasicMaterial({
    transparent: true,
    side: DoubleSide,
  });
  const label = new Mesh(labelGeometry, labelMaterial);
  label.rotation.x = -Math.PI / 2;

  // Dashed mat/paper boundary along the mat's far edge, per the figure.
  const boundaryMaterial = new LineDashedMaterial({
    color: SCENE.boundary,
    dashSize: BOUNDARY_DASH_CM.dash,
    gapSize: BOUNDARY_DASH_CM.gap,
  });
  const boundary = new Line(new BufferGeometry(), boundaryMaterial);

  const paperGroup = new Group();
  paperGroup.add(paper, label, boundary);
  paperGroup.visible = false;
  group.add(paperGroup);

  const setPaperExtent = (extent: BoundsCm): void => {
    const widthCm = extent.maxX - extent.minX;
    const heightCm = extent.maxY - extent.minY;

    // Mat placement cm → world: x − width/2, z = depth/2 − y (layout.ts).
    const centreX = (extent.minX + extent.maxX) / 2 - MAT_WIDTH_CM / 2;
    const zNear = MAT_DEPTH_CM / 2 - extent.minY;
    const zFar = MAT_DEPTH_CM / 2 - extent.maxY;
    const centreZ = (zNear + zFar) / 2;

    paper.geometry.dispose();
    paper.geometry = new PlaneGeometry(widthCm, heightCm);
    paper.position.set(centreX, PAPER_SURFACE_Y_CM, centreZ);
    paperTexture.repeat.set(widthCm / MAT_TILE_CM, heightCm / MAT_TILE_CM);

    labelMaterial.map?.dispose();
    const { text, sub } = paperLabel(extent);
    const labelTexture = createPaperLabelTexture(text, sub);
    labelMaterial.map = labelTexture;
    labelMaterial.needsUpdate = true;
    const labelPos = paperLabelPos(extent);
    label.position.set(
      labelPos.xCm - MAT_WIDTH_CM / 2,
      PAPER_SURFACE_Y_CM + LABEL_LIFT_CM,
      MAT_DEPTH_CM / 2 - labelPos.yCm,
    );

    boundary.geometry.dispose();
    boundary.geometry = new BufferGeometry().setFromPoints([
      new Vector3(extent.minX - MAT_WIDTH_CM / 2, BOUNDARY_LIFT_CM, zNear),
      new Vector3(extent.maxX - MAT_WIDTH_CM / 2, BOUNDARY_LIFT_CM, zNear),
    ]);
    boundary.computeLineDistances();

    paperGroup.visible = true;
  };

  // Standalone-valid default: a minimal roll apron beyond the far edge.
  setPaperExtent(paperSurfaceExtentCm(null));

  const dispose = (): void => {
    tableGeometry.dispose();
    tableTopMaterial.dispose();
    tableEdgeMaterial.dispose();
    matGeometry.dispose();
    matTexture.dispose();
    matMaterial.dispose();
    paper.geometry.dispose();
    paperTexture.dispose();
    paperMaterial.dispose();
    labelGeometry.dispose();
    labelMaterial.map?.dispose();
    labelMaterial.dispose();
    boundary.geometry.dispose();
    boundaryMaterial.dispose();
  };

  return { group, setPaperExtent, dispose };
}
