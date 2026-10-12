import type { Mat3 } from '../types';
import {
  detectFeatures,
  matchFeatures,
  type DetectedFeatures,
  type DetectOptions,
  type DetectorName,
  type OpenCv,
} from './features';
import { estimateFundamentalRansac, estimateHomographyRansac, heldOutError, selectModel } from './ransac';
import type { Correspondence } from './types';

export interface ImageInput {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export interface PairAnalysis {
  source: number;
  target: number;
  /** Putative correspondences after the ratio and mutual checks (or typed in by hand). */
  matches: Correspondence[];
  inliers: Uint8Array;
  /** Maps a source pixel to its line in the target view; null when estimation failed. */
  fundamental: Mat3 | null;
  inlierCount: number;
  rmsSampson: number | null;
  heldOutError: number | null;
  iterations: number;
  /** ORB-SLAM homography score ratio; high values mean rotation-only or planar. */
  homographyRatio: number | null;
  degenerate: boolean;
  /** Fraction of a 4×4 grid holding inliers, the smaller of the two views (0 to 1). */
  coverage: number;
  threshold: number;
}

export type PairQuality = 'strong' | 'fair' | 'unreliable';

/**
 * Low residuals alone cannot certify F: inliers bunched on one wall fit a wrong model perfectly.
 * The verdict also requires enough inliers spread across the frame and a non-degenerate pair.
 */
export function pairQuality(pair: Pick<PairAnalysis, 'fundamental' | 'inlierCount' | 'coverage' | 'degenerate'>): PairQuality {
  if (!pair.fundamental || pair.degenerate) return 'unreliable';
  if (pair.inlierCount >= 60 && pair.coverage >= 0.5) return 'strong';
  if (pair.inlierCount >= 25 && pair.coverage >= 0.3) return 'fair';
  return 'unreliable';
}

/** Share of grid cells that contain at least one inlier, in the less covered of the two images. */
export function inlierCoverage(
  matches: readonly Correspondence[],
  inliers: Uint8Array,
  width: number,
  height: number,
  grid = 4,
): number {
  const source = new Uint8Array(grid * grid);
  const target = new Uint8Array(grid * grid);
  const cell = (x: number, y: number): number =>
    Math.min(grid - 1, Math.max(0, Math.floor(y / height * grid))) * grid
    + Math.min(grid - 1, Math.max(0, Math.floor(x / width * grid)));
  matches.forEach((match, index) => {
    if (!inliers[index]) return;
    source[cell(match[0], match[1])] = 1;
    target[cell(match[2], match[3])] = 1;
  });
  const filled = (cells: Uint8Array): number => cells.reduce((sum, value) => sum + value, 0) / cells.length;
  return Math.min(filled(source), filled(target));
}

export interface FeatureSummary {
  count: number;
  /** x, y pairs in pixels. */
  points: Float32Array;
}

export interface AnalysisResult {
  detector: DetectorName;
  features: FeatureSummary[];
  pairs: PairAnalysis[];
  milliseconds: { features: number; matching: number; estimation: number };
}

export type AnalysisStage = 'engine' | 'features' | 'matching' | 'estimation';

export interface AnalysisProgress {
  stage: AnalysisStage;
  completed: number;
  total: number;
}

export type AnalysisOptions = DetectOptions;

/** Tuned on the sample room against ground truth: sub-pixel median line error on every view pair. */
export const DEFAULT_ANALYSIS: AnalysisOptions = { detector: 'akaze', maxFeatures: 3000, akazeThreshold: 0.0003 };

/** Inlier threshold that scales gently with resolution: 1 px at 720 px wide, ~1.7 px at 1440. */
export const ransacThreshold = (width: number, height: number): number => Math.max(1, 0.0012 * Math.max(width, height));

/** Every unordered pair of views, as (source, target) with source < target. */
export function viewPairs(count: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let source = 0; source < count; source += 1) {
    for (let target = source + 1; target < count; target += 1) pairs.push([source, target]);
  }
  return pairs;
}

/** Robust F, degeneracy check, and held-out error for one pair's correspondences. Pure TypeScript. */
export function estimatePair(
  source: number,
  target: number,
  matches: Correspondence[],
  width: number,
  height: number,
  seed = 1,
): PairAnalysis {
  const threshold = ransacThreshold(width, height);
  const fit = estimateFundamentalRansac(matches, { threshold, seed });
  if (!fit) {
    return {
      source, target, matches, inliers: new Uint8Array(matches.length), fundamental: null, inlierCount: 0,
      rmsSampson: null, heldOutError: null, iterations: 0, homographyRatio: null, degenerate: false, coverage: 0, threshold,
    };
  }
  const homography = estimateHomographyRansac(matches, { threshold: 2 * threshold, seed: seed + 1 });
  const selection = selectModel(matches, fit.fundamental, homography?.homography ?? null);
  return {
    source,
    target,
    matches,
    inliers: fit.inliers,
    fundamental: fit.fundamental,
    inlierCount: fit.inlierCount,
    rmsSampson: fit.rmsSampson,
    heldOutError: heldOutError(matches, fit.inliers, seed + 2),
    iterations: fit.iterations,
    homographyRatio: selection.homographyRatio,
    degenerate: selection.degenerate,
    coverage: inlierCoverage(matches, fit.inliers, width, height),
    threshold,
  };
}

const now = (): number => performance.now();

/** Detects features in every image, matches every pair, and estimates F for each pair. */
export function analyzeImages(
  cv: OpenCv,
  images: readonly ImageInput[],
  options: AnalysisOptions = DEFAULT_ANALYSIS,
  onProgress: (progress: AnalysisProgress) => void = () => undefined,
): AnalysisResult {
  const pairs = viewPairs(images.length);
  const detected: DetectedFeatures[] = [];
  try {
    const startFeatures = now();
    images.forEach((image, index) => {
      onProgress({ stage: 'features', completed: index, total: images.length });
      detected.push(detectFeatures(cv, image.rgba, image.width, image.height, options));
    });
    onProgress({ stage: 'features', completed: images.length, total: images.length });

    const startMatching = now();
    const putative = pairs.map(([source, target], index) => {
      onProgress({ stage: 'matching', completed: index, total: pairs.length });
      return matchFeatures(cv, detected[source], detected[target]);
    });
    onProgress({ stage: 'matching', completed: pairs.length, total: pairs.length });

    const startEstimation = now();
    const analyses = pairs.map(([source, target], index) => {
      onProgress({ stage: 'estimation', completed: index, total: pairs.length });
      const { width, height } = images[source];
      return estimatePair(source, target, putative[index], width, height, 1 + index * 7);
    });
    onProgress({ stage: 'estimation', completed: pairs.length, total: pairs.length });
    const end = now();

    return {
      detector: options.detector,
      features: detected.map(({ count, points }) => ({ count, points })),
      pairs: analyses,
      milliseconds: {
        features: startMatching - startFeatures,
        matching: startEstimation - startMatching,
        estimation: end - startEstimation,
      },
    };
  } finally {
    detected.forEach((features) => features.descriptors.delete());
  }
}
