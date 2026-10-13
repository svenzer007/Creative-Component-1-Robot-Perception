import type { CameraPose, Vec3 } from '../../types';
import { cameraPoseFromControls, cameraToWorld, projectNormalized } from '../../math/camera';
import { clipLineToRect } from '../../math/epipolar';
import { cross3, dot3, normalize3, scale3, sub3 } from '../../math/linearAlgebra';

/*
 * The landing page's living diagram: a point slides along camera 1's viewing ray while its image in
 * camera 2 slides along one epipolar line. Positions come from the same camera model as the 3D lab,
 * so the motion is the real constraint, not an illustration of it.
 */

export const HERO_CAMERA_1: CameraPose = cameraPoseFromControls({ center: [0, 0, 0], yawDegrees: 0, pitchDegrees: 0 });
export const HERO_CAMERA_2: CameraPose = cameraPoseFromControls({ center: [1.9, 0.15, 0.35], yawDegrees: -14, pitchDegrees: 3 });
/** Normalized image point x in camera 1. */
export const HERO_IMAGE_POINT: Vec3 = [0.28, 0.12, 1];
export const HERO_DEPTH_RANGE = { min: 2.4, max: 6.4 } as const;
export const HERO_CANDIDATE_DEPTHS = [2.7, 3.7, 4.9, 6.1] as const;
/** Half extents of each drawn image plane, in normalized image coordinates. */
export const HERO_PLANE = { halfWidth: 0.62, halfHeight: 0.44 } as const;

export interface HeroPoint {
  /** X = λx on camera 1's ray, in world coordinates. */
  world: Vec3;
  /** x′ in camera 2's normalized image coordinates, or null if X is not in front of camera 2. */
  image2: Vec3 | null;
}

export function heroPoint(depth: number): HeroPoint {
  const world = cameraToWorld(scale3(HERO_IMAGE_POINT, depth), HERO_CAMERA_1);
  const projection = projectNormalized(world, HERO_CAMERA_2);
  return { world, image2: projection.normalized && projection.inFront ? projection.normalized : null };
}

/** The epipolar line of x in camera 2 (through two projections of the ray), clipped to the drawn plane. */
export function heroEpipolarSegment(): readonly [Vec3, Vec3] | null {
  const near = heroPoint(HERO_DEPTH_RANGE.min).image2;
  const far = heroPoint(60).image2;
  if (!near || !far) return null;
  return clipLineToRect(cross3(near, far), -HERO_PLANE.halfWidth, -HERO_PLANE.halfHeight, HERO_PLANE.halfWidth, HERO_PLANE.halfHeight);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 560;
const HEIGHT = 380;
const COLORS = { c1: '#52d6ff', c2: '#ffb84d', plane: '#9f86ff', line: '#8cffb5', point: '#ff5fa2', baseline: '#ffd166', candidate: '#dce7f6' };

type ScreenPoint = readonly [number, number];

/** A fixed viewer behind and above the baseline's midpoint: the textbook layout, cameras low, point above. */
function makeViewer(): (point: Vec3) => ScreenPoint {
  const eye: Vec3 = [0.95, 2.9, -4.4];
  const target: Vec3 = [1.0, 0.45, 3.3];
  const forward = normalize3(sub3(target, eye))!;
  const right = normalize3(cross3([0, 1, 0], forward))!;
  const up = cross3(forward, right);
  return (point) => {
    const offset = sub3(point, eye);
    const depth = dot3(offset, forward);
    return [dot3(offset, right) / depth, -dot3(offset, up) / depth];
  };
}

function planeCorners(camera: CameraPose): Vec3[] {
  const { halfWidth: w, halfHeight: h } = HERO_PLANE;
  return [[-w, -h, 1], [w, -h, 1], [w, h, 1], [-w, h, 1]].map((corner) => cameraToWorld(corner as unknown as Vec3, camera));
}

function element<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
  parent?.append(node);
  return node;
}

