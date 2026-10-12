import { describe, expect, it } from 'vitest';
import type { CameraPose, Mat3, Vec3 } from '../types';
import { cameraPoseFromControls, worldToCamera } from './camera';
import {
  calibratedEpipolar,
  canonicalizeMatrix,
  essentialFromFundamental,
  essentialFromPoses,
  fundamentalFromEssential,
  matrixAgreementUpToScale,
  normalizeImagePoint,
  relativePose,
} from './calibratedEpipolar';
import { IDENTITY_3, dot3, mat3Vec3, norm3, svd3 } from './linearAlgebra';

const K1: Mat3 = [520, 0, 320, 0, 500, 210, 0, 0, 1];
const K2: Mat3 = [570, 3, 315, 0, 550, 205, 0, 0, 1];
const source: CameraPose = cameraPoseFromControls({
  center: [-0.4, 0.2, 0.1],
  yawDegrees: 9,
  pitchDegrees: -4,
});
const target: CameraPose = cameraPoseFromControls({
  center: [1.7, -0.15, 0.4],
  yawDegrees: -13,
  pitchDegrees: 7,
});

const expectMatrixClose = (actual: Mat3, expected: Mat3, digits = 11): void => {
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], digits));
};

const projectPixel = (world: Vec3, camera: CameraPose, intrinsics: Mat3): Vec3 => {
  const point = worldToCamera(world, camera);
  const normalized: Vec3 = [point[0] / point[2], point[1] / point[2], 1];
  return mat3Vec3(intrinsics, normalized);
};

describe('calibrated epipolar geometry', () => {
  it('uses the general world-to-camera relative-pose convention', () => {
    const relative = relativePose(source, target);
    const world: Vec3 = [0.7, -0.3, 4.5];
    const sourcePoint = worldToCamera(world, source);
    const targetPoint = worldToCamera(world, target);
    const converted = mat3Vec3(relative.rotation, sourcePoint);
    const predicted: Vec3 = [
      converted[0] + relative.translation[0],
      converted[1] + relative.translation[1],
      converted[2] + relative.translation[2],
    ];
    expect(norm3([
      predicted[0] - targetPoint[0],
      predicted[1] - targetPoint[1],
      predicted[2] - targetPoint[2],
    ])).toBeLessThan(1e-11);
  });

  it('forms E and F consistently for arbitrary calibrated cameras', () => {
    const result = calibratedEpipolar(
      { pose: source, intrinsics: K1 },
      { pose: target, intrinsics: K2 },
    );
    expectMatrixClose(result.essentialRaw, essentialFromPoses(source, target));
    expectMatrixClose(result.fundamentalRaw, fundamentalFromEssential(result.essentialRaw, K1, K2));
    const recoveredE = essentialFromFundamental(result.fundamentalRaw, K1, K2);
    expect(matrixAgreementUpToScale(recoveredE, result.essentialRaw)).toBeLessThan(1e-12);
    expect(svd3(result.fundamentalRaw).rank).toBe(2);
  });

  it('maps pixels to z=1 normalized camera coordinates', () => {
    const pixel: Vec3 = [430, 160, 1];
    const normalized = normalizeImagePoint(K1, pixel);
    expect(normalized[0]).toBeCloseTo((430 - 320) / 520, 14);
    expect(normalized[1]).toBeCloseTo((160 - 210) / 500, 14);
    expect(normalized[2]).toBe(1);
    const roundTrip = mat3Vec3(K1, normalized);
    expectMatrixClose(
      [roundTrip[0], roundTrip[1], roundTrip[2], 0, 0, 0, 0, 0, 0],
      [pixel[0], pixel[1], pixel[2], 0, 0, 0, 0, 0, 0],
    );
  });

  it('gives equivalent pixel and normalized epipolar constraints', () => {
    const result = calibratedEpipolar(
      { pose: source, intrinsics: K1 },
      { pose: target, intrinsics: K2 },
    );
    const world: Vec3 = [0.4, 0.25, 5.2];
    const x = projectPixel(world, source, K1);
    const xPrime = projectPixel(world, target, K2);
    const xHat = normalizeImagePoint(K1, x);
    const xPrimeHat = normalizeImagePoint(K2, xPrime);
    const pixelResidual = dot3(xPrime, mat3Vec3(result.fundamentalRaw, x));
    const normalizedResidual = dot3(xPrimeHat, mat3Vec3(result.essentialRaw, xHat));
    expect(Math.abs(pixelResidual)).toBeLessThan(1e-11);
    expect(Math.abs(normalizedResidual)).toBeLessThan(1e-11);
    expect(pixelResidual).toBeCloseTo(normalizedResidual, 11);
  });

  it('has essential singular values (sigma, sigma, zero)', () => {
    const singular = svd3(essentialFromPoses(source, target)).singularValues;
    expect(singular[0]).toBeCloseTo(singular[1], 11);
    expect(singular[2] / singular[0]).toBeLessThan(1e-12);
  });

  it('retains raw baseline scale while canonical matrices stay invariant', () => {
    const referenceTarget: CameraPose = { ...target, center: source.center };
    const direction: Vec3 = [2.1, -0.35, 0.3];
    const cameraAt = (factor: number): CameraPose => ({
      ...referenceTarget,
      center: [
        source.center[0] + direction[0] * factor,
        source.center[1] + direction[1] * factor,
        source.center[2] + direction[2] * factor,
      ],
    });
    const one = calibratedEpipolar(
      { pose: source, intrinsics: K1 },
      { pose: cameraAt(1), intrinsics: K2 },
    );
    const two = calibratedEpipolar(
      { pose: source, intrinsics: K1 },
      { pose: cameraAt(2), intrinsics: K2 },
    );
    expectMatrixClose(two.essentialRaw, one.essentialRaw.map((value) => value * 2) as unknown as Mat3);
    expectMatrixClose(two.fundamentalRaw, one.fundamentalRaw.map((value) => value * 2) as unknown as Mat3);
    expect(matrixAgreementUpToScale(one.essentialRaw, two.essentialRaw)).toBeLessThan(1e-12);
    expect(matrixAgreementUpToScale(one.fundamentalRaw, two.fundamentalRaw)).toBeLessThan(1e-12);
  });

  it('reports an exact zero baseline as a safe degeneracy', () => {
    const sameCenterTarget: CameraPose = { ...target, center: source.center };
    const result = calibratedEpipolar(
      { pose: source, intrinsics: K1 },
      { pose: sameCenterTarget, intrinsics: K2 },
    );
    expect(result.status).toBe('degenerate');
    expect(result.essentialRaw.every(Number.isFinite)).toBe(true);
    expect(result.fundamentalRaw.every(Number.isFinite)).toBe(true);
    expect(result.essentialCanonical).toBeNull();
    expect(result.fundamentalCanonical).toBeNull();
    expect(canonicalizeMatrix([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });

  it('keeps a tiny nonzero baseline finite and rank two', () => {
    const tinyTarget: CameraPose = { ...target, center: [source.center[0] + 1e-7, source.center[1], source.center[2]] };
    const result = calibratedEpipolar(
      { pose: source, intrinsics: IDENTITY_3 },
      { pose: tinyTarget, intrinsics: IDENTITY_3 },
    );
    expect(result.status).toBe('valid');
    expect(result.essentialRaw.every(Number.isFinite)).toBe(true);
    expect(svd3(result.fundamentalRaw).rank).toBe(2);
  });
});
