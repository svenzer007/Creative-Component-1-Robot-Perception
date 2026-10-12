import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../types';
import { cross3, mat3Vec3, sub3 } from '../math/linearAlgebra';
import { fundamentalFromCameras } from './fundamental';
import {
  closestPointOnLine,
  clipToImage,
  epipolarLine,
  epipoles,
  intersectLines,
  lineAngleDegrees,
  pointLineDistance,
  transferPoint,
} from './geometry2d';
import { GENERAL_PAIR, cameraAt, projectPixel } from './testScenes';

describe('image-space line helpers', () => {
  it('clips horizontal, vertical, and diagonal lines to the image rectangle', () => {
    expect(clipToImage([0, 1, -100], 640, 480)).toEqual([[0, 100, 1], [640, 100, 1]]);
    expect(clipToImage([1, 0, -320], 640, 480)).toEqual([[320, 0, 1], [320, 480, 1]]);
    const diagonal = clipToImage([480, -640, 0], 640, 480)!;
    expect(diagonal.map((point) => [Math.round(point[0]), Math.round(point[1])])).toEqual([[0, 0], [640, 480]]);
    expect(clipToImage([0, 1, 10], 640, 480)).toBeNull();
  });

  it('measures distances, projections, intersections, and angles', () => {
    const line: Vec3 = [0, 1, -50];
    expect(pointLineDistance(line, [12, 80])).toBe(30);
    expect(closestPointOnLine(line, [12, 80])).toEqual([12, 50]);
    expect(intersectLines([1, 0, -3], [0, 1, -4])).toEqual([3, 4]);
    expect(intersectLines([0, 1, -1], [0, 2, -5])).toBeNull();
    expect(lineAngleDegrees([1, 0, 0], [0, 1, 0])).toBeCloseTo(90, 10);
  });
});

describe('epipoles from F', () => {
  it('equal the projections of the other camera center', () => {
    const { source, target } = GENERAL_PAIR;
    const fundamental = fundamentalFromCameras(source, target);
    const pair = epipoles(fundamental);
    const expectedTarget = mat3Vec3(target.intrinsics, mat3Vec3(target.pose.rotation, sub3(source.pose.center, target.pose.center)));
    const expectedSource = mat3Vec3(source.intrinsics, mat3Vec3(source.pose.rotation, sub3(target.pose.center, source.pose.center)));
    const asPixel = (h: Vec3): [number, number] => [h[0] / h[2], h[1] / h[2]];
    const [ex, ey] = asPixel(expectedTarget);
    expect(pair.target.normalized![0]).toBeCloseTo(ex, 6);
    expect(pair.target.normalized![1]).toBeCloseTo(ey, 6);
    const [sx, sy] = asPixel(expectedSource);
    expect(pair.source.normalized![0]).toBeCloseTo(sx, 6);
    expect(pair.source.normalized![1]).toBeCloseTo(sy, 6);
  });

  it('lie on every epipolar line', () => {
    const { source, target } = GENERAL_PAIR;
    const fundamental = fundamentalFromCameras(source, target);
    const ePrime = epipoles(fundamental).target.normalized!;
    [[100, 200], [900, 50], [640, 700]].forEach(([x, y]) => {
      const line = epipolarLine(fundamental, [x, y])!;
      expect(pointLineDistance(line, [ePrime[0], ePrime[1]])).toBeLessThan(1e-6);
    });
  });
});

describe('three-view epipolar transfer', () => {
  const first = cameraAt([0, 0, 0], 0, 0);
  const second = cameraAt([1.2, 0, 0.2], -8, 0);
  const third = cameraAt([0.4, 0.9, -0.3], -2, -6);

  it('lands exactly on the projection in the third view', () => {
    const point: Vec3 = [0.4, -0.3, 5.5];
    const x1 = projectPixel(first, point)!;
    const x2 = projectPixel(second, point)!;
    const x3 = projectPixel(third, point)!;
    const result = transferPoint(fundamentalFromCameras(first, third), x1, fundamentalFromCameras(second, third), x2)!;
    expect(result.point![0]).toBeCloseTo(x3[0], 6);
    expect(result.point![1]).toBeCloseTo(x3[1], 6);
    expect(result.angleDegrees).toBeGreaterThan(5);
  });

  it('becomes ill-conditioned on the trifocal plane through the three centers', () => {
    const origin = first.pose.center;
    const normal = cross3(sub3(second.pose.center, origin), sub3(third.pose.center, origin));
    // Solve n·(X − C₁) = 0 for y at x = 0.5, z = 6: in front of every camera, on the plane.
    const x = 0.5;
    const z = 6;
    const y = origin[1] - (normal[0] * (x - origin[0]) + normal[2] * (z - origin[2])) / normal[1];
    const point: Vec3 = [x, y, z];
    const result = transferPoint(
      fundamentalFromCameras(first, third),
      projectPixel(first, point)!,
      fundamentalFromCameras(second, third),
      projectPixel(second, point)!,
    )!;
    expect(result.angleDegrees).toBeLessThan(1e-4);
  });
});
