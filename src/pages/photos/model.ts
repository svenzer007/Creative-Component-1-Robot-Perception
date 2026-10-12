import type { Mat3 } from '../../types';
import { transpose3 } from '../../math/linearAlgebra';
import { eightPoint, rmsSampson, sampsonDistanceSquared } from '../../vision/fundamental';
import type { Correspondence, GrayImage } from '../../vision/types';

/* Pure Photo lab model: types, colors, F lookup, coordinate mapping, and manual estimation. */

export const MIN_VIEWS = 2;
export const MAX_VIEWS = 4;
export const MAX_PINS = 4;
export const VIEW_KEYS = ['A', 'B', 'C', 'D'] as const;
/** View hues continue the 3D lab's camera colors: C1 cyan, C2 amber, then violet and coral. */
export const VIEW_COLORS = ['#52d6ff', '#ffb84d', '#a990ff', '#ff9e7a'] as const;
/** Pin hues; the first is the lab's epipolar-line green. */
export const PIN_COLORS = ['#8cffb5', '#fda4af', '#93c5fd', '#e9d5ff'] as const;

export interface PhotoView {
  key: string;
  label: string;
  color: string;
  width: number;
  height: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
  gray: GrayImage | null;
}

export interface ViewPoint {
  view: number;
  x: number;
  y: number;
}

export interface Pin extends ViewPoint {
  id: number;
  color: string;
  /** A chosen correspondence in another view; with three or more views it drives point transfer. */
  match: (ViewPoint & { origin: 'tap' | 'suggestion' }) | null;
}

export interface ManualMatch {
  id: number;
  first: ViewPoint;
  second: ViewPoint;
}

/** An F for one ordered or unordered pair, from automatic matching or from hand-marked matches. */
export interface PairModel {
  source: number;
  target: number;
  fundamental: Mat3 | null;
}

/** F mapping a pixel in `source` to its line in `target`, transposing the stored direction if needed. */
export function fundamentalBetween(models: readonly PairModel[], source: number, target: number): Mat3 | null {
  for (const model of models) {
    if (model.source === source && model.target === target) return model.fundamental;
    if (model.source === target && model.target === source) return model.fundamental ? transpose3(model.fundamental) : null;
  }
  return null;
}

export interface BoxLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Client (CSS pixel) coordinates inside a frame to image pixels, clamped to the image. */
export function clientToImage(clientX: number, clientY: number, box: BoxLike, width: number, height: number): [number, number] {
  const x = (clientX - box.left) / box.width * width;
  const y = (clientY - box.top) / box.height * height;
  return [Math.min(width, Math.max(0, x)), Math.min(height, Math.max(0, y))];
}

/** Image pixels per CSS pixel, so touch targets stay a constant on-screen size. */
export const imagePixelsPerCssPixel = (box: BoxLike, width: number): number => width / Math.max(1, box.width);

export function nextPinColor(pins: readonly Pin[]): string {
  return PIN_COLORS.find((color) => !pins.some((pin) => pin.color === color)) ?? PIN_COLORS[pins.length % PIN_COLORS.length];
}

export const pairKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Hand-marked matches between two views, oriented source → target. */
export function manualCorrespondences(matches: readonly ManualMatch[], source: number, target: number): Correspondence[] {
  const result: Correspondence[] = [];
  for (const match of matches) {
    if (match.first.view === source && match.second.view === target) {
      result.push([match.first.x, match.first.y, match.second.x, match.second.y]);
    } else if (match.first.view === target && match.second.view === source) {
      result.push([match.second.x, match.second.y, match.first.x, match.first.y]);
    }
  }
  return result;
}

export interface ManualFit {
  source: number;
  target: number;
  fundamental: Mat3 | null;
  count: number;
  /** Sampson distance of each hand-marked match in pixels, in input order. */
  residuals: number[];
  rms: number | null;
}

/**
 * Least-squares normalized eight-point fit through every hand-marked match of one pair. No RANSAC:
 * with a handful of clicks, showing each click's own residual teaches more than hiding it.
 */
export function fitManualPair(matches: readonly ManualMatch[], source: number, target: number): ManualFit {
  const correspondences = manualCorrespondences(matches, source, target);
  const fundamental = correspondences.length >= 8 ? eightPoint(correspondences) : null;
  const residuals = fundamental
    ? correspondences.map(([x1, y1, x2, y2]) => Math.sqrt(sampsonDistanceSquared(fundamental, x1, y1, x2, y2)))
    : [];
  return {
    source,
    target,
    fundamental,
    count: correspondences.length,
    residuals,
    rms: fundamental ? rmsSampson(fundamental, correspondences) : null,
  };
}

export function formatValue(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  if (value !== 0 && (Math.abs(value) < 1e-3 || Math.abs(value) >= 1e5)) return value.toExponential(2);
  return value.toFixed(digits);
}

export const formatCount = (value: number): string => Math.round(value).toLocaleString('en-US');
