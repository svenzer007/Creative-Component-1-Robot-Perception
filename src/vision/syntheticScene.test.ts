import { describe, expect, it } from 'vitest';
import { fundamentalFromCameras, matchSampsonSquared } from './fundamental';
import { castRay, createSampleCameras, projectToPixel, renderSampleRows, visibleFrom } from './syntheticScene';

const cameras = createSampleCameras();

describe('synthetic sample scene', () => {
  it('round-trips pixels through the scene and back', () => {
    cameras.forEach((camera) => {
      [[100.25, 80.5], [360, 240], [655.75, 410.25]].forEach(([u, v]) => {
        const point = castRay(camera, u, v)!;
        const pixel = projectToPixel(camera, point)!;
        expect(pixel[0]).toBeCloseTo(u, 6);
        expect(pixel[1]).toBeCloseTo(v, 6);
        expect(visibleFrom(camera, point)).toBe(true);
      });
    });
  });

  it('gives exact correspondences that satisfy the true F', () => {
    const [a, b] = cameras;
    const fundamental = fundamentalFromCameras(a, b);
    let checked = 0;
    for (let v = 40; v < a.height; v += 70) {
      for (let u = 40; u < a.width; u += 90) {
        const point = castRay(a, u, v)!;
        if (!visibleFrom(b, point)) continue;
        const pixel = projectToPixel(b, point)!;
        expect(Math.sqrt(matchSampsonSquared(fundamental, [u, v, pixel[0], pixel[1]]))).toBeLessThan(1e-6);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('hides points that another view sees inside its frame but behind an occluder', () => {
    const [a, b] = cameras;
    let hidden = 0;
    for (let v = 200; v < a.height; v += 12) {
      for (let u = 0; u < a.width; u += 12) {
        const point = castRay(a, u, v);
        const pixel = point ? projectToPixel(b, point) : null;
        const inFrame = !!pixel && pixel[0] >= 0 && pixel[0] <= b.width && pixel[1] >= 0 && pixel[1] <= b.height;
        if (point && inFrame && !visibleFrom(b, point)) hidden += 1;
      }
    }
    expect(hidden).toBeGreaterThan(0);
  });

  it('renders a textured image', () => {
    const [small] = createSampleCameras(96, 64);
    const rgba = new Uint8ClampedArray(96 * 64 * 4);
    renderSampleRows(small, rgba, 0, 64);
    let sum = 0;
    let sumSquares = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      sum += rgba[i];
      sumSquares += rgba[i] ** 2;
    }
    const count = rgba.length / 4;
    const variance = sumSquares / count - (sum / count) ** 2;
    expect(variance).toBeGreaterThan(200);
    expect(rgba[3]).toBe(255);
  });
});
