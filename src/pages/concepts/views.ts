import type { Mat3, Vec3 } from '../../types';

export const formatScalar = (value: number, digits = 3): string =>
  Math.abs(value) < 1e-3 && value !== 0 ? value.toExponential(2) : value.toFixed(digits);

export const formatVector = (vector: Vec3, digits = 3): string =>
  `[${vector.map((value) => formatScalar(value, digits)).join(', ')}]ᵀ`;

export const formatMatrix = (matrix: Mat3, digits = 3): string => [0, 1, 2]
  .map((row) => matrix.slice(row * 3, row * 3 + 3).map((value) => formatScalar(value, digits)).join('  '))
  .join('\n');

