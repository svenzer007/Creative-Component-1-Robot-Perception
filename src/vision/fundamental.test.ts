import { describe, expect, it } from 'vitest';
import { svd3 } from '../math/linearAlgebra';
import {
  allIndices,
  eightPoint,
  fundamentalDifference,
  fundamentalFromCameras,
  hartleyNormalization,
  matchSampsonSquared,
  rmsSampson,
} from './fundamental';
import { epipolarLine, pointLineDistance } from './geometry2d';
import { GENERAL_PAIR, correspondences, visiblePoints } from './testScenes';

const { source, target } = GENERAL_PAIR;
const truth = fundamentalFromCameras(source, target);

describe('fundamental matrix from known cameras', () => {
  it('satisfies x′ᵀFx = 0 for exact projections and has rank 2', () => {
    const matches = correspondences(source, target, visiblePoints([source, target], 40, 5));
    matches.forEach((match) => expect(Math.sqrt(matchSampsonSquared(truth, match))).toBeLessThan(1e-8));
    const { singularValues, rank } = svd3(truth);
    expect(rank).toBe(2);
    expect(singularValues[2] / singularValues[0]).toBeLessThan(1e-12);
  });
});

describe('Hartley normalization', () => {
  it('moves the centroid to the origin and the mean distance to √2', () => {
    const matches = correspondences(source, target, visiblePoints([source, target], 30, 8));
    const indices = allIndices(matches.length);
    const normalization = hartleyNormalization(matches, indices, 'source')!;
    let mx = 0;
    let my = 0;
    let mean = 0;
    matches.forEach((match) => {
      const x = (match[0] - normalization.centerX) * normalization.scale;
      const y = (match[1] - normalization.centerY) * normalization.scale;
      mx += x;
      my += y;
      mean += Math.hypot(x, y);
    });
    expect(Math.abs(mx / matches.length)).toBeLessThan(1e-12);
    expect(Math.abs(my / matches.length)).toBeLessThan(1e-12);
    expect(mean / matches.length).toBeCloseTo(Math.SQRT2, 12);
  });

  it('rejects coincident points', () => {
    expect(hartleyNormalization([[5, 5, 1, 1], [5, 5, 2, 2]], [0, 1], 'source')).toBeNull();
  });
});

describe('normalized eight-point algorithm', () => {
  it('recovers the exact F from eight noise-free correspondences', () => {
    const matches = correspondences(source, target, visiblePoints([source, target], 8, 13));
    const estimate = eightPoint(matches)!;
    expect(fundamentalDifference(estimate, truth)).toBeLessThan(1e-7);
  });

  it('returns a rank-2 model with sub-pixel error under half-pixel noise', () => {
    const points = visiblePoints([source, target], 150, 21);
    const noisy = correspondences(source, target, points, 1, 4);
    const estimate = eightPoint(noisy)!;
    expect(svd3(estimate).rank).toBe(2);
    expect(rmsSampson(estimate, noisy)).toBeLessThan(0.5);
    const exact = correspondences(source, target, points);
    const lineErrors = exact.map((match) => pointLineDistance(epipolarLine(estimate, [match[0], match[1]])!, [match[2], match[3]]));
    expect(Math.max(...lineErrors)).toBeLessThan(1.5);
  });

  it('needs at least eight correspondences', () => {
    const matches = correspondences(source, target, visiblePoints([source, target], 7, 2));
    expect(eightPoint(matches)).toBeNull();
  });
});
