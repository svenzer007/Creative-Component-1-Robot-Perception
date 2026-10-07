import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { CameraPose, GeometrySnapshot, Plane3, SceneVisibility, Vec3 } from '../types';
import { cameraToWorld } from '../math/camera';
import { clipLineToSquare } from '../math/epipolar';
import { add3, scale3 } from '../math/linearAlgebra';

const COLORS = {
  camera1: 0x52d6ff,
  camera2: 0xffb84d,
  ray: 0x52d6ff,
  candidate: 0xe7eaf0,
  actual: 0xff5fa2,
  baseline: 0xffd166,
  plane: 0x7857ff,
  line: 0x8cffb5,
  family: [0x9f86ff, 0xff8fab, 0x70d6ff, 0xffd670],
};

const v3 = (value: Vec3): THREE.Vector3 => new THREE.Vector3(value[0], value[1], value[2]);

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
  object.clear();
}

function lineObject(
  points: readonly Vec3[],
  color: number,
  dashed = false,
  opacity = 1,
): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(v3));
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.14, gapSize: 0.09, transparent: opacity < 1, opacity })
    : new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  const line = new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  return line;
}

function pointObject(point: Vec3, color: number, radius = 0.065): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 20, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.08 }),
  );
  mesh.position.copy(v3(point));
  return mesh;
}

function labelObject(text: string, point: Vec3, className = ''): CSS2DObject {
  const element = document.createElement('span');
  element.className = `scene-label ${className}`;
  element.textContent = text;
  const label = new CSS2DObject(element);
  label.position.copy(v3(point));
  return label;
}

function planeCorners(camera: CameraPose): Vec3[] {
  return [
    cameraToWorld([-1.25, -1.25, 1], camera),
    cameraToWorld([1.25, -1.25, 1], camera),
    cameraToWorld([1.25, 1.25, 1], camera),
    cameraToWorld([-1.25, 1.25, 1], camera),
  ];
}

function imagePlaneVisual(camera: CameraPose, color: number, title: string): THREE.Group {
  const group = new THREE.Group();
  const corners = planeCorners(camera);
  const vertices = [...corners[0], ...corners[1], ...corners[2], ...corners[0], ...corners[2], ...corners[3]];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  group.add(new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
  ));
  group.add(lineObject([...corners, corners[0]], color, false, 0.75));
  group.add(labelObject(title, corners[3], 'plane-label'));
  return group;
}

function cameraVisual(camera: CameraPose, color: number, name: string): THREE.Group {
  const group = new THREE.Group();
  const corners = planeCorners(camera);
  group.add(pointObject(camera.center, color, 0.09));
  group.add(lineObject([camera.center, ...corners.flatMap((corner) => [corner, camera.center])], color, true, 0.6));
  group.add(imagePlaneVisual(camera, color, `${name} image plane · z=1`));
  group.add(labelObject(name, add3(camera.center, [0, 0.16, 0]), name === 'C1' ? 'label-c1' : 'label-c2'));
  return group;
}

function planePatch(
  plane: Plane3,
  camera1: CameraPose,
  camera2: CameraPose,
  direction: Vec3,
  color: number,
  opacity = 0.16,
): THREE.Mesh {
  void plane;
  const near = scale3(direction, 1.2);
  const far = scale3(direction, 7.2);
  const points = [
    add3(camera1.center, near), add3(camera1.center, far), add3(camera2.center, far),
    add3(camera1.center, near), add3(camera2.center, far), add3(camera2.center, near),
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity, depthWrite: false }),
  );
}

function addEpipole(group: THREE.Group, epipole: Vec3 | null, camera: CameraPose, label: string): void {
  if (!epipole) return;
  if (Math.max(Math.abs(epipole[0]), Math.abs(epipole[1])) > 3.2) return;
  const world = cameraToWorld(epipole, camera);
  group.add(pointObject(world, COLORS.baseline, 0.055));
  group.add(labelObject(label, add3(world, [0, 0.11, 0]), 'label-epipole'));
}

