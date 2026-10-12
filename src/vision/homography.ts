import type { Mat3 } from '../types';
import { mat3Mul } from '../math/linearAlgebra';
import { allIndices, hartleyNormalization, normalizationMatrix, smallestEigenvector } from './fundamental';
import type { Correspondence } from './types';

export function invert3(matrix: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const c00 = e * i - f * h;
  const c01 = f * g - d * i;
  const c02 = d * h - e * g;
  const determinant = a * c00 + b * c01 + c * c02;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-300) return null;
  const s = 1 / determinant;
  return [
    c00 * s, (c * h - b * i) * s, (b * f - c * e) * s,
    c01 * s, (a * i - c * g) * s, (c * d - a * f) * s,
    c02 * s, (b * g - a * h) * s, (a * e - b * d) * s,
  ];
}

/** Scales H so H₃₃ = 1 when possible, which keeps printed homographies readable. */
function scaleHomography(homography: Mat3): Mat3 | null {
  const divisor = Math.abs(homography[8]) > 1e-12 ? homography[8] : Math.hypot(...homography);
  if (!(Math.abs(divisor) > 0)) return null;
  const scaled = homography.map((value) => value / divisor);
  return scaled.every(Number.isFinite) ? scaled as unknown as Mat3 : null;
}

/** Normalized direct linear transform for x2 ~ H x1 over the selected correspondences (needs 4+). */
export function homographyDlt(
  matches: readonly Correspondence[],
  indices: ArrayLike<number> = allIndices(matches.length),
): Mat3 | null {
  if (indices.length < 4) return null;
  const source = hartleyNormalization(matches, indices, 'source');
  const target = hartleyNormalization(matches, indices, 'target');
  if (!source || !target) return null;

  const normal = new Float64Array(81);
  const first = new Float64Array(9);
  const second = new Float64Array(9);
  for (let k = 0; k < indices.length; k += 1) {
    const match = matches[indices[k]];
    const x = (match[0] - source.centerX) * source.scale;
    const y = (match[1] - source.centerY) * source.scale;
    const u = (match[2] - target.centerX) * target.scale;
    const v = (match[3] - target.centerY) * target.scale;
    first.set([0, 0, 0, -x, -y, -1, v * x, v * y, v]);
    second.set([x, y, 1, 0, 0, 0, -u * x, -u * y, -u]);
    for (let i = 0; i < 9; i += 1) {
      for (let j = i; j < 9; j += 1) normal[i * 9 + j] += first[i] * first[j] + second[i] * second[j];
    }
  }
  for (let i = 0; i < 9; i += 1) {
    for (let j = 0; j < i; j += 1) normal[i * 9 + j] = normal[j * 9 + i];
  }

  const solution = smallestEigenvector(normal, 9);
  if (!solution) return null;
  const denormalizeTarget: Mat3 = [
    1 / target.scale, 0, target.centerX,
    0, 1 / target.scale, target.centerY,
    0, 0, 1,
  ];
  return scaleHomography(mat3Mul(mat3Mul(denormalizeTarget, solution as unknown as Mat3), normalizationMatrix(source)));
}

/** Squared distance between x2 and the transferred point H x1, in pixels². */
export function transferErrorSquared(homography: Mat3, x1: number, y1: number, x2: number, y2: number): number {
  const h = homography;
  const w = h[6] * x1 + h[7] * y1 + h[8];
  if (Math.abs(w) < 1e-12) return Number.POSITIVE_INFINITY;
  const u = (h[0] * x1 + h[1] * y1 + h[2]) / w;
  const v = (h[3] * x1 + h[4] * y1 + h[5]) / w;
  return (u - x2) ** 2 + (v - y2) ** 2;
}
