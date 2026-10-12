import { EigenvalueDecomposition, Matrix, SingularValueDecomposition } from 'ml-matrix';
import type { CameraPose, Mat3 } from '../types';
import { mat3Mul, transpose3 } from '../math/linearAlgebra';
import {
  calibratedEpipolar,
  canonicalizeMatrix,
  invertIntrinsics as invertCalibratedIntrinsics,
  matrixAgreementUpToScale,
} from '../math/calibratedEpipolar';
import type { Correspondence } from './types';

export interface PointNormalization {
  scale: number;
  centerX: number;
  centerY: number;
}

export interface PinholeCamera {
  /** Upper-triangular intrinsics K, row-major. */
  intrinsics: Mat3;
  /** World-to-camera extrinsics, as everywhere else in the app: Xc = R(Xw - C). */
  pose: CameraPose;
}

export function allIndices(count: number): Int32Array {
  const indices = new Int32Array(count);
  for (let i = 0; i < count; i += 1) indices[i] = i;
  return indices;
}

/**
 * Hartley normalization of one side of the correspondences: the centroid moves to
 * the origin and the mean distance from it becomes √2.
 */
export function hartleyNormalization(
  matches: readonly Correspondence[],
  indices: ArrayLike<number>,
  side: 'source' | 'target',
): PointNormalization | null {
  const offset = side === 'source' ? 0 : 2;
  const count = indices.length;
  if (count === 0) return null;
  let centerX = 0;
  let centerY = 0;
  for (let k = 0; k < count; k += 1) {
    const match = matches[indices[k]];
    centerX += match[offset];
    centerY += match[offset + 1];
  }
  centerX /= count;
  centerY /= count;
  let meanDistance = 0;
  for (let k = 0; k < count; k += 1) {
    const match = matches[indices[k]];
    meanDistance += Math.hypot(match[offset] - centerX, match[offset + 1] - centerY);
  }
  meanDistance /= count;
  if (!(meanDistance > 1e-12)) return null;
  return { scale: Math.SQRT2 / meanDistance, centerX, centerY };
}

export const normalizationMatrix = (normalization: PointNormalization): Mat3 => [
  normalization.scale, 0, -normalization.scale * normalization.centerX,
  0, normalization.scale, -normalization.scale * normalization.centerY,
  0, 0, 1,
];

/** Unit Frobenius norm, with the largest-magnitude entry made positive so equal models print identically. */
export function canonicalScale(matrix: Mat3): Mat3 | null {
  return canonicalizeMatrix(matrix);
}

/** Eigenvector of the smallest eigenvalue of a symmetric n×n matrix stored row-major. */
export function smallestEigenvector(symmetric: Float64Array, size: number): number[] | null {
  const rows: number[][] = [];
  for (let row = 0; row < size; row += 1) rows.push(Array.from(symmetric.subarray(row * size, row * size + size)));
  const decomposition = new EigenvalueDecomposition(new Matrix(rows), { assumeSymmetric: true });
  const values = decomposition.realEigenvalues;
  let minimum = 0;
  for (let i = 1; i < values.length; i += 1) if (values[i] < values[minimum]) minimum = i;
  const vector = decomposition.eigenvectorMatrix.getColumn(minimum);
  return vector.every(Number.isFinite) ? vector : null;
}

/** Projects a 3×3 matrix onto the closest rank-2 matrix in Frobenius norm (zeroes σ₃). */
export function enforceRank2(matrix: Mat3): Mat3 | null {
  const svd = new SingularValueDecomposition(new Matrix([
    [matrix[0], matrix[1], matrix[2]],
    [matrix[3], matrix[4], matrix[5]],
    [matrix[6], matrix[7], matrix[8]],
  ]));
  const values = svd.diagonal;
  const left = svd.leftSingularVectors;
  const right = svd.rightSingularVectors;
  let smallest = 0;
  for (let i = 1; i < 3; i += 1) if (values[i] < values[smallest]) smallest = i;
  const result = Array<number>(9).fill(0);
  for (let k = 0; k < 3; k += 1) {
    if (k === smallest) continue;
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        result[row * 3 + column] += values[k] * left.get(row, k) * right.get(column, k);
      }
    }
  }
  return result.every(Number.isFinite) ? result as unknown as Mat3 : null;
}

