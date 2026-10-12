import { describe, expect, it } from 'vitest';
import { createRandom } from './random';
import { grayFromRgba, searchAlongLine, searchPosition } from './ncc';
import type { GrayImage } from './types';

function texture(width: number, height: number, seed: number): GrayImage {
  const random = createRandom(seed);
  const coarse = Array.from({ length: Math.ceil(height / 3) + 1 }, () =>
    Array.from({ length: Math.ceil(width / 3) + 1 }, () => random()));
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data[y * width + x] = coarse[Math.floor(y / 3)][Math.floor(x / 3)];
  }
  return { width, height, data };
}

function shifted(image: GrayImage, dx: number): GrayImage {
  const data = new Float32Array(image.data.length);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const sx = Math.min(image.width - 1, Math.max(0, x - dx));
      data[y * image.width + x] = image.data[y * image.width + sx];
    }
  }
  return { ...image, data };
}

describe('correlation search along an epipolar line', () => {
  it('finds a horizontally shifted patch on a horizontal line', () => {
    const source = texture(240, 120, 4);
    const target = shifted(source, 23);
    const search = searchAlongLine(source, [101.5, 60.5], target, [0, 1, -60.5])!;
    const [x, y] = searchPosition(search, search.bestIndex);
    expect(Math.abs(x - 124.5)).toBeLessThanOrEqual(1);
    expect(Math.floor(y)).toBe(60);
    expect(search.bestScore).toBeGreaterThan(0.99);
    expect(search.flat).toBe(false);
  });

  it('flags a textureless patch as flat', () => {
    const flat: GrayImage = { width: 80, height: 60, data: new Float32Array(80 * 60).fill(0.5) };
    const search = searchAlongLine(flat, [40, 30], flat, [0, 1, -30])!;
    expect(search.flat).toBe(true);
  });

  it('refuses points too close to the border', () => {
    const image = texture(60, 40, 1);
    expect(searchAlongLine(image, [2, 20], image, [0, 1, -20])).toBeNull();
  });

  it('converts RGBA to luminance in [0, 1]', () => {
    const gray = grayFromRgba(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
    expect(gray.data[0]).toBeCloseTo(1, 6);
    expect(gray.data[1]).toBe(0);
  });
});
