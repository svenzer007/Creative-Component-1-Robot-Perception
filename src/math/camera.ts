import type { CameraControls, CameraPose, ProjectionResult, Vec3 } from '../types';
import {
  EPSILON,
  add3,
  degreesToRadians,
  mat3Mul,
  mat3Vec3,
  rotationX,
  rotationY,
  scale3,
  sub3,
  transpose3,
} from './linearAlgebra';

export function cameraPoseFromControls(controls: CameraControls): CameraPose {
  const yaw = degreesToRadians(controls.yawDegrees);
  const pitch = degreesToRadians(controls.pitchDegrees);
  const cameraToWorld = mat3Mul(rotationY(yaw), rotationX(pitch));
  return { center: controls.center, rotation: transpose3(cameraToWorld) };
}

export const worldToCamera = (point: Vec3, camera: CameraPose): Vec3 =>
  mat3Vec3(camera.rotation, sub3(point, camera.center));

export const cameraToWorld = (point: Vec3, camera: CameraPose): Vec3 =>
  add3(mat3Vec3(transpose3(camera.rotation), point), camera.center);

export function projectNormalized(point: Vec3, camera: CameraPose): ProjectionResult {
  const cameraPoint = worldToCamera(point, camera);
  if (Math.abs(cameraPoint[2]) <= EPSILON) {
    return { camera: cameraPoint, homogeneous: cameraPoint, normalized: null, inFront: false };
  }
  return {
    camera: cameraPoint,
    homogeneous: cameraPoint,
    normalized: [cameraPoint[0] / cameraPoint[2], cameraPoint[1] / cameraPoint[2], 1],
    inFront: cameraPoint[2] > EPSILON,
  };
}

export const pointOnViewingRay = (camera: CameraPose, x: Vec3, depth: number): Vec3 =>
  cameraToWorld(scale3(x, depth), camera);