/**
 * Normalized eight-point algorithm (Hartley 1997). Solves x2ᵀ F x1 = 0 in least squares over the
 * selected correspondences, enforces rank 2, and undoes the normalization: F = T2ᵀ F̂ T1.
 */
export function eightPoint(
  matches: readonly Correspondence[],
  indices: ArrayLike<number> = allIndices(matches.length),
): Mat3 | null {
  if (indices.length < 8) return null;
  const source = hartleyNormalization(matches, indices, 'source');
  const target = hartleyNormalization(matches, indices, 'target');
  if (!source || !target) return null;

  const normal = new Float64Array(81);
  const row = new Float64Array(9);
  for (let k = 0; k < indices.length; k += 1) {
    const match = matches[indices[k]];
    const x1 = (match[0] - source.centerX) * source.scale;
    const y1 = (match[1] - source.centerY) * source.scale;
    const x2 = (match[2] - target.centerX) * target.scale;
    const y2 = (match[3] - target.centerY) * target.scale;
    row[0] = x2 * x1; row[1] = x2 * y1; row[2] = x2;
    row[3] = y2 * x1; row[4] = y2 * y1; row[5] = y2;
    row[6] = x1; row[7] = y1; row[8] = 1;
    for (let i = 0; i < 9; i += 1) {
      for (let j = i; j < 9; j += 1) normal[i * 9 + j] += row[i] * row[j];
    }
  }
  for (let i = 0; i < 9; i += 1) {
    for (let j = 0; j < i; j += 1) normal[i * 9 + j] = normal[j * 9 + i];
  }

  const solution = smallestEigenvector(normal, 9);
  if (!solution) return null;
  const rankTwo = enforceRank2(solution as unknown as Mat3);
  if (!rankTwo) return null;
  return canonicalScale(mat3Mul(
    mat3Mul(transpose3(normalizationMatrix(target)), rankTwo),
    normalizationMatrix(source),
  ));
}

/**
 * First-order geometric error of a correspondence under F, squared, in pixels²:
 * (x2ᵀFx1)² / ((Fx1)₁² + (Fx1)₂² + (Fᵀx2)₁² + (Fᵀx2)₂²).
 */
export function sampsonDistanceSquared(fundamental: Mat3, x1: number, y1: number, x2: number, y2: number): number {
  const f = fundamental;
  const lx = f[0] * x1 + f[1] * y1 + f[2];
  const ly = f[3] * x1 + f[4] * y1 + f[5];
  const lz = f[6] * x1 + f[7] * y1 + f[8];
  const mx = f[0] * x2 + f[3] * y2 + f[6];
  const my = f[1] * x2 + f[4] * y2 + f[7];
  const residual = x2 * lx + y2 * ly + lz;
  const denominator = lx * lx + ly * ly + mx * mx + my * my;
  return denominator > 0 ? residual * residual / denominator : Number.POSITIVE_INFINITY;
}

export const matchSampsonSquared = (fundamental: Mat3, match: Correspondence): number =>
  sampsonDistanceSquared(fundamental, match[0], match[1], match[2], match[3]);

/** Root-mean-square Sampson distance over the correspondences flagged in `mask` (all when omitted). */
export function rmsSampson(fundamental: Mat3, matches: readonly Correspondence[], mask?: Uint8Array): number {
  let sum = 0;
  let count = 0;
  matches.forEach((match, index) => {
    if (mask && !mask[index]) return;
    sum += matchSampsonSquared(fundamental, match);
    count += 1;
  });
  return count ? Math.sqrt(sum / count) : Number.NaN;
}

/** Inverse of an upper-triangular intrinsics matrix [fx s cx; 0 fy cy; 0 0 1]. */
export function invertIntrinsics(intrinsics: Mat3): Mat3 {
  return invertCalibratedIntrinsics(intrinsics);
}

/** Exact F = K₂⁻ᵀ [t]× R K₁⁻¹ for two known cameras, with R = R₂R₁ᵀ and t = R₂(C₁ − C₂). */
export function fundamentalFromCameras(source: PinholeCamera, target: PinholeCamera): Mat3 {
  const result = calibratedEpipolar(source, target);
  return result.fundamentalCanonical ?? result.fundamentalRaw;
}

/** Distance between two fundamental matrices up to scale and sign (0 means identical models). */
export function fundamentalDifference(first: Mat3, second: Mat3): number {
  return matrixAgreementUpToScale(first, second) ?? Number.POSITIVE_INFINITY;
}