export class HeroFigure {
  readonly element: SVGSVGElement;
  private readonly project: (point: Vec3) => ScreenPoint;
  private readonly movingRay: SVGLineElement;
  private readonly movingPoint: SVGCircleElement;
  private readonly movingImage: SVGCircleElement;
  private readonly pointLabel: SVGTextElement;
  private readonly imageLabel: SVGTextElement;
  private readonly reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private frame = 0;
  private startedAt = 0;

  constructor() {
    const viewer = makeViewer();
    const segment = heroEpipolarSegment();
    const farRay = heroPoint(7.4).world;
    const staticPoints: Vec3[] = [
      HERO_CAMERA_1.center, HERO_CAMERA_2.center, farRay,
      ...planeCorners(HERO_CAMERA_1), ...planeCorners(HERO_CAMERA_2),
    ];
    const raw = staticPoints.map(viewer);
    const minX = Math.min(...raw.map((p) => p[0]));
    const maxX = Math.max(...raw.map((p) => p[0]));
    const minY = Math.min(...raw.map((p) => p[1]));
    const maxY = Math.max(...raw.map((p) => p[1]));
    const padding = 34;
    const scale = Math.min((WIDTH - 2 * padding) / (maxX - minX), (HEIGHT - 2 * padding) / (maxY - minY));
    const offsetX = (WIDTH - (maxX - minX) * scale) / 2 - minX * scale;
    const offsetY = (HEIGHT - (maxY - minY) * scale) / 2 - minY * scale;
    this.project = (point) => {
      const [x, y] = viewer(point);
      return [x * scale + offsetX, y * scale + offsetY];
    };
    const p = this.project;
    const svg = element('svg', {
      viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
      class: 'home-figure-svg',
      role: 'img',
      'aria-label': 'Two cameras look at one point. As the point slides along the first camera’s viewing ray, its image in the second camera slides along a single line.',
    });
    this.element = svg;
    const points = (list: Vec3[]): string => list.map((point) => p(point).map((value) => value.toFixed(1)).join(',')).join(' ');
    const line = (a: Vec3, b: Vec3, attributes: Record<string, string | number>): SVGLineElement => {
      const [x1, y1] = p(a);
      const [x2, y2] = p(b);
      return element('line', { x1, y1, x2, y2, ...attributes }, svg);
    };
    const label = (at: Vec3, text: string, color: string, dx = 8, dy = -10): SVGTextElement => {
      const [x, y] = p(at);
      const node = element('text', { x: x + dx, y: y + dy, fill: color, class: 'home-figure-label' }, svg);
      node.textContent = text;
      return node;
    };

    element('polygon', { points: points([HERO_CAMERA_1.center, HERO_CAMERA_2.center, farRay]), fill: COLORS.plane, 'fill-opacity': 0.1, stroke: COLORS.plane, 'stroke-opacity': 0.35 }, svg);
    [[HERO_CAMERA_1, COLORS.c1], [HERO_CAMERA_2, COLORS.c2]].forEach(([camera, color]) => {
      const pose = camera as CameraPose;
      const corners = planeCorners(pose);
      corners.forEach((corner) => line(pose.center, corner, { stroke: color as string, 'stroke-opacity': 0.4, 'stroke-dasharray': '4 5' }));
      element('polygon', { points: points(corners), fill: color as string, 'fill-opacity': 0.07, stroke: color as string, 'stroke-opacity': 0.75 }, svg);
    });
    line(HERO_CAMERA_1.center, HERO_CAMERA_2.center, { stroke: COLORS.baseline, 'stroke-dasharray': '6 6', 'stroke-opacity': 0.8 });
    line(HERO_CAMERA_1.center, farRay, { stroke: COLORS.c1, 'stroke-width': 1.6, 'stroke-dasharray': '7 6' });
    if (segment) {
      const [a, b] = segment.map((end) => cameraToWorld(end, HERO_CAMERA_2));
      line(a, b, { stroke: COLORS.line, 'stroke-width': 7, 'stroke-opacity': 0.18, 'stroke-linecap': 'round' });
      line(a, b, { stroke: COLORS.line, 'stroke-width': 2.4, 'stroke-linecap': 'round' });
      label(b, 'l′', COLORS.line, 6, -8);
    }
    HERO_CANDIDATE_DEPTHS.forEach((depth) => {
      const candidate = heroPoint(depth);
      const [cx, cy] = p(candidate.world);
      element('circle', { cx, cy, r: 3.6, fill: COLORS.candidate, 'fill-opacity': 0.55 }, svg);
      if (candidate.image2) {
        const [ix, iy] = p(cameraToWorld(candidate.image2, HERO_CAMERA_2));
        element('circle', { cx: ix, cy: iy, r: 2.8, fill: COLORS.candidate, 'fill-opacity': 0.55 }, svg);
      }
    });
    this.movingRay = element('line', { stroke: COLORS.c2, 'stroke-opacity': 0.55, 'stroke-width': 1.3 }, svg);
    const [x1, y1] = p(cameraToWorld(HERO_IMAGE_POINT, HERO_CAMERA_1));
    element('circle', { cx: x1, cy: y1, r: 5.5, fill: COLORS.c1, stroke: '#e9fbff', 'stroke-width': 2 }, svg);
    label(cameraToWorld(HERO_IMAGE_POINT, HERO_CAMERA_1), 'x', COLORS.c1);
    this.movingPoint = element('circle', { r: 7, fill: COLORS.point, stroke: '#fff0f7', 'stroke-width': 2, class: 'home-figure-glow' }, svg);
    this.movingImage = element('circle', { r: 5.5, fill: COLORS.point, stroke: '#fff0f7', 'stroke-width': 2 }, svg);
    this.pointLabel = element('text', { fill: COLORS.point, class: 'home-figure-label' }, svg);
    this.pointLabel.textContent = 'X';
    this.imageLabel = element('text', { fill: COLORS.point, class: 'home-figure-label' }, svg);
    this.imageLabel.textContent = 'x′';
    [[HERO_CAMERA_1.center, COLORS.c1, 'C₁'], [HERO_CAMERA_2.center, COLORS.c2, 'C₂']].forEach(([center, color, text]) => {
      const [cx, cy] = p(center as Vec3);
      element('circle', { cx, cy, r: 6.5, fill: color as string }, svg);
      label(center as Vec3, text as string, color as string, -8, 22);
    });
    this.place((HERO_DEPTH_RANGE.min + HERO_DEPTH_RANGE.max) / 2);
  }

