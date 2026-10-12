import type { Mat3 } from '../../types';
import { epipolarLine, pointLineDistance, type Pixel } from '../../vision/geometry2d';
import { castRay, createSampleCameras, projectToPixel, visibleFrom, type SampleCamera } from '../../vision/syntheticScene';

export interface TrueCorrespondence {
  point: Pixel;
  /** False when another surface hides the point in the target view. */
  visible: boolean;
}

/**
 * Exact geometry of the sample room. Real photos have no such oracle; the sample uses it to show
 * the true match and to check the estimated F, the way the 3D lab checks Fx against its planes.
 */
export class SampleTruth {
  readonly cameras: SampleCamera[];

  constructor(width: number, height: number) {
    this.cameras = createSampleCameras(width, height);
  }

  correspondence(source: number, point: Pixel, target: number): TrueCorrespondence | null {
    const world = castRay(this.cameras[source], point[0], point[1]);
    if (!world) return null;
    const camera = this.cameras[target];
    const projected = projectToPixel(camera, world);
    if (!projected || projected[0] < 0 || projected[0] > camera.width || projected[1] < 0 || projected[1] > camera.height) return null;
    return { point: projected, visible: visibleFrom(camera, world) };
  }

  /** Median distance in pixels from true correspondences to the lines an estimated F draws. */
  lineError(fundamental: Mat3, source: number, target: number): number | null {
    const camera = this.cameras[source];
    const errors: number[] = [];
    for (let v = camera.height * 0.06; v < camera.height; v += camera.height / 11) {
      for (let u = camera.width * 0.05; u < camera.width; u += camera.width / 13) {
        const truth = this.correspondence(source, [u, v], target);
        if (!truth?.visible) continue;
        const line = epipolarLine(fundamental, [u, v]);
        if (line) errors.push(pointLineDistance(line, truth.point));
      }
    }
    if (!errors.length) return null;
    errors.sort((a, b) => a - b);
    return errors[Math.floor(errors.length / 2)];
  }
}
