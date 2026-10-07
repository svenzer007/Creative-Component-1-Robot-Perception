import { Matrix, SingularValueDecomposition } from 'ml-matrix';
import type { Mat3, Vec3 } from '../types';

export const EPSILON = 1e-10;
export const IDENTITY_3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale3 = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
export const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm3 = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

export function normalize3(v: Vec3, epsilon = EPSILON): Vec3 | null {
  const length = norm3(v);
  return length <= epsilon ? null : scale3(v, 1 / length);
}

export const mat3Vec3 = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

export function mat3Mul(a: Mat3, b: Mat3): Mat3 {
  const result = Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      for (let k = 0; k < 3; k += 1) {
        result[row * 3 + column] += a[row * 3 + k] * b[k * 3 + column];
      }
    }
  }
  return result as unknown as Mat3;
}

export const transpose3 = (m: Mat3): Mat3 => [
  m[0], m[3], m[6],
  m[1], m[4], m[7],
  m[2], m[5], m[8],
];

export const skew3 = (v: Vec3): Mat3 => [
  0, -v[2], v[1],
  v[2], 0, -v[0],
  -v[1], v[0], 0,
];

export function rotationX(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

export function rotationY(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

export function normalizeLine(line: Vec3, epsilon = EPSILON): Vec3 | null {
  const length = Math.hypot(line[0], line[1]);
  if (length <= epsilon) return null;
  const normalized = scale3(line, 1 / length);
  const sign = Math.abs(normalized[0]) > epsilon
    ? Math.sign(normalized[0])
    : Math.abs(normalized[1]) > epsilon ? Math.sign(normalized[1]) : 1;
  return sign < 0 ? scale3(normalized, -1) : normalized;
}

export function lineAgreement(a: Vec3, b: Vec3): number | null {
  const na = normalizeLine(a);
  const nb = normalizeLine(b);
  if (!na || !nb) return null;
  const direct = norm3(sub3(na, nb));
  const flipped = norm3(add3(na, nb));
  return Math.min(direct, flipped);
}

export interface Svd3Result {
  singularValues: Vec3;
  leftNull: Vec3;
  rightNull: Vec3;
  rank: number;
}

/** Isolates the external numerical library from the rest of the application. */
export function svd3(matrix: Mat3): Svd3Result {
  const source = new Matrix([
    [matrix[0], matrix[1], matrix[2]],
    [matrix[3], matrix[4], matrix[5]],
    [matrix[6], matrix[7], matrix[8]],
  ]);
  const svd = new SingularValueDecomposition(source, { autoTranspose: true });
  const values = [...svd.diagonal].sort((a, b) => b - a) as unknown as Vec3;
  const left = svd.leftSingularVectors;
  const right = svd.rightSingularVectors;
  const leftNull: Vec3 = [left.get(0, 2), left.get(1, 2), left.get(2, 2)];
  const rightNull: Vec3 = [right.get(0, 2), right.get(1, 2), right.get(2, 2)];
  const tolerance = values[0] <= EPSILON ? EPSILON : values[0] * 1e-10;
  return {
    singularValues: values,
    leftNull,
    rightNull,
    rank: values.filter((value) => value > tolerance).length,
  };
}

export const degreesToRadians = (degrees: number): number => degrees * Math.PI / 180;
