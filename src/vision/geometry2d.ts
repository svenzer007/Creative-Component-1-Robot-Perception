import type { EpipoleResult, Mat3, Vec3 } from '../types';
import { asEpipole, clipLineToRect } from '../math/epipolar';
import { cross3, mat3Vec3, normalizeLine, svd3, transpose3 } from '../math/linearAlgebra';

export type Pixel = readonly [number, number];

/** l′ = F x for a source pixel, scaled so l′·[x′, y′, 1] is a signed distance in pixels. */
export const epipolarLine = (fundamental: Mat3, point: Pixel): Vec3 | null =>
  normalizeLine(mat3Vec3(fundamental, [point[0], point[1], 1]));

/** l = Fᵀ x′: the line in the source view that a target pixel constrains. */
export const reverseEpipolarLine = (fundamental: Mat3, point: Pixel): Vec3 | null =>
  normalizeLine(mat3Vec3(transpose3(fundamental), [point[0], point[1], 1]));

export interface EpipolePair {
  /** Image of the target camera's center in the source view: F e = 0. */
  source: EpipoleResult;
  /** Image of the source camera's center in the target view: Fᵀ e′ = 0. */
  target: EpipoleResult;
}

export function epipoles(fundamental: Mat3): EpipolePair {
  const decomposition = svd3(fundamental);
  return { source: asEpipole(decomposition.rightNull), target: asEpipole(decomposition.leftNull) };
}

export const clipToImage = (line: Vec3, width: number, height: number): readonly [Vec3, Vec3] | null =>
  clipLineToRect(line, 0, 0, width, height);

export const pointLineDistance = (line: Vec3, point: Pixel): number =>
  Math.abs(line[0] * point[0] + line[1] * point[1] + line[2]) / Math.hypot(line[0], line[1]);

export function closestPointOnLine(line: Vec3, point: Pixel): Pixel {
  const [a, b, c] = line;
  const scale = (a * point[0] + b * point[1] + c) / (a * a + b * b);
  return [point[0] - a * scale, point[1] - b * scale];
}

export function intersectLines(first: Vec3, second: Vec3): Pixel | null {
  const point = cross3(first, second);
  if (Math.abs(point[2]) < 1e-12) return null;
  return [point[0] / point[2], point[1] / point[2]];
}

/** Acute angle between two lines in degrees; small angles make an intersection unstable. */
export function lineAngleDegrees(first: Vec3, second: Vec3): number {
  const cosine = Math.abs(first[0] * second[0] + first[1] * second[1])
    / (Math.hypot(first[0], first[1]) * Math.hypot(second[0], second[1]));
  return Math.acos(Math.min(1, cosine)) * 180 / Math.PI;
}

export interface TransferResult {
  point: Pixel | null;
  fromFirst: Vec3;
  fromSecond: Vec3;
  angleDegrees: number;
}

/**
 * Epipolar transfer (Hartley & Zisserman §15.3): a point seen in two views lands in a third view
 * where its two epipolar lines cross, x″ = (F₃₁ x) × (F₃₂ x′). It fails on the trifocal plane,
 * where both lines coincide.
 */
export function transferPoint(
  fundamentalFromFirst: Mat3,
  first: Pixel,
  fundamentalFromSecond: Mat3,
  second: Pixel,
): TransferResult | null {
  const fromFirst = epipolarLine(fundamentalFromFirst, first);
  const fromSecond = epipolarLine(fundamentalFromSecond, second);
  if (!fromFirst || !fromSecond) return null;
  return {
    point: intersectLines(fromFirst, fromSecond),
    fromFirst,
    fromSecond,
    angleDegrees: lineAngleDegrees(fromFirst, fromSecond),
  };
}