export class GeometryScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  private readonly labelRenderer = new CSS2DRenderer();
  private readonly controls: OrbitControls;
  private readonly dynamic = new THREE.Group();
  private readonly resizeObserver: ResizeObserver;

  constructor(private readonly host: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = 'webgl-canvas';
    this.labelRenderer.domElement.className = 'label-layer';
    host.append(this.renderer.domElement, this.labelRenderer.domElement);

    this.camera.position.set(7.6, 5.1, 9.6);
    this.controls = new OrbitControls(this.camera, this.labelRenderer.domElement);
    this.controls.target.set(0.5, 0.2, 3.1);
    this.controls.enableDamping = true;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 28;

    this.scene.add(this.dynamic);
    this.scene.add(new THREE.HemisphereLight(0xaedcff, 0x161825, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(4, 8, 3);
    this.scene.add(key);
    const grid = new THREE.GridHelper(14, 28, 0x344260, 0x202a3d);
    grid.position.y = -1.35;
    this.scene.add(grid);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.animate();
  }

  resetView(): void {
    this.camera.position.set(7.6, 5.1, 9.6);
    this.controls.target.set(0.5, 0.2, 3.1);
    this.controls.update();
  }

  update(snapshot: GeometrySnapshot, visibility: SceneVisibility): void {
    disposeObject(this.dynamic);
    const { camera1, camera2, ray } = snapshot;

    this.dynamic.add(cameraVisual(camera1, COLORS.camera1, 'C1'));
    const rayEnd = add3(camera1.center, scale3(ray.directionWorld, 8));
    this.dynamic.add(lineObject([camera1.center, rayEnd], COLORS.ray, true));
    const xWorld = cameraToWorld(snapshot.x, camera1);
    this.dynamic.add(pointObject(xWorld, COLORS.camera1, 0.055));
    this.dynamic.add(labelObject('x', add3(xWorld, [0, 0.1, 0]), 'label-c1'));

    if (visibility.camera2) this.dynamic.add(cameraVisual(camera2, COLORS.camera2, 'C2'));
    if (visibility.baseline) {
      this.dynamic.add(lineObject([camera1.center, camera2.center], COLORS.baseline, true));
      this.dynamic.add(labelObject('baseline', scale3(add3(camera1.center, camera2.center), 0.5), 'label-baseline'));
    }
    if (visibility.candidates) {
      snapshot.candidateWorldPoints.forEach((point, index) => {
        this.dynamic.add(pointObject(point, COLORS.candidate, 0.052));
        this.dynamic.add(labelObject(`X${index + 1}`, add3(point, [0, 0.11, 0]), 'label-candidate'));
        if (visibility.camera2) this.dynamic.add(lineObject([camera2.center, point], COLORS.camera2, true, 0.42));
      });
      this.dynamic.add(pointObject(snapshot.worldPoint, COLORS.actual, 0.085));
      this.dynamic.add(labelObject('X', add3(snapshot.worldPoint, [0, 0.14, 0]), 'label-actual'));
    }
    if (visibility.plane && ray.plane) {
      this.dynamic.add(planePatch(ray.plane, camera1, camera2, ray.directionWorld, COLORS.plane));
      this.dynamic.add(labelObject('epipolar plane', add3(scale3(rayEnd, 0.56), [0, 0.18, 0]), 'label-plane'));
    }
    if (visibility.lines) {
      const clipped1 = ray.line1 ? clipLineToSquare(ray.line1) : null;
      if (clipped1) {
        const world = clipped1.map((point) => cameraToWorld(point, camera1)) as [Vec3, Vec3];
        this.dynamic.add(lineObject(world, COLORS.line, false));
        this.dynamic.add(labelObject('l', world[1], 'label-line'));
      }
      const world = ray.line2Intersection?.clippedWorldPoints;
      if (world) {
        this.dynamic.add(lineObject(world, COLORS.line, false));
        this.dynamic.add(labelObject('l′', world[1], 'label-line'));
      }
    }
    if (visibility.correspondence && snapshot.projection2.normalized && snapshot.projection2.inFront) {
      const xPrimeWorld = cameraToWorld(snapshot.projection2.normalized, camera2);
      this.dynamic.add(pointObject(xPrimeWorld, COLORS.actual, 0.065));
      this.dynamic.add(labelObject('x′', add3(xPrimeWorld, [0, 0.11, 0]), 'label-actual'));
    }
    if (visibility.family) {
      snapshot.family.forEach((familyRay, index) => {
        const familyColor = COLORS.family[index];
        if (familyRay.plane) {
          this.dynamic.add(planePatch(
            familyRay.plane,
            camera1,
            camera2,
            familyRay.directionWorld,
            familyColor,
            0.075,
          ));
        }
        this.dynamic.add(lineObject(
          [camera1.center, add3(camera1.center, scale3(familyRay.directionWorld, 7.1))],
          familyColor,
          true,
          0.65,
        ));
        const familyLine1 = familyRay.line1 ? clipLineToSquare(familyRay.line1) : null;
        if (familyLine1) {
          this.dynamic.add(lineObject(
            familyLine1.map((point) => cameraToWorld(point, camera1)) as [Vec3, Vec3],
            familyColor,
            true,
            0.8,
          ));
        }
        const familyLine2 = familyRay.line2Intersection?.clippedWorldPoints;
        if (familyLine2) this.dynamic.add(lineObject(familyLine2, familyColor, true, 0.8));
      });
    }
    if (visibility.epipoles) {
      addEpipole(this.dynamic, snapshot.epipolar.epipole1?.normalized ?? null, camera1, 'e');
      addEpipole(this.dynamic, snapshot.epipolar.epipole2?.normalized ?? null, camera2, 'e′');
    }
  }

  private resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.labelRenderer.setSize(width, height);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  };
}
