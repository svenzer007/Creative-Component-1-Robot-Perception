import type { Mat3 } from '../types';
import { eightPoint, matchSampsonSquared, rmsSampson } from './fundamental';
import { homographyDlt, invert3, transferErrorSquared } from './homography';
import { createRandom, sampleDistinct } from './random';
import type { Correspondence, FundamentalFit, HomographyFit } from './types';

export interface RansacOptions {
  /** Inlier threshold in pixels (Sampson distance for F, transfer error for H). */
  threshold: number;
  /** Probability of drawing at least one all-inlier sample before stopping. */
  confidence: number;
  maxIterations: number;
  seed: number;
}

export const FUNDAMENTAL_RANSAC: RansacOptions = { threshold: 1.5, confidence: 0.999, maxIterations: 5000, seed: 1 };
export const HOMOGRAPHY_RANSAC: RansacOptions = { threshold: 3, confidence: 0.999, maxIterations: 2000, seed: 2 };

/** Iterations needed so a sample of `sampleSize` inliers appears with probability `confidence`. */
export function requiredIterations(inlierRatio: number, sampleSize: number, confidence: number, cap: number): number {
  if (inlierRatio >= 1) return 1;
  const allInlier = inlierRatio ** sampleSize;
  if (allInlier <= 0) return cap;
  const iterations = Math.log(1 - confidence) / Math.log(1 - allInlier);
  return Number.isFinite(iterations) ? Math.min(cap, Math.max(1, Math.ceil(iterations))) : cap;
}

/** Rejects samples with near-duplicate points in either image; they make the linear system degenerate. */
function sampleIsSpread(matches: readonly Correspondence[], sample: Int32Array): boolean {
  for (let i = 0; i < sample.length; i += 1) {
    const a = matches[sample[i]];
    for (let j = i + 1; j < sample.length; j += 1) {
      const b = matches[sample[j]];
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 1.5) return false;
      if (Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3]) < 1.5) return false;
    }
  }
  return true;
}

interface Scored {
  cost: number;
  inliers: number;
}

function scoreModel(
  matches: readonly Correspondence[],
  error: (match: Correspondence) => number,
  thresholdSquared: number,
  bestCost: number,
): Scored {
  let cost = 0;
  let inliers = 0;
  for (let i = 0; i < matches.length; i += 1) {
    const value = error(matches[i]);
    if (value < thresholdSquared) {
      cost += value;
      inliers += 1;
    } else {
      cost += thresholdSquared;
    }
    if (cost >= bestCost) break;
  }
  return { cost, inliers };
}

function inlierMask(matches: readonly Correspondence[], error: (match: Correspondence) => number, thresholdSquared: number): Uint8Array {
  const mask = new Uint8Array(matches.length);
  matches.forEach((match, index) => {
    mask[index] = error(match) < thresholdSquared ? 1 : 0;
  });
  return mask;
}

const maskIndices = (mask: Uint8Array): Int32Array => {
  const indices: number[] = [];
  mask.forEach((value, index) => {
    if (value) indices.push(index);
  });
  return Int32Array.from(indices);
};

const countMask = (mask: Uint8Array): number => mask.reduce((sum, value) => sum + value, 0);

/**
 * MSAC over minimal eight-point samples, followed by least-squares refits on the
 * consensus set until the inlier count stops growing.
 */
export function estimateFundamentalRansac(
  matches: readonly Correspondence[],
  options: Partial<RansacOptions> = {},
): FundamentalFit | null {
  const settings = { ...FUNDAMENTAL_RANSAC, ...options };
  if (matches.length < 8) return null;
  const random = createRandom(settings.seed);
  const sample = new Int32Array(8);
  const thresholdSquared = settings.threshold ** 2;
  let bestCost = Number.POSITIVE_INFINITY;
  let best: Mat3 | null = null;
  let required = settings.maxIterations;
  let iteration = 0;

  for (; iteration < required; iteration += 1) {
    sampleDistinct(matches.length, random, sample);
    if (!sampleIsSpread(matches, sample)) continue;
    const candidate = eightPoint(matches, sample);
    if (!candidate) continue;
    const scored = scoreModel(matches, (match) => matchSampsonSquared(candidate, match), thresholdSquared, bestCost);
    if (scored.cost < bestCost) {
      bestCost = scored.cost;
      best = candidate;
      required = requiredIterations(scored.inliers / matches.length, 8, settings.confidence, settings.maxIterations);
    }
  }
  if (!best) return null;

  let fundamental = best;
  let mask = inlierMask(matches, (match) => matchSampsonSquared(fundamental, match), thresholdSquared);
  for (let pass = 0; pass < 4; pass += 1) {
    const refit = eightPoint(matches, maskIndices(mask));
    if (!refit) break;
    const refitMask = inlierMask(matches, (match) => matchSampsonSquared(refit, match), thresholdSquared);
    if (countMask(refitMask) < countMask(mask)) break;
    const unchanged = refitMask.every((value, index) => value === mask[index]);
    fundamental = refit;
    mask = refitMask;
    if (unchanged) break;
  }

  const inlierCount = countMask(mask);
  if (inlierCount < 8) return null;
  return {
    fundamental,
    inliers: mask,
    inlierCount,
    iterations: iteration,
    rmsSampson: rmsSampson(fundamental, matches, mask),
  };
}

