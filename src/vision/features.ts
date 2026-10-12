import type { Correspondence } from './types';

/*
 * Thin adapter over OpenCV.js (WebAssembly). OpenCV only finds and matches distinctive points here;
 * every geometric estimate is computed by this project's TypeScript (fundamental.ts, ransac.ts).
 * The package's bundled type declarations lag the runtime (they omit AKAZE), so the slice of the
 * API used below is typed structurally.
 */

export interface CvMat {
  rows: number;
  cols: number;
  delete(): void;
}
interface CvKeyPoint {
  pt: { x: number; y: number };
  response: number;
}
interface CvKeyPointVector {
  size(): number;
  get(index: number): CvKeyPoint;
  push_back(keypoint: CvKeyPoint): void;
  delete(): void;
}
interface CvDMatch {
  queryIdx: number;
  trainIdx: number;
  distance: number;
}
interface CvDMatchVector {
  size(): number;
  get(index: number): CvDMatch;
  delete(): void;
}
interface CvDMatchVectorVector {
  size(): number;
  get(index: number): CvDMatchVector;
  delete(): void;
}
interface CvFeature2D {
  detect(image: CvMat, keypoints: CvKeyPointVector, mask: CvMat): void;
  compute(image: CvMat, keypoints: CvKeyPointVector, descriptors: CvMat): void;
  detectAndCompute(image: CvMat, mask: CvMat, keypoints: CvKeyPointVector, descriptors: CvMat): void;
  delete(): void;
}
interface CvMatcher {
  knnMatch(query: CvMat, train: CvMat, matches: CvDMatchVectorVector, k: number): void;
  delete(): void;
}

export interface OpenCv {
  Mat: new () => CvMat;
  KeyPointVector: new () => CvKeyPointVector;
  DMatchVectorVector: new () => CvDMatchVectorVector;
  AKAZE: new () => CvFeature2D & { setThreshold(threshold: number): void };
  ORB: new (features: number) => CvFeature2D;
  BFMatcher: new (norm: number, crossCheck: boolean) => CvMatcher;
  matFromImageData(image: { data: Uint8ClampedArray; width: number; height: number }): CvMat;
  cvtColor(source: CvMat, destination: CvMat, code: number): void;
  COLOR_RGBA2GRAY: number;
  NORM_HAMMING: number;
}

type EmscriptenModule = Partial<OpenCv> & {
  then?: (callback: (module: EmscriptenModule) => void) => void;
  onRuntimeInitialized?: () => void;
};

/**
 * Emscripten modules are "thenable" and resolve with themselves, so handing one to a Promise
 * makes the Promise adopt it forever. Stripping `then` before resolving breaks that loop.
 */
export function waitForOpenCv(candidate: unknown, timeoutMs = 60000): Promise<OpenCv> {
  return new Promise<OpenCv>((resolve, reject) => {
    const module = candidate as EmscriptenModule;
    const timer = setTimeout(() => reject(new Error('The vision engine did not start in time.')), timeoutMs);
    const done = (ready: EmscriptenModule): void => {
      clearTimeout(timer);
      delete ready.then;
      resolve(ready as OpenCv);
    };
    if (typeof module.then === 'function') module.then(done);
    else if (module.Mat) done(module);
    else module.onRuntimeInitialized = () => done(module);
  });
}

/**
 * Evaluates the opencv.js UMD source as CommonJS. Importing it as an ES module does not work:
 * bundler interop copies the Emscripten `then` onto the module namespace, so `import()` adopts
 * that thenable forever and never resolves. `process` is shadowed so the Emscripten runtime never
 * takes its Node.js branch (which needs __dirname and fs); in browsers it is undefined anyway.
 */
export function evaluateOpenCv(source: string): Promise<OpenCv> {
  const module: { exports: unknown } = { exports: {} };
  new Function('module', 'exports', 'process', source)(module, module.exports, undefined);
  return waitForOpenCv(module.exports);
}

export type DetectorName = 'akaze' | 'orb';

export interface DetectedFeatures {
  /** x, y pairs in pixels. */
  points: Float32Array;
  count: number;
  descriptors: CvMat;
}

export interface DetectOptions {
  detector: DetectorName;
  maxFeatures: number;
  /** AKAZE detector response threshold; lower finds more, weaker keypoints. */
  akazeThreshold?: number;
}

/** Detects keypoints and binary descriptors, keeping the strongest `maxFeatures` responses. */
export function detectFeatures(
  cv: OpenCv,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: DetectOptions,
): DetectedFeatures {
  const color = cv.matFromImageData({ data: rgba, width, height });
  const gray = new cv.Mat();
  cv.cvtColor(color, gray, cv.COLOR_RGBA2GRAY);
  color.delete();
  const mask = new cv.Mat();
  const descriptors = new cv.Mat();
  let keypoints = new cv.KeyPointVector();

  if (options.detector === 'orb') {
    const orb = new cv.ORB(options.maxFeatures);
    orb.detectAndCompute(gray, mask, keypoints, descriptors);
    orb.delete();
  } else {
    const akaze = new cv.AKAZE();
    akaze.setThreshold(options.akazeThreshold ?? 0.0003);
    akaze.detect(gray, keypoints, mask);
    if (keypoints.size() > options.maxFeatures) {
      const order = Array.from({ length: keypoints.size() }, (_, index) => index);
      const responses = order.map((index) => keypoints.get(index).response);
      order.sort((first, second) => responses[second] - responses[first]);
      const strongest = new cv.KeyPointVector();
      for (let i = 0; i < options.maxFeatures; i += 1) strongest.push_back(keypoints.get(order[i]));
      keypoints.delete();
      keypoints = strongest;
    }
    akaze.compute(gray, keypoints, descriptors);
    akaze.delete();
  }

  const count = keypoints.size();
  const points = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    const { pt } = keypoints.get(i);
    points[i * 2] = pt.x;
    points[i * 2 + 1] = pt.y;
  }
  keypoints.delete();
  mask.delete();
  gray.delete();
  return { points, count, descriptors };
}

/**
 * Brute-force Hamming matching with Lowe's ratio test and a mutual-best check, which removes most
 * outliers before RANSAC sees them.
 */
export function matchFeatures(cv: OpenCv, source: DetectedFeatures, target: DetectedFeatures, ratio = 0.8): Correspondence[] {
  if (source.count < 2 || target.count < 2) return [];
  const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
  const forward = new cv.DMatchVectorVector();
  const backward = new cv.DMatchVectorVector();
  matcher.knnMatch(source.descriptors, target.descriptors, forward, 2);
  matcher.knnMatch(target.descriptors, source.descriptors, backward, 1);

  const backwardBest = new Int32Array(target.count).fill(-1);
  for (let i = 0; i < backward.size(); i += 1) {
    const candidates = backward.get(i);
    if (candidates.size() > 0) {
      const best = candidates.get(0);
      backwardBest[best.queryIdx] = best.trainIdx;
    }
    candidates.delete();
  }

  const matches: Correspondence[] = [];
  for (let i = 0; i < forward.size(); i += 1) {
    const candidates = forward.get(i);
    if (candidates.size() >= 2) {
      const best = candidates.get(0);
      const second = candidates.get(1);
      if (best.distance < ratio * second.distance && backwardBest[best.trainIdx] === best.queryIdx) {
        matches.push([
          source.points[best.queryIdx * 2],
          source.points[best.queryIdx * 2 + 1],
          target.points[best.trainIdx * 2],
          target.points[best.trainIdx * 2 + 1],
        ]);
      }
    }
    candidates.delete();
  }
  forward.delete();
  backward.delete();
  matcher.delete();
  return matches;
}
