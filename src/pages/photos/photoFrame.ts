import type { Vec3 } from '../../types';
import { clipToImage, type Pixel } from '../../vision/geometry2d';
import { clientToImage, imagePixelsPerCssPixel, type PhotoView } from './model';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LAYERS = ['matches', 'pencil', 'lines', 'ghost'] as const;
type Layer = (typeof LAYERS)[number];

export type LineVariant = 'normal' | 'strong' | 'ghost' | 'pencil' | 'transfer';

export interface LineStyle {
  color: string;
  variant?: LineVariant;
  /** Animate the line growing out of this end (the side nearer the epipole). */
  growFrom?: Pixel | null;
}

export type MarkKind = 'pin' | 'match' | 'truth' | 'suggestion' | 'epipole' | 'transfer' | 'manual' | 'pending';

export interface MarkOptions {
  color?: string;
  label?: string;
  title?: string;
  active?: boolean;
  fresh?: boolean;
  ghost?: boolean;
}

export interface FrameCallbacks {
  down(view: number, point: Pixel, event: PointerEvent, scale: number): void;
  move(view: number, point: Pixel, event: PointerEvent, scale: number): void;
  up(view: number, point: Pixel, event: PointerEvent, scale: number): void;
  cancel(view: number): void;
  leave(view: number): void;
  key(view: number, event: KeyboardEvent): void;
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
  return element;
}

const pathData = (a: Pixel, b: Pixel): string =>
  `M${a[0].toFixed(2)} ${a[1].toFixed(2)}L${b[0].toFixed(2)} ${b[1].toFixed(2)}`;

/**
 * One camera frame: the photo on a canvas, lines and dots in an SVG overlay sized in image
 * pixels, and HTML markers positioned in percentages so labels stay crisp at any size.
 */
export class PhotoFrame {
  readonly element: HTMLElement;
  width = 1;
  height = 1;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly overlay: SVGSVGElement;
  private readonly layers: Record<Layer, SVGGElement>;
  private readonly marks: HTMLElement;
  private readonly ghostMarks: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly name: HTMLElement;
  private readonly role: HTMLElement;
  private readonly readout: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly loupe: HTMLElement;
  private readonly loupeContext: CanvasRenderingContext2D;

