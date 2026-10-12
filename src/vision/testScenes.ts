import type { Mat3, Vec3 } from '../types';
import { cameraPoseFromControls, worldToCamera } from '../math/camera';
import type { PinholeCamera } from './fundamental';
import { createRandom } from './random';
import type { Correspondence } from './types';

/** Test fixtures: two or three calibrated cameras and exact projections of random 3D points. */

export const TEST_INTRINSICS: Mat3 = [800, 0, 640, 0, 780, 360, 0, 0, 1];
export const TEST_SIZE = { width: 1280, height: 720 };

export function cameraAt(center: Vec3, yawDegrees: number, pitchDegrees: number, intrinsics: Mat3 = TEST_INTRINSICS): PinholeCamera {
  return { intrinsics, pose: cameraPoseFromControls({ center, yawDegrees, pitchDegrees }) };
}

export function projectPixel(camera: PinholeCamera, point: Vec3): readonly [number, number] | null {
  const local = worldToCamera(point, camera.pose);
  if (local[2] <= 1e-6) return null;
  const k = camera.intrinsics;
  return [
    (k[0] * local[0] + k[1] * local[1]) / local[2] + k[2],
    k[4] * local[1] / local[2] + k[5],
  ];
}

const inImage = (pixel: readonly [number, number] | null): pixel is readonly [number, number] =>
  !!pixel && pixel[0] >= 0 && pixel[0] <= TEST_SIZE.width && pixel[1] >= 0 && pixel[1] <= TEST_SIZE.height;

/** Random points 3–9 m in front of the world origin that both cameras see. */
export function visiblePoints(cameras: readonly PinholeCamera[], count: number, seed: number): Vec3[] {
  const random = createRandom(seed);
  const points: Vec3[] = [];
  while (points.length < count) {
    const point: Vec3 = [(random() - 0.5) * 6, (random() - 0.5) * 3.5, 3 + random() * 6];
    if (cameras.every((camera) => inImage(projectPixel(camera, point)))) points.push(point);
  }
  return points;
}

/** Exact correspondences, optionally with uniform pixel noise of ±noise/2. */
export function correspondences(
  source: PinholeCamera,
  target: PinholeCamera,
  points: readonly Vec3[],
  noise = 0,
  seed = 3,
): Correspondence[] {
  const random = createRandom(seed);
  return points.map((point) => {
    const a = projectPixel(source, point)!;
    const b = projectPixel(target, point)!;
    const jitter = (): number => (random() - 0.5) * noise;
    return [a[0] + jitter(), a[1] + jitter(), b[0] + jitter(), b[1] + jitter()] as const;
  });
}

export function randomOutliers(count: number, seed: number): Correspondence[] {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => [
    random() * TEST_SIZE.width,
    random() * TEST_SIZE.height,
    random() * TEST_SIZE.width,
    random() * TEST_SIZE.height,
  ] as const);
}

export const GENERAL_PAIR = {
  source: cameraAt([0, 0, 0], 0, 0),
  target: cameraAt([1.1, 0.15, 0.3], -9, 3, [760, 0, 650, 0, 760, 350, 0, 0, 1]),
};
