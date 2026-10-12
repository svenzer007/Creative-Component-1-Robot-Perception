import type { CameraPose, Mat3, Vec3 } from '../types';
import { EPSILON, mat3Mul, mat3Vec3, skew3, sub3, transpose3 } from './linearAlgebra';

export interface RelativePose {
  /** Rotation taking a point from source-camera coordinates to target-camera coordinates. */
  rotation: Mat3;
  /** Source camera centre expressed from the target camera: R₂(C₁ − C₂). */
  translation: Vec3;
}

export interface CalibratedCamera {
  /** Upper-triangular intrinsic calibration matrix. */
  intrinsics: Mat3;
  /** World-to-camera pose using Xc = R(Xw − C). */
  pose: CameraPose;
}

export type CalibratedEpipolarStatus = 'valid' | 'degenerate';

export interface CalibratedEpipolarResult extends RelativePose {
  essentialRaw: Mat3;
  essentialCanonical: Mat3 | null;
  fundamentalRaw: Mat3;
  fundamentalCanonical: Mat3 | null;
  status: CalibratedEpipolarStatus;
}

/** Relative pose for arbitrary source and target cameras under Xc = R(Xw − C). */
export function relativePose(source: CameraPose, target: CameraPose): RelativePose {
  return {
    rotation: mat3Mul(target.rotation, transpose3(source.rotation)),
    translation: mat3Vec3(target.rotation, sub3(source.center, target.center)),
  };
}

/** Raw essential matrix E = [t]×R. Its magnitude intentionally retains baseline scale. */
export function essentialFromPoses(source: CameraPose, target: CameraPose): Mat3 {
  const relative = relativePose(source, target);
  return mat3Mul(skew3(relative.translation), relative.rotation);
}

/** Inverse of K = [fx s cx; 0 fy cy; 0 0 1]. */
export function invertIntrinsics(intrinsics: Mat3): Mat3 {
  const [fx, skew, cx, , fy, cy] = intrinsics;
  return [
    1 / fx, -skew / (fx * fy), (skew * cy - cx * fy) / (fx * fy),
    0, 1 / fy, -cy / fy,
    0, 0, 1,
  ];
}

/** Raw F = K₂⁻ᵀ E K₁⁻¹. No normalization is applied. */
export function fundamentalFromEssential(essential: Mat3, sourceK: Mat3, targetK: Mat3): Mat3 {
  return mat3Mul(
    mat3Mul(transpose3(invertIntrinsics(targetK)), essential),
    invertIntrinsics(sourceK),
  );
}

/** E = K₂ᵀ F K₁. F may be at any nonzero homogeneous scale. */
export function essentialFromFundamental(fundamental: Mat3, sourceK: Mat3, targetK: Mat3): Mat3 {
  return mat3Mul(mat3Mul(transpose3(targetK), fundamental), sourceK);
}

/** Pixel homogeneous coordinate mapped onto the calibrated z=1 image plane. */
export function normalizeImagePoint(intrinsics: Mat3, pixel: Vec3): Vec3 {
  const normalized = mat3Vec3(invertIntrinsics(intrinsics), pixel);
  if (Math.abs(normalized[2]) <= EPSILON) return normalized;
  return [normalized[0] / normalized[2], normalized[1] / normalized[2], 1];
}

/** Unit Frobenius norm with deterministic sign. Zero/invalid matrices have no canonical form. */
export function canonicalizeMatrix(matrix: Mat3): Mat3 | null {
  let squaredNorm = 0;
  let largest = 0;
  for (const value of matrix) {
    squaredNorm += value * value;
    if (Math.abs(value) > Math.abs(largest)) largest = value;
  }
  const norm = Math.sqrt(squaredNorm);
  if (!(norm > EPSILON) || !Number.isFinite(norm)) return null;
  const scale = (largest < 0 ? -1 : 1) / norm;
  return matrix.map((value) => value * scale) as unknown as Mat3;
}

/** Frobenius disagreement after removing homogeneous scale and sign. */
export function matrixAgreementUpToScale(first: Mat3, second: Mat3): number | null {
  const a = canonicalizeMatrix(first);
  const b = canonicalizeMatrix(second);
  if (!a || !b) return null;
  let direct = 0;
  let flipped = 0;
  for (let index = 0; index < 9; index += 1) {
    direct += (a[index] - b[index]) ** 2;
    flipped += (a[index] + b[index]) ** 2;
  }
  return Math.sqrt(Math.min(direct, flipped));
}

/** Derives raw and display-safe canonical calibrated epipolar matrices from two cameras. */
export function calibratedEpipolar(
  source: CalibratedCamera,
  target: CalibratedCamera,
): CalibratedEpipolarResult {
  const relative = relativePose(source.pose, target.pose);
  const essentialRaw = mat3Mul(skew3(relative.translation), relative.rotation);
  const fundamentalRaw = fundamentalFromEssential(essentialRaw, source.intrinsics, target.intrinsics);
  const essentialCanonical = canonicalizeMatrix(essentialRaw);
  const fundamentalCanonical = canonicalizeMatrix(fundamentalRaw);
  return {
    ...relative,
    essentialRaw,
    essentialCanonical,
    fundamentalRaw,
    fundamentalCanonical,
    status: essentialCanonical && fundamentalCanonical ? 'valid' : 'degenerate',
  };
}

