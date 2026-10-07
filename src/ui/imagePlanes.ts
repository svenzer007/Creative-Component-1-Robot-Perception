import type { GeometrySnapshot, SceneVisibility, Vec3 } from '../types';
import { clipLineToSquare, VIEW_MAX, VIEW_MIN } from '../math/epipolar';
import type { AppStore } from '../state/appState';
import { pointerToNormalized } from './coordinates';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SIZE = 500;

const toSvg = (point: Vec3): readonly [number, number] => [
  ((point[0] - VIEW_MIN) / (VIEW_MAX - VIEW_MIN)) * SIZE,
  ((VIEW_MAX - point[1]) / (VIEW_MAX - VIEW_MIN)) * SIZE,
];

function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
  return element;
}

function addLine(svg: SVGSVGElement, line: Vec3 | null, className: string, label: string): void {
  if (!line) return;
  const clipped = clipLineToSquare(line);
  if (!clipped) return;
  const start = toSvg(clipped[0]);
  const end = toSvg(clipped[1]);
  svg.append(svgElement('line', { x1: start[0], y1: start[1], x2: end[0], y2: end[1], class: className }));
  const text = svgElement('text', { x: end[0] - 8, y: end[1] - 10, class: 'svg-line-label' });
  text.textContent = label;
  svg.append(text);
}

function addPoint(
  svg: SVGSVGElement,
  point: Vec3,
  className: string,
  label: string,
  id?: string,
): SVGCircleElement {
  const [cx, cy] = toSvg(point);
  const circle = svgElement('circle', { cx, cy, r: className.includes('candidate') ? 5 : 8, class: className });
  if (id) circle.id = id;
  const text = svgElement('text', { x: cx + 12, y: cy - 12, class: 'svg-point-label' });
  text.textContent = label;
  svg.append(circle, text);
  return circle;
}

function addEpipole(svg: SVGSVGElement, epipole: Vec3 | null, label: string): void {
  if (!epipole) {
    const text = svgElement('text', { x: 458, y: 32, class: 'svg-infinity-label' });
    text.textContent = `${label} → ∞`;
    svg.append(text);
    return;
  }
  if (epipole[0] >= VIEW_MIN && epipole[0] <= VIEW_MAX && epipole[1] >= VIEW_MIN && epipole[1] <= VIEW_MAX) {
    addPoint(svg, epipole, 'svg-epipole', label);
    return;
  }
  const scale = Math.max(Math.abs(epipole[0]) / VIEW_MAX, Math.abs(epipole[1]) / VIEW_MAX, 1);
  const edge: Vec3 = [epipole[0] / scale, epipole[1] / scale, 1];
  const [x, y] = toSvg(edge);
  const text = svgElement('text', { x: Math.min(452, Math.max(24, x)), y: Math.min(476, Math.max(26, y)), class: 'svg-infinity-label' });
  text.textContent = `${label} ↗`;
  svg.append(text);
}

function addGrid(svg: SVGSVGElement): void {
  svg.replaceChildren();
  const defs = svgElement('defs');
  const pattern = svgElement('pattern', { id: `${svg.id}-grid`, width: 50, height: 50, patternUnits: 'userSpaceOnUse' });
  pattern.append(svgElement('path', { d: 'M 50 0 L 0 0 0 50', class: 'svg-grid-line' }));
  defs.append(pattern);
  svg.append(defs, svgElement('rect', { width: SIZE, height: SIZE, fill: `url(#${svg.id}-grid)` }));
  svg.append(
    svgElement('line', { x1: 0, y1: SIZE / 2, x2: SIZE, y2: SIZE / 2, class: 'svg-axis' }),
    svgElement('line', { x1: SIZE / 2, y1: 0, x2: SIZE / 2, y2: SIZE, class: 'svg-axis' }),
  );
  const u = svgElement('text', { x: 474, y: 242, class: 'svg-axis-label' });
  u.textContent = 'u';
  const v = svgElement('text', { x: 260, y: 24, class: 'svg-axis-label' });
  v.textContent = 'v';
  svg.append(u, v);
}

export class ImagePlaneViews {
  private dragging = false;

  constructor(
    private readonly camera1Svg: SVGSVGElement,
    private readonly camera2Svg: SVGSVGElement,
    private readonly store: AppStore,
  ) {
    this.camera1Svg.addEventListener('pointerdown', this.startDrag);
    this.camera1Svg.addEventListener('pointermove', this.drag);
    this.camera1Svg.addEventListener('pointerup', this.endDrag);
    this.camera1Svg.addEventListener('pointercancel', this.endDrag);
  }

  update(snapshot: GeometrySnapshot, visibility: SceneVisibility): void {
    addGrid(this.camera1Svg);
    addGrid(this.camera2Svg);

    if (visibility.lines) {
      addLine(this.camera1Svg, snapshot.ray.line1, 'svg-epiline', 'l');
      addLine(this.camera2Svg, snapshot.ray.line2FromF, 'svg-epiline', 'l′ = Fx');
    }
    if (visibility.family) {
      snapshot.family.forEach((ray, index) => {
        addLine(this.camera1Svg, ray.line1, `svg-family-line family-${index}`, `l${index + 1}`);
        addLine(this.camera2Svg, ray.line2FromF, `svg-family-line family-${index}`, `l′${index + 1}`);
        addPoint(this.camera1Svg, ray.x, `svg-family-point family-${index}`, `x${index + 1}`);
      });
    }
    addPoint(this.camera1Svg, snapshot.x, 'svg-selected-point', 'x · drag me', 'draggable-x');

    if (visibility.camera2) {
      snapshot.candidateProjections2.forEach((projection, index) => {
        if (projection.normalized && projection.inFront) {
          addPoint(this.camera2Svg, projection.normalized, 'svg-candidate-point', `λ${index + 1}`);
        }
      });
      if (visibility.correspondence && snapshot.projection2.normalized && snapshot.projection2.inFront) {
        addPoint(this.camera2Svg, snapshot.projection2.normalized, 'svg-correspondence-point', 'x′');
      }
    }
    if (visibility.epipoles) {
      addEpipole(this.camera1Svg, snapshot.epipolar.epipole1?.normalized ?? null, 'e');
      addEpipole(this.camera2Svg, snapshot.epipolar.epipole2?.normalized ?? null, 'e′');
    }
  }

  private startDrag = (event: PointerEvent): void => {
    this.dragging = true;
    this.camera1Svg.setPointerCapture(event.pointerId);
    this.updateFromPointer(event);
  };

  private drag = (event: PointerEvent): void => {
    if (this.dragging) this.updateFromPointer(event);
  };

  private endDrag = (event: PointerEvent): void => {
    if (this.dragging && this.camera1Svg.hasPointerCapture(event.pointerId)) {
      this.camera1Svg.releasePointerCapture(event.pointerId);
    }
    this.dragging = false;
  };

  private updateFromPointer(event: PointerEvent): void {
    const point = pointerToNormalized(event.clientX, event.clientY, this.camera1Svg.getBoundingClientRect());
    this.store.setImagePoint(point.u, point.v);
  }
}