/** Same MSAC loop with four-point homography samples; used to detect rotation-only or planar pairs. */
export function estimateHomographyRansac(
  matches: readonly Correspondence[],
  options: Partial<RansacOptions> = {},
): HomographyFit | null {
  const settings = { ...HOMOGRAPHY_RANSAC, ...options };
  if (matches.length < 4) return null;
  const random = createRandom(settings.seed);
  const sample = new Int32Array(4);
  const thresholdSquared = settings.threshold ** 2;
  let bestCost = Number.POSITIVE_INFINITY;
  let best: Mat3 | null = null;
  let required = settings.maxIterations;
  let iteration = 0;

  for (; iteration < required; iteration += 1) {
    sampleDistinct(matches.length, random, sample);
    if (!sampleIsSpread(matches, sample)) continue;
    const candidate = homographyDlt(matches, sample);
    if (!candidate) continue;
    const error = (match: Correspondence): number => transferErrorSquared(candidate, match[0], match[1], match[2], match[3]);
    const scored = scoreModel(matches, error, thresholdSquared, bestCost);
    if (scored.cost < bestCost) {
      bestCost = scored.cost;
      best = candidate;
      required = requiredIterations(scored.inliers / matches.length, 4, settings.confidence, settings.maxIterations);
    }
  }
  if (!best) return null;

  const initial = best;
  let homography = initial;
  let mask = inlierMask(matches, (match) => transferErrorSquared(initial, match[0], match[1], match[2], match[3]), thresholdSquared);
  const refit = homographyDlt(matches, maskIndices(mask));
  if (refit) {
    const refitMask = inlierMask(matches, (match) => transferErrorSquared(refit, match[0], match[1], match[2], match[3]), thresholdSquared);
    if (countMask(refitMask) >= countMask(mask)) {
      homography = refit;
      mask = refitMask;
    }
  }
  return { homography, inliers: mask, inlierCount: countMask(mask), iterations: iteration };
}

export interface ModelSelection {
  scoreFundamental: number;
  scoreHomography: number;
  /** S_H / (S_H + S_F); values above ~0.45 mean one homography explains the pair (ORB-SLAM, Mur-Artal et al. 2015). */
  homographyRatio: number;
  degenerate: boolean;
}

const CHI2_ONE_DOF = 3.841;
const CHI2_TWO_DOF = 5.991;

/**
 * Compares how well F and H explain every putative match, with the chi-square scoring used for
 * ORB-SLAM initialization. A high homography ratio means the camera mostly rotated or the scene
 * is nearly planar, so the epipolar geometry is poorly constrained.
 */
export function selectModel(
  matches: readonly Correspondence[],
  fundamental: Mat3,
  homography: Mat3 | null,
  sigma = 1,
): ModelSelection {
  const inverseSigmaSquared = 1 / (sigma * sigma);
  const f = fundamental;
  let scoreFundamental = 0;
  for (const [x1, y1, x2, y2] of matches) {
    const a2 = f[0] * x1 + f[1] * y1 + f[2];
    const b2 = f[3] * x1 + f[4] * y1 + f[5];
    const c2 = f[6] * x1 + f[7] * y1 + f[8];
    const distance2 = (a2 * x2 + b2 * y2 + c2) ** 2 / (a2 * a2 + b2 * b2);
    const a1 = f[0] * x2 + f[3] * y2 + f[6];
    const b1 = f[1] * x2 + f[4] * y2 + f[7];
    const c1 = f[2] * x2 + f[5] * y2 + f[8];
    const distance1 = (a1 * x1 + b1 * y1 + c1) ** 2 / (a1 * a1 + b1 * b1);
    const chiTarget = distance2 * inverseSigmaSquared;
    const chiSource = distance1 * inverseSigmaSquared;
    if (chiTarget < CHI2_ONE_DOF) scoreFundamental += CHI2_TWO_DOF - chiTarget;
    if (chiSource < CHI2_ONE_DOF) scoreFundamental += CHI2_TWO_DOF - chiSource;
  }

  let scoreHomography = 0;
  const inverse = homography ? invert3(homography) : null;
  if (homography && inverse) {
    for (const [x1, y1, x2, y2] of matches) {
      const forward = transferErrorSquared(homography, x1, y1, x2, y2) * inverseSigmaSquared;
      const backward = transferErrorSquared(inverse, x2, y2, x1, y1) * inverseSigmaSquared;
      if (forward < CHI2_TWO_DOF) scoreHomography += CHI2_TWO_DOF - forward;
      if (backward < CHI2_TWO_DOF) scoreHomography += CHI2_TWO_DOF - backward;
    }
  }
  const total = scoreFundamental + scoreHomography;
  const homographyRatio = total > 0 ? scoreHomography / total : 0;
  return { scoreFundamental, scoreHomography, homographyRatio, degenerate: homographyRatio > 0.45 };
}

/**
 * Honest generalization error: refit F on a random 80% of the inliers and report the RMS
 * Sampson distance of the 20% it never saw.
 */
export function heldOutError(
  matches: readonly Correspondence[],
  inliers: Uint8Array,
  seed = 11,
): number | null {
  const indices = Array.from(maskIndices(inliers));
  if (indices.length < 20) return null;
  const random = createRandom(seed);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const split = Math.floor(indices.length * 0.8);
  const fitted = eightPoint(matches, indices.slice(0, split));
  if (!fitted) return null;
  const held = indices.slice(split).map((index) => matches[index]);
  return rmsSampson(fitted, held);
}
