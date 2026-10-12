import type { Vec3 } from '../types';
import { clipToImage, type Pixel } from './geometry2d';
import type { GrayImage } from './types';

export function grayFromRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): GrayImage {
  const data = new Float32Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 1, j += 4) {
    data[i] = (0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]) / 255;
  }
  return { width, height, data };
}

export interface LineSearch {
  start: Pixel;
  end: Pixel;
  length: number;
  /** Normalized cross-correlation in [-1, 1] at each 1 px step from start to end; NaN where the patch leaves the image. */
  scores: Float32Array;
  bestIndex: number;
  bestScore: number;
  /** Strongest score at least two patch widths away from the best one. */
  runnerUpScore: number;
  /** The source patch has almost no texture, so every position looks alike. */
  flat: boolean;
  radius: number;
}

/** Fraction of the way along the search segment, in pixels of the target image. */
export function searchPosition(search: LineSearch, index: number): Pixel {
  const t = search.scores.length > 1 ? index / (search.scores.length - 1) : 0;
  return [
    search.start[0] + (search.end[0] - search.start[0]) * t,
    search.start[1] + (search.end[1] - search.start[1]) * t,
  ];
}

/**
 * Slides a (2r+1)² patch around `point` in the source image along the target epipolar line and
 * scores each position with zero-mean normalized cross-correlation. This is the 1D correspondence
 * search that epipolar geometry makes possible.
 */
export function searchAlongLine(
  source: GrayImage,
  point: Pixel,
  target: GrayImage,
  line: Vec3,
  radius = 5,
): LineSearch | null {
  const segment = clipToImage(line, target.width, target.height);
  if (!segment) return null;
  const cx = Math.floor(point[0]);
  const cy = Math.floor(point[1]);
  if (cx < radius || cy < radius || cx >= source.width - radius || cy >= source.height - radius) return null;

  const side = 2 * radius + 1;
  const size = side * side;
  const reference = new Float32Array(size);
  let mean = 0;
  let k = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    const row = (cy + dy) * source.width + cx;
    for (let dx = -radius; dx <= radius; dx += 1) {
      reference[k] = source.data[row + dx];
      mean += reference[k];
      k += 1;
    }
  }
  mean /= size;
  let referenceEnergy = 0;
  for (let i = 0; i < size; i += 1) {
    reference[i] -= mean;
    referenceEnergy += reference[i] * reference[i];
  }

  const start: Pixel = [segment[0][0], segment[0][1]];
  const end: Pixel = [segment[1][0], segment[1][1]];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const steps = Math.max(1, Math.floor(length));
  const scores = new Float32Array(steps + 1).fill(Number.NaN);
  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let step = 0; step <= steps; step += 1) {
    const x = Math.floor(start[0] + (end[0] - start[0]) * step / steps);
    const y = Math.floor(start[1] + (end[1] - start[1]) * step / steps);
    if (x < radius || y < radius || x >= target.width - radius || y >= target.height - radius) continue;
    let targetMean = 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      const row = (y + dy) * target.width + x;
      for (let dx = -radius; dx <= radius; dx += 1) targetMean += target.data[row + dx];
    }
    targetMean /= size;
    let cross = 0;
    let targetEnergy = 0;
    k = 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      const row = (y + dy) * target.width + x;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const value = target.data[row + dx] - targetMean;
        cross += reference[k] * value;
        targetEnergy += value * value;
        k += 1;
      }
    }
    const score = referenceEnergy > 1e-9 && targetEnergy > 1e-9 ? cross / Math.sqrt(referenceEnergy * targetEnergy) : 0;
    scores[step] = score;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = step;
    }
  }
  if (bestIndex < 0) return null;

  let runnerUpScore = Number.NEGATIVE_INFINITY;
  const exclusion = 2 * side;
  for (let step = 0; step < scores.length; step += 1) {
    if (Math.abs(step - bestIndex) <= exclusion || Number.isNaN(scores[step])) continue;
    runnerUpScore = Math.max(runnerUpScore, scores[step]);
  }

  const flatThreshold = (3 / 255) ** 2 * size;
  return {
    start,
    end,
    length,
    scores,
    bestIndex,
    bestScore,
    runnerUpScore,
    flat: referenceEnergy < flatThreshold,
    radius,
  };
}
