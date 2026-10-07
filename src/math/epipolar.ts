import type {
  CameraPose,
  EpipolarGeometry,
  EpipoleResult,
  Line3,
  Mat3,
  Plane3,
  PlaneIntersection2D,
  Vec3,
} from '../types';
import { cameraToWorld, worldToCamera } from './camera';
import {
  EPSILON,
  add3,
  cross3,
  dot3,
  lineAgreement,
  mat3Mul,
  mat3Vec3,
  norm3,
  normalize3,
  normalizeLine,
  scale3,
  skew3,
  sub3,
  svd3,
  transpose3,
} from './linearAlgebra';

export const VIEW_MIN = -1.25;
export const VIEW_MAX = 1.25;

export function epipolarGeometry(camera1: CameraPose, camera2: CameraPose): EpipolarGeometry {
  const relativeRotation = mat3Mul(camera2.rotation, transpose3(camera1.rotation));
  const relativeTranslation = mat3Vec3(camera2.rotation, sub3(camera1.center, camera2.center));
  const fundamental = mat3Mul(skew3(relativeTranslation), relativeRotation);
  const decomposition = svd3(fundamental);
  const valid = decomposition.singularValues[0] > EPSILON;
  return {
    relativeRotation,
    relativeTranslation,
    fundamental,
    singularValues: decomposition.singularValues,
    rank: decomposition.rank,
    epipole1: valid ? asEpipole(decomposition.rightNull) : null,
    epipole2: valid ? asEpipole(decomposition.leftNull) : null,
  };
}

export function asEpipole(homogeneous: Vec3): EpipoleResult {
  const finite = Math.abs(homogeneous[2]) > EPSILON;
  return {
    homogeneous,
    finite,
    normalized: finite
      ? [homogeneous[0] / homogeneous[2], homogeneous[1] / homogeneous[2], 1]
      : null,
  };
}

export function planeFromPointNormal(point: Vec3, normal: Vec3): Plane3 | null {
  const normalized = normalize3(normal);
  return normalized ? { point, normal: normalized } : null;
}

export const signedPlaneDistance = (plane: Plane3, point: Vec3): number =>
  dot3(plane.normal, sub3(point, plane.point));

export function intersectPlanes(first: Plane3, second: Plane3): Line3 | null {
  const directionRaw = cross3(first.normal, second.normal);
  const denominator = dot3(directionRaw, directionRaw);
  if (denominator <= EPSILON * EPSILON) return null;
  const d1 = dot3(first.normal, first.point);
  const d2 = dot3(second.normal, second.point);
  const point = scale3(
    add3(
      scale3(cross3(second.normal, directionRaw), d1),
      scale3(cross3(directionRaw, first.normal), d2),
    ),
    1 / denominator,
  );
  return { point, direction: normalize3(directionRaw) as Vec3 };
}

export function cameraImagePlane(camera: CameraPose): Plane3 {
  const point = cameraToWorld([0, 0, 1], camera);
  const normal = mat3Vec3(transpose3(camera.rotation), [0, 0, 1]);
  return { point, normal };
}

export function lineThroughHomogeneousPoints(a: Vec3, b: Vec3): Vec3 | null {
  return normalizeLine(cross3(a, b));
}

export function clipLineToSquare(
  line: Vec3,
  minimum = VIEW_MIN,
  maximum = VIEW_MAX,
): readonly [Vec3, Vec3] | null {
  const [a, b, c] = line;
  const points: Vec3[] = [];
  const addIfValid = (u: number, v: number): void => {
    if (u < minimum - EPSILON || u > maximum + EPSILON || v < minimum - EPSILON || v > maximum + EPSILON) return;
    if (!points.some((point) => Math.hypot(point[0] - u, point[1] - v) < 1e-8)) points.push([u, v, 1]);
  };
  if (Math.abs(b) > EPSILON) {
    addIfValid(minimum, -(a * minimum + c) / b);
    addIfValid(maximum, -(a * maximum + c) / b);
  }
  if (Math.abs(a) > EPSILON) {
    addIfValid(-(b * minimum + c) / a, minimum);
    addIfValid(-(b * maximum + c) / a, maximum);
  }
  return points.length >= 2 ? [points[0], points[1]] : null;
}

/**
 * Intersects the independently constructed world epipolar plane with the
 * physical Camera-2 z=1 image plane. No F-derived line is used here.
 */
export function intersectEpipolarPlaneWithImage(
  epipolarPlane: Plane3,
  camera2: CameraPose,
): PlaneIntersection2D | null {
  const worldLine = intersectPlanes(epipolarPlane, cameraImagePlane(camera2));
  if (!worldLine) return null;
  const worldA = add3(worldLine.point, worldLine.direction);
  const worldB = sub3(worldLine.point, worldLine.direction);
  const cameraA = worldToCamera(worldA, camera2);
  const cameraB = worldToCamera(worldB, camera2);
  const line = lineThroughHomogeneousPoints([cameraA[0], cameraA[1], 1], [cameraB[0], cameraB[1], 1]);
  if (!line) return null;
  const clippedCameraPoints = clipLineToSquare(line);
  const clippedWorldPoints = clippedCameraPoints
    ? [cameraToWorld(clippedCameraPoints[0], camera2), cameraToWorld(clippedCameraPoints[1], camera2)] as const
    : null;
  return { worldLine, cameraLine: line, clippedCameraPoints, clippedWorldPoints };
}

export function constructEpipolarPlane(camera1: CameraPose, camera2: CameraPose, x: Vec3): Plane3 | null {
  const directionWorld = mat3Vec3(transpose3(camera1.rotation), x);
  const baseline = sub3(camera2.center, camera1.center);
  return planeFromPointNormal(camera1.center, cross3(baseline, directionWorld));
}

export function epipolarLine2(fundamental: Mat3, x: Vec3): Vec3 | null {
  return normalizeLine(mat3Vec3(fundamental, x));
}

export function epipolarLine1(fundamental: Mat3, xPrime: Vec3): Vec3 | null {
  return normalizeLine(mat3Vec3(transpose3(fundamental), xPrime));
}

export const epipolarResidual = (xPrime: Vec3, fundamental: Mat3, x: Vec3): number =>
  dot3(xPrime, mat3Vec3(fundamental, x));

export const compareLines = (first: Vec3, second: Vec3): number | null => lineAgreement(first, second);

export function pointAlongLine(line: Line3, distance: number): Vec3 {
  return add3(line.point, scale3(line.direction, distance));
}

export const baselineLength = (camera1: CameraPose, camera2: CameraPose): number =>
  norm3(sub3(camera2.center, camera1.center));
