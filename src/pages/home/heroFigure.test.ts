import { describe, expect, it } from 'vitest';
import { epipolarGeometry, epipolarResidual } from '../../math/epipolar';
import {
  HERO_CAMERA_1,
  HERO_CAMERA_2,
  HERO_CANDIDATE_DEPTHS,
  HERO_DEPTH_RANGE,
  HERO_IMAGE_POINT,
  HERO_PLANE,
  heroEpipolarSegment,
  heroPoint,
} from './heroFigure';

describe('landing page diagram', () => {
  const { fundamental } = epipolarGeometry(HERO_CAMERA_1, HERO_CAMERA_2);

  it('keeps x′ on the epipolar line of x, inside the drawn image, at every depth it shows', () => {
    const depths: number[] = [...HERO_CANDIDATE_DEPTHS];
    for (let depth = HERO_DEPTH_RANGE.min; depth <= HERO_DEPTH_RANGE.max + 1e-9; depth += 0.4) depths.push(depth);
    depths.forEach((depth) => {
      const { image2 } = heroPoint(depth);
      expect(image2).not.toBeNull();
      expect(Math.abs(epipolarResidual(image2!, fundamental, HERO_IMAGE_POINT))).toBeLessThan(1e-12);
      expect(Math.abs(image2![0])).toBeLessThanOrEqual(HERO_PLANE.halfWidth);
      expect(Math.abs(image2![1])).toBeLessThanOrEqual(HERO_PLANE.halfHeight);
    });
  });

  it('draws the epipolar line exactly where Fx puts it', () => {
    const segment = heroEpipolarSegment();
    expect(segment).not.toBeNull();
    segment!.forEach((end) => expect(Math.abs(epipolarResidual(end, fundamental, HERO_IMAGE_POINT))).toBeLessThan(1e-12));
  });
});