  constructor(readonly index: number, callbacks: FrameCallbacks) {
    const element = document.createElement('figure');
    element.className = 'ph-frame';
    element.tabIndex = 0;
    element.innerHTML = `
      <canvas class="ph-photo"></canvas>
      <svg class="ph-overlay" preserveAspectRatio="none" aria-hidden="true"></svg>
      <div class="ph-marks"></div>
      <div class="ph-marks ph-ghost-marks"></div>
      <span class="ph-corner tl"></span><span class="ph-corner tr"></span><span class="ph-corner bl"></span><span class="ph-corner br"></span>
      <figcaption class="ph-caption"><span class="ph-badge"></span><span class="ph-name"></span><span class="ph-role">view</span></figcaption>
      <span class="ph-readout" aria-hidden="true">u —   v —</span>
      <span class="ph-meta"></span>
      <div class="ph-loupe" hidden><canvas width="132" height="132"></canvas></div>
    `;
    this.element = element;
    this.canvas = element.querySelector<HTMLCanvasElement>('.ph-photo')!;
    this.context = this.canvas.getContext('2d', { willReadFrequently: false })!;
    this.overlay = element.querySelector<SVGSVGElement>('.ph-overlay')!;
    this.layers = Object.fromEntries(LAYERS.map((layer) => {
      const group = svg('g', { class: `ph-layer-${layer}` });
      this.overlay.append(group);
      return [layer, group];
    })) as Record<Layer, SVGGElement>;
    this.marks = element.querySelector<HTMLElement>('.ph-marks')!;
    this.ghostMarks = element.querySelector<HTMLElement>('.ph-ghost-marks')!;
    this.badge = element.querySelector<HTMLElement>('.ph-badge')!;
    this.name = element.querySelector<HTMLElement>('.ph-name')!;
    this.role = element.querySelector<HTMLElement>('.ph-role')!;
    this.readout = element.querySelector<HTMLElement>('.ph-readout')!;
    this.meta = element.querySelector<HTMLElement>('.ph-meta')!;
    this.loupe = element.querySelector<HTMLElement>('.ph-loupe')!;
    this.loupeContext = this.loupe.querySelector('canvas')!.getContext('2d')!;

    const locate = (event: PointerEvent): [Pixel, number] => {
      const box = element.getBoundingClientRect();
      return [clientToImage(event.clientX, event.clientY, box, this.width, this.height), imagePixelsPerCssPixel(box, this.width)];
    };
    element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const [point, scale] = locate(event);
      callbacks.down(index, point, event, scale);
    });
    element.addEventListener('pointermove', (event) => {
      const [point, scale] = locate(event);
      callbacks.move(index, point, event, scale);
    });
    element.addEventListener('pointerup', (event) => {
      const [point, scale] = locate(event);
      callbacks.up(index, point, event, scale);
    });
    element.addEventListener('pointercancel', () => callbacks.cancel(index));
    element.addEventListener('pointerleave', () => callbacks.leave(index));
    element.addEventListener('keydown', (event) => callbacks.key(index, event));
    element.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  setView(view: PhotoView, paint = true): void {
    this.width = view.width;
    this.height = view.height;
    this.element.style.setProperty('--cam', view.color);
    this.element.style.aspectRatio = `${view.width} / ${view.height}`;
    this.element.setAttribute('aria-label', `${view.label}. Click to pin a point; arrow keys nudge the active pin.`);
    this.overlay.setAttribute('viewBox', `0 0 ${view.width} ${view.height}`);
    if (this.canvas.width !== view.width || this.canvas.height !== view.height) {
      this.canvas.width = view.width;
      this.canvas.height = view.height;
    }
    this.badge.textContent = view.key;
    this.name.textContent = view.label;
    if (paint) this.context.putImageData(new ImageData(view.rgba, view.width, view.height), 0, 0);
    else this.context.clearRect(0, 0, view.width, view.height);
  }

  /** Paints rows [startRow, endRow) while the sample room renders progressively. */
  paintRows(rows: Uint8ClampedArray<ArrayBuffer>, startRow: number, endRow: number): void {
    this.context.putImageData(new ImageData(rows, this.width, endRow - startRow), 0, startRow);
  }

  set hidden(hidden: boolean) {
    this.element.hidden = hidden;
  }

  setRole(text: string, isSource: boolean): void {
    this.role.textContent = text;
    this.element.classList.toggle('is-source', isSource);
  }

  setReadout(point: Pixel | null): void {
    this.readout.textContent = point ? `u ${point[0].toFixed(1)}   v ${point[1].toFixed(1)}` : 'u —   v —';
  }

  setMeta(text: string): void {
    this.meta.textContent = text;
  }

  clear(...layers: Layer[]): void {
    layers.forEach((layer) => this.layers[layer].replaceChildren());
  }

  clearMarks(ghost = false): void {
    (ghost ? this.ghostMarks : this.marks).replaceChildren();
  }

  /** Draws the part of a homogeneous line that crosses the image; returns false when it misses. */
  line(layer: Layer, line: Vec3 | null, style: LineStyle): boolean {
    if (!line) return false;
    const clipped = clipToImage(line, this.width, this.height);
    if (!clipped) return false;
    let start: Pixel = [clipped[0][0], clipped[0][1]];
    let end: Pixel = [clipped[1][0], clipped[1][1]];
    if (style.growFrom) {
      const [gx, gy] = style.growFrom;
      if (Math.hypot(end[0] - gx, end[1] - gy) < Math.hypot(start[0] - gx, start[1] - gy)) [start, end] = [end, start];
    }
    this.segment(layer, start, end, style);
    return true;
  }

  segment(layer: Layer, start: Pixel, end: Pixel, style: LineStyle): void {
    const variant = style.variant ?? 'normal';
    const d = pathData(start, end);
    const group = this.layers[layer];
    const glow = variant === 'normal' || variant === 'strong' || variant === 'transfer'
      ? svg('path', { d, stroke: style.color, class: 'ph-line-glow', 'vector-effect': 'non-scaling-stroke' })
      : null;
    const core = svg('path', { d, stroke: style.color, class: `ph-line ph-line-${variant}`, 'vector-effect': 'non-scaling-stroke' });
    if (glow) group.append(glow);
    group.append(core);
    if (style.growFrom && !reducedMotion.matches) this.grow([glow, core], start, end);
  }

  private grow(paths: (SVGPathElement | null)[], start: Pixel, end: Pixel): void {
    const began = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - began) / 650);
      const eased = 1 - (1 - t) ** 3;
      const d = pathData(start, [start[0] + (end[0] - start[0]) * eased, start[1] + (end[1] - start[1]) * eased]);
      paths.forEach((path) => path?.setAttribute('d', d));
      if (t < 1 && paths[1]?.isConnected) requestAnimationFrame(step);
    };
    step(began);
  }

  /** Small filled circles for keypoints or matches; `points` holds x, y pairs. */
  dots(layer: Layer, points: ArrayLike<number>, className: string, radius: number): void {
    const group = this.layers[layer];
    for (let i = 0; i + 1 < points.length; i += 2) {
      group.append(svg('circle', { cx: points[i].toFixed(1), cy: points[i + 1].toFixed(1), r: radius, class: className }));
    }
  }

  crosshair(point: Pixel, color: string, size: number): void {
    const [x, y] = point;
    const gap = size * 0.3;
    this.layers.ghost.append(svg('path', {
      d: `M${x - size} ${y}H${x - gap}M${x + gap} ${y}H${x + size}M${x} ${y - size}V${y - gap}M${x} ${y + gap}V${y + size}`,
      stroke: color,
      class: 'ph-crosshair',
      'vector-effect': 'non-scaling-stroke',
    }));
  }

  mark(kind: MarkKind, point: Pixel, options: MarkOptions = {}): HTMLElement {
    const mark = document.createElement('div');
    mark.className = `ph-mark ph-${kind}${options.active ? ' is-active' : ''}${options.fresh && !reducedMotion.matches ? ' is-fresh' : ''}`;
    mark.style.left = `${point[0] / this.width * 100}%`;
    mark.style.top = `${point[1] / this.height * 100}%`;
    if (options.color) mark.style.setProperty('--mark', options.color);
    if (options.title) mark.title = options.title;
    if (options.label) {
      const tag = document.createElement('span');
      tag.className = 'ph-tag';
      if (point[0] > this.width * 0.74) tag.classList.add('flip');
      if (point[1] < this.height * 0.16) tag.classList.add('below');
      tag.textContent = options.label;
      mark.append(tag);
    }
    (options.ghost ? this.ghostMarks : this.marks).append(mark);
    return mark;
  }

  /** A chip on the frame edge pointing toward an off-frame epipole. */
  edgeChip(direction: Pixel, label: string, color: string, title: string): void {
    const [dx, dy] = direction;
    const length = Math.hypot(dx, dy) || 1;
    // Keep the chip's on-screen size clear of the corners whatever the frame's displayed width.
    const imagePerCss = this.width / Math.max(1, this.element.clientWidth);
    const insetX = Math.min(this.width * 0.4, 72 * imagePerCss);
    const insetY = Math.min(this.height * 0.4, 30 * imagePerCss);
    const scale = Math.min(
      (this.width / 2 - insetX) / Math.max(1e-9, Math.abs(dx / length)),
      (this.height / 2 - insetY) / Math.max(1e-9, Math.abs(dy / length)),
    );
    const point: Pixel = [this.width / 2 + (dx / length) * scale, this.height / 2 + (dy / length) * scale];
    const chip = this.mark('epipole', point, { color, title });
    chip.classList.add('is-edge');
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    chip.innerHTML = `<svg viewBox="0 0 14 14" aria-hidden="true" style="transform:rotate(${angle.toFixed(1)}deg)"><path d="M2 7h8M7 3.5 10.5 7 7 10.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span></span>`;
    chip.querySelector('span')!.textContent = label;
  }

  /** Magnifier above the finger while placing or dragging a point on touch screens. */
  showLoupe(point: Pixel, color: string): void {
    const size = 132;
    const zoom = 3;
    const radius = size / zoom / 2;
    const context = this.loupeContext;
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#0b1019';
    context.fillRect(0, 0, size, size);
    context.drawImage(this.canvas, point[0] - radius, point[1] - radius, radius * 2, radius * 2, 0, 0, size, size);
    this.loupe.style.setProperty('--mark', color);
    this.loupe.style.left = `${point[0] / this.width * 100}%`;
    this.loupe.style.top = `${point[1] / this.height * 100}%`;
    this.loupe.classList.toggle('below', point[1] / this.height < 0.35);
    this.loupe.hidden = false;
  }

  hideLoupe(): void {
    this.loupe.hidden = true;
  }
}
