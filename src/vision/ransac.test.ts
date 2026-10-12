import { describe, expect, it } from 'vitest';
import { fundamentalFromCameras } from './fundamental';
import { epipolarLine, pointLineDistance } from './geometry2d';
import {
  estimateFundamentalRansac,
  estimateHomographyRansac,
  heldOutError,
  requiredIterations,
  selectModel,
} from './ransac';
import { GENERAL_PAIR, cameraAt, correspondences, randomOutliers, visiblePoints } from './testScenes';
import type { Correspondence } from './types';

const { source, target } = GENERAL_PAIR;
const points = visiblePoints([source, target], 220, 31);
const inliers = correspondences(source, target, points, 1, 9);
const outliers = randomOutliers(110, 17);
const mixed: Correspondence[] = [...inliers, ...outliers];

describe('robust fundamental estimation', () => {
  const fit = estimateFundamentalRansac(mixed, { seed: 3 })!;

  it('separates inliers from outliers', () => {
    const keptInliers = fit.inliers.slice(0, inliers.length).reduce((sum, value) => sum + value, 0);
    const keptOutliers = fit.inliers.slice(inliers.length).reduce((sum, value) => sum + value, 0);
    expect(keptInliers / inliers.length).toBeGreaterThan(0.95);
    expect(keptOutliers).toBeLessThanOrEqual(4);
    expect(fit.rmsSampson).toBeLessThan(0.6);
  });

  it('puts true correspondences within a pixel of their estimated lines', () => {
    const exact = correspondences(source, target, points);
    const errors = exact.map((match) => pointLineDistance(epipolarLine(fit.fundamental, [match[0], match[1]])!, [match[2], match[3]]));
    const mean = errors.reduce((sum, value) => sum + value, 0) / errors.length;
    expect(mean).toBeLessThan(0.4);
    expect(Math.max(...errors)).toBeLessThan(1.5);
  });

  it('is reproducible for a fixed seed', () => {
    const again = estimateFundamentalRansac(mixed, { seed: 3 })!;
    expect(again.fundamental).toEqual(fit.fundamental);
    expect(again.inlierCount).toBe(fit.inlierCount);
  });

  it('reports a held-out error close to the noise level', () => {
    const error = heldOutError(mixed, fit.inliers)!;
    expect(error).toBeGreaterThan(0);
    expect(error).toBeLessThan(0.8);
  });

  it('refuses fewer than eight correspondences', () => {
    expect(estimateFundamentalRansac(inliers.slice(0, 7))).toBeNull();
  });
});

describe('degeneracy check', () => {
  it('flags a rotation-only pair as degenerate', () => {
    const rotated = cameraAt([0, 0, 0], 12, -4);
    const scenePoints = visiblePoints([source, rotated], 200, 44);
    const matches = correspondences(source, rotated, scenePoints, 1, 6);
    const fundamental = estimateFundamentalRansac(matches, { seed: 5 });
    const homography = estimateHomographyRansac(matches, { seed: 5 });
    expect(homography!.inlierCount / matches.length).toBeGreaterThan(0.9);
    const selection = selectModel(matches, fundamental?.fundamental ?? fundamentalFromCameras(source, target), homography!.homography);
    expect(selection.degenerate).toBe(true);
  });

  it('accepts a translated pair with depth variation', () => {
    const fit = estimateFundamentalRansac(mixed, { seed: 3 })!;
    const homography = estimateHomographyRansac(mixed, { seed: 3 });
    const selection = selectModel(mixed, fit.fundamental, homography?.homography ?? null);
    expect(selection.degenerate).toBe(false);
    expect(selection.homographyRatio).toBeLessThan(0.45);
  });
});

describe('adaptive iteration count', () => {
  it('grows as the inlier ratio falls and respects the cap', () => {
    expect(requiredIterations(1, 8, 0.999, 5000)).toBe(1);
    const half = requiredIterations(0.5, 8, 0.99, 100000);
    expect(half).toBeGreaterThan(1000);
    expect(half).toBeLessThan(1300);
    expect(requiredIterations(0.1, 8, 0.999, 5000)).toBe(5000);
  });
});
