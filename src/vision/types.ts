import type { Mat3 } from '../types';

/** A putative correspondence in pixel coordinates: (x1, y1) in the source view, (x2, y2) in the target view. */
export type Correspondence = readonly [x1: number, y1: number, x2: number, y2: number];

export interface FundamentalFit {
  /** Row-major F that maps a source pixel x to its target epipolar line l′ = Fx. */
  fundamental: Mat3;
  /** 1 for correspondences the final model accepts, 0 otherwise. */
  inliers: Uint8Array;
  inlierCount: number;
  iterations: number;
  /** Root-mean-square Sampson distance of the inliers, in pixels. */
  rmsSampson: number;
}

export interface HomographyFit {
  /** Row-major H that maps a source pixel to a target pixel. */
  homography: Mat3;
  inliers: Uint8Array;
  inlierCount: number;
  iterations: number;
}

export interface GrayImage {
  width: number;
  height: number;
  /** Luminance in [0, 1], row-major. */
  data: Float32Array;
}
