// @vitest-environment node
import openCvSource from '@techstark/opencv-js/dist/opencv.js?raw';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateOpenCv } from './features';
import { epipolarLine, pointLineDistance } from './geometry2d';
import { analyzeImages, inlierCoverage, pairQuality, viewPairs, type AnalysisResult } from './pipeline';
import { castRay, createSampleCameras, projectToPixel, renderSampleRows, visibleFrom } from './syntheticScene';

/*
 * End-to-end check on the sample room: OpenCV finds and matches features, this project's RANSAC
 * estimates F, and every pair is compared with the exact geometry the scene was rendered from.
 */

const cameras = createSampleCameras();
let result: AnalysisResult;

beforeAll(async () => {
  const cv = await evaluateOpenCv(openCvSource);
  const images = cameras.map((camera) => {
    const rgba = new Uint8ClampedArray(camera.width * camera.height * 4);
    renderSampleRows(camera, rgba, 0, camera.height);
    return { width: camera.width, height: camera.height, rgba };
  });
  result = analyzeImages(cv, images);
}, 120000);

describe('photo pipeline on the synthetic room', () => {
  it('estimates all six pairs of the four views', () => {
    expect(result.pairs.map(({ source, target }) => [source, target])).toEqual(viewPairs(4));
    result.features.forEach((features) => expect(features.count).toBeGreaterThan(800));
  });

  it('rates every pair strong: many inliers, spread out, sub-pixel residuals, not degenerate', () => {
    result.pairs.forEach((pair) => {
      expect(pair.inlierCount).toBeGreaterThan(120);
      expect(pair.coverage).toBeGreaterThanOrEqual(0.5);
      expect(pair.rmsSampson!).toBeLessThan(0.6);
      expect(pair.heldOutError!).toBeLessThan(0.8);
      expect(pair.degenerate).toBe(false);
      expect(pairQuality(pair)).toBe('strong');
    });
  });

  it('draws lines that pass within a pixel of the true correspondences', () => {
    result.pairs.forEach((pair) => {
      const source = cameras[pair.source];
      const target = cameras[pair.target];
      const errors: number[] = [];
      for (let v = 30; v < source.height; v += 45) {
        for (let u = 30; u < source.width; u += 60) {
          const point = castRay(source, u, v);
          if (!point || !visibleFrom(target, point)) continue;
          errors.push(pointLineDistance(epipolarLine(pair.fundamental!, [u, v])!, projectToPixel(target, point)!));
        }
      }
      errors.sort((a, b) => a - b);
      expect(errors.length).toBeGreaterThan(60);
      expect(errors[Math.floor(errors.length * 0.5)]).toBeLessThan(1);
      expect(errors[Math.floor(errors.length * 0.9)]).toBeLessThan(2.5);
    });
  });
});

describe('pair quality gate', () => {
  it('measures how much of both frames the inliers cover', () => {
    const corners = [[10, 10, 10, 10], [90, 10, 90, 10], [10, 90, 10, 90], [90, 90, 90, 90]] as const;
    expect(inlierCoverage(corners, new Uint8Array([1, 1, 1, 1]), 100, 100, 2)).toBe(1);
    expect(inlierCoverage(corners, new Uint8Array([1, 0, 0, 0]), 100, 100, 2)).toBe(0.25);
  });

  it('distrusts clustered, sparse, or degenerate fits even with tiny residuals', () => {
    const fundamental = [0, 0, 0, 0, 0, -1, 0, 1, 0] as const;
    expect(pairQuality({ fundamental, inlierCount: 200, coverage: 0.8, degenerate: false })).toBe('strong');
    expect(pairQuality({ fundamental, inlierCount: 200, coverage: 0.2, degenerate: false })).toBe('unreliable');
    expect(pairQuality({ fundamental, inlierCount: 40, coverage: 0.4, degenerate: false })).toBe('fair');
    expect(pairQuality({ fundamental, inlierCount: 200, coverage: 0.9, degenerate: true })).toBe('unreliable');
    expect(pairQuality({ fundamental: null, inlierCount: 0, coverage: 0, degenerate: false })).toBe('unreliable');
  });
});
