import { describe, expect, it } from 'vitest';
import type { AppState, Mat3, Vec3 } from '../types';
import { cameraToWorld, projectNormalized, worldToCamera } from './camera';
import { epipolarResidual, pointAlongLine, signedPlaneDistance } from './epipolar';
import { cross3, dot3, mat3Vec3, norm3, sub3, transpose3 } from './linearAlgebra';
import { DEFAULT_STATE, PRESETS, deriveGeometry } from '../state/appState';

const stateWith = (patch: Partial<AppState>): AppState => ({
  ...structuredClone(DEFAULT_STATE),
  ...patch,
});

const expectSmall = (value: number, tolerance = 1e-9): void => expect(Math.abs(value)).toBeLessThan(tolerance);

describe('epipolar geometry', () => {
  it.each(['general', 'rectified', 'forward', 'rotation'] as const)(
    'satisfies residual and null-space relations for the %s preset',
    (preset) => {
      const snapshot = deriveGeometry(stateWith({ camera2: PRESETS[preset], preset }));
      const { fundamental, epipole1, epipole2 } = snapshot.epipolar;
      expect(snapshot.projection2.normalized).not.toBeNull();
      expectSmall(snapshot.residual ?? Number.POSITIVE_INFINITY, 1e-9);
      expect(epipole1).not.toBeNull();
      expect(epipole2).not.toBeNull();
      expect(norm3(mat3Vec3(fundamental, epipole1!.homogeneous))).toBeLessThan(1e-9);
      expect(norm3(mat3Vec3(transpose3(fundamental), epipole2!.homogeneous))).toBeLessThan(1e-9);
      expect(snapshot.epipolar.rank).toBe(2);
    },
  );

  it('keeps x fixed, moves x′, and preserves one epipolar line as depth changes', () => {
    const shallow = deriveGeometry(stateWith({ depth: 2.5 }));
    const deep = deriveGeometry(stateWith({ depth: 7 }));
    expect(shallow.x).toEqual(deep.x);
    expect(norm3(cross3(shallow.worldPoint, deep.worldPoint))).toBeLessThan(1e-12);
    expect(norm3(sub3(shallow.worldPoint, deep.worldPoint))).toBeGreaterThan(1);
    expect(shallow.projection2.normalized).not.toEqual(deep.projection2.normalized);
    expect(shallow.ray.line2FromF).toEqual(deep.ray.line2FromF);
    expectSmall(epipolarResidual(shallow.projection2.normalized!, shallow.epipolar.fundamental, shallow.x));
    expectSmall(epipolarResidual(deep.projection2.normalized!, deep.epipolar.fundamental, deep.x));
  });

  it('produces horizontal lines for rectified stereo', () => {
    const snapshot = deriveGeometry(stateWith({ camera2: PRESETS.rectified, preset: 'rectified' }));
    expect(snapshot.ray.line2FromF).not.toBeNull();
    expectSmall(snapshot.ray.line2FromF![0]);
    expect(Math.abs(snapshot.ray.line2FromF![1])).toBeGreaterThan(0.9);
  });

  it('round-trips points between camera-local and world coordinates', () => {
    const snapshot = deriveGeometry(DEFAULT_STATE);
    const local: Vec3 = [0.4, -0.2, 3.3];
    const world = cameraToWorld(local, snapshot.camera2);
    const recovered = worldToCamera(world, snapshot.camera2);
    expect(norm3([recovered[0] - local[0], recovered[1] - local[1], recovered[2] - local[2]])).toBeLessThan(1e-12);
  });

  it('independently intersects the 3D planes and agrees with Fx', () => {
    const snapshot = deriveGeometry(DEFAULT_STATE);
    const plane = snapshot.ray.plane!;
    const intersection = snapshot.ray.line2Intersection!;
    const imagePlanePoint = cameraToWorld([0, 0, 1], snapshot.camera2);
    const imagePlaneNormal = mat3Vec3(transpose3(snapshot.camera2.rotation), [0, 0, 1]);

    [-2, 0, 3].forEach((distance) => {
      const worldPoint = pointAlongLine(intersection.worldLine, distance);
      expectSmall(signedPlaneDistance(plane, worldPoint), 1e-9);
      expectSmall(dot3(imagePlaneNormal, [
        worldPoint[0] - imagePlanePoint[0],
        worldPoint[1] - imagePlanePoint[1],
        worldPoint[2] - imagePlanePoint[2],
      ]), 1e-9);
      expectSmall(worldToCamera(worldPoint, snapshot.camera2)[2] - 1, 1e-9);
    });

    expect(snapshot.ray.agreementError).not.toBeNull();
    expect(snapshot.ray.agreementError!).toBeLessThan(1e-9);
    intersection.clippedCameraPoints!.forEach((point) => {
      expectSmall(dot3(snapshot.ray.line2FromF!, point), 1e-9);
      expectSmall(dot3(intersection.cameraLine, point), 1e-9);
    });
  });

  it('maintains independent geometry/F agreement across the family of planes', () => {
    const snapshot = deriveGeometry(DEFAULT_STATE);
    snapshot.family.forEach((ray) => {
      expect(ray.line2Intersection).not.toBeNull();
      expect(ray.agreementError).not.toBeNull();
      expect(ray.agreementError!).toBeLessThan(1e-9);
    });
  });

  it('handles an exactly zero baseline without NaNs', () => {
    const snapshot = deriveGeometry(stateWith({
      camera2: { center: [0, 0, 0], yawDegrees: 20, pitchDegrees: 4 },
    }));
    expect(snapshot.baselineLength).toBe(0);
    expect(snapshot.epipolar.rank).toBe(0);
    expect(snapshot.epipolar.fundamental.every(Number.isFinite)).toBe(true);
    expect(snapshot.ray.line2FromF).toBeNull();
    expect(snapshot.warning).toContain('baseline is zero');
  });

  it('warns for a tiny nonzero baseline while retaining finite rank-2 geometry', () => {
    const snapshot = deriveGeometry(stateWith({ camera2: PRESETS.rotation, preset: 'rotation' }));
    expect(snapshot.baselineLength).toBeCloseTo(0.03);
    expect(snapshot.epipolar.rank).toBe(2);
    expect(snapshot.warning).toContain('Near pure rotation');
    expect(snapshot.epipolar.fundamental.every(Number.isFinite)).toBe(true);
  });

  it('reports a behind-camera projection safely', () => {
    const snapshot = deriveGeometry(stateWith({
      depth: 2,
      camera2: { center: [0, 0, 3], yawDegrees: 0, pitchDegrees: 0 },
    }));
    expect(snapshot.projection2.normalized).not.toBeNull();
    expect(snapshot.projection2.inFront).toBe(false);
    expect(snapshot.warning).toContain('behind Camera 2');
  });

  it('returns an undefined normalized point at camera z=0', () => {
    const snapshot = deriveGeometry(DEFAULT_STATE);
    const world = cameraToWorld([1, 2, 0], snapshot.camera2);
    const projection = projectNormalized(world, snapshot.camera2);
    expect(projection.normalized).toBeNull();
    expect(projection.inFront).toBe(false);
  });

  it('uses row-major F consistently', () => {
    const f: Mat3 = [0, -1, 2, 1, 0, -3, -2, 3, 0];
    const x: Vec3 = [0.2, -0.3, 1];
    const line = mat3Vec3(f, x);
    expect(line[0]).toBeCloseTo(2.3);
    expect(line[1]).toBeCloseTo(-2.8);
    expect(line[2]).toBeCloseTo(-1.3);
  });
});