  /** Starts the slow back-and-forth along the ray; does nothing for reduced-motion users. */
  play(): void {
    if (this.reducedMotion || this.frame) return;
    this.startedAt = performance.now();
    const tick = (now: number): void => {
      const phase = ((now - this.startedAt) / 6000) * Math.PI * 2;
      const t = (1 - Math.cos(phase)) / 2;
      this.place(HERO_DEPTH_RANGE.min + (HERO_DEPTH_RANGE.max - HERO_DEPTH_RANGE.min) * t);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  pause(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private place(depth: number): void {
    const point = heroPoint(depth);
    const [px, py] = this.project(point.world);
    const [cx, cy] = this.project(HERO_CAMERA_2.center);
    this.movingPoint.setAttribute('cx', px.toFixed(1));
    this.movingPoint.setAttribute('cy', py.toFixed(1));
    this.pointLabel.setAttribute('x', (px + 10).toFixed(1));
    this.pointLabel.setAttribute('y', (py - 10).toFixed(1));
    this.movingRay.setAttribute('x1', cx.toFixed(1));
    this.movingRay.setAttribute('y1', cy.toFixed(1));
    this.movingRay.setAttribute('x2', px.toFixed(1));
    this.movingRay.setAttribute('y2', py.toFixed(1));
    const hidden = !point.image2;
    this.movingImage.toggleAttribute('hidden', hidden);
    this.imageLabel.toggleAttribute('hidden', hidden);
    if (!point.image2) return;
    const [ix, iy] = this.project(cameraToWorld(point.image2, HERO_CAMERA_2));
    this.movingImage.setAttribute('cx', ix.toFixed(1));
    this.movingImage.setAttribute('cy', iy.toFixed(1));
    this.imageLabel.setAttribute('x', (ix + 9).toFixed(1));
    this.imageLabel.setAttribute('y', (iy + 18).toFixed(1));
  }
}
