import type {
  AppState,
  CameraControls,
  CameraPose,
  GeometrySnapshot,
  Mat3,
  PresetName,
  RayGeometry,
  SceneVisibility,
  Vec3,
} from '../types';
import { cameraPoseFromControls, pointOnViewingRay, projectNormalized } from '../math/camera';
import {
  baselineLength,
  compareLines,
  constructEpipolarPlane,
  epipolarGeometry,
  epipolarLine1,
  epipolarLine2,
  epipolarResidual,
  intersectEpipolarPlaneWithImage,
} from '../math/epipolar';
import { IDENTITY_3, mat3Vec3, transpose3 } from '../math/linearAlgebra';

export const CAMERA_1: CameraPose = { center: [0, 0, 0], rotation: IDENTITY_3 };
export const CANDIDATE_DEPTHS = [2.5, 3.75, 5, 6.5] as const;
export const FAMILY_POINTS: readonly Vec3[] = [
  [-0.55, -0.35, 1],
  [-0.35, 0.45, 1],
  [0.35, 0.4, 1],
  [0.55, -0.25, 1],
];

export const PRESETS: Record<PresetName, CameraControls> = {
  general: { center: [1.8, 0.25, 0.15], yawDegrees: -10, pitchDegrees: 2 },
  rectified: { center: [1.8, 0, 0], yawDegrees: 0, pitchDegrees: 0 },
  forward: { center: [0.15, 0, 1.2], yawDegrees: 0, pitchDegrees: 0 },
  rotation: { center: [0.03, 0, 0], yawDegrees: -18, pitchDegrees: 6 },
};

export const DEFAULT_STATE: AppState = {
  u: 0.2,
  v: 0.1,
  depth: 4.5,
  camera2: PRESETS.general,
  preset: 'general',
  showFamily: false,
  presentation: { active: false, stage: 1 },
};

function deriveRay(
  x: Vec3,
  camera1: CameraPose,
  camera2: CameraPose,
  fundamental: Mat3,
  referenceDepth: number,
): RayGeometry {
  const directionWorld = mat3Vec3(transpose3(camera1.rotation), x);
  const plane = constructEpipolarPlane(camera1, camera2, x);
  const line2FromF = epipolarLine2(fundamental, x);
  const intersection = plane ? intersectEpipolarPlaneWithImage(plane, camera2) : null;
  const line2FromIntersection = intersection?.cameraLine ?? null;
  const referenceProjection = projectNormalized(pointOnViewingRay(camera1, x, referenceDepth), camera2);
  const line1 = referenceProjection.normalized ? epipolarLine1(fundamental, referenceProjection.normalized) : null;
  return {
    x,
    directionWorld,
    plane,
    line1,
    line2FromF,
    line2FromIntersection,
    line2Intersection: intersection,
    agreementError: line2FromF && line2FromIntersection
      ? compareLines(line2FromF, line2FromIntersection)
      : null,
  };
}

export function deriveGeometry(state: AppState): GeometrySnapshot {
  const camera1 = CAMERA_1;
  const camera2 = cameraPoseFromControls(state.camera2);
  const x: Vec3 = [state.u, state.v, 1];
  const worldPoint = pointOnViewingRay(camera1, x, state.depth);
  const candidateWorldPoints = CANDIDATE_DEPTHS.map((depth) => pointOnViewingRay(camera1, x, depth));
  const projection2 = projectNormalized(worldPoint, camera2);
  const candidateProjections2 = candidateWorldPoints.map((point) => projectNormalized(point, camera2));
  const epipolar = epipolarGeometry(camera1, camera2);
  const ray = deriveRay(x, camera1, camera2, epipolar.fundamental, state.depth);
  const family = FAMILY_POINTS.map((point) => deriveRay(point, camera1, camera2, epipolar.fundamental, 4.5));
  const baseline = baselineLength(camera1, camera2);
  const residual = projection2.normalized
    ? epipolarResidual(projection2.normalized, epipolar.fundamental, x)
    : null;

  let warning: string | null = null;
  if (baseline < 1e-8) {
    warning = 'The baseline is zero: E = [t]×R collapses to zero, so epipolar geometry is undefined.';
  } else if (baseline < 0.08) {
    warning = 'Near pure rotation: the tiny baseline makes epipolar geometry numerically fragile as E approaches zero.';
  } else if (!projection2.normalized) {
    warning = 'The selected 3D point lies on Camera 2’s z = 0 plane, so its normalized projection is undefined.';
  } else if (!projection2.inFront) {
    warning = 'The selected 3D point is behind Camera 2. The projective relation remains valid, but x′ is not visible.';
  } else if (ray.agreementError !== null && ray.agreementError > 1e-8) {
    warning = `Geometry/algebra disagreement detected (${ray.agreementError.toExponential(2)}).`;
  }

  return {
    state,
    camera1,
    camera2,
    x,
    worldPoint,
    candidateDepths: CANDIDATE_DEPTHS,
    candidateWorldPoints,
    projection2,
    candidateProjections2,
    epipolar,
    ray,
    family,
    residual,
    baselineLength: baseline,
    warning,
  };
}

export type StateListener = (state: AppState, snapshot: GeometrySnapshot) => void;

export class AppStore {
  private state: AppState;
  private listeners = new Set<StateListener>();

  constructor(initial: AppState = DEFAULT_STATE) {
    this.state = structuredClone(initial);
  }

  getState(): AppState {
    return this.state;
  }

  snapshot(): GeometrySnapshot {
    return deriveGeometry(this.state);
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state, this.snapshot());
    return () => this.listeners.delete(listener);
  }

  update(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  setImagePoint(u: number, v: number): void {
    this.update({ u, v });
  }

  setCamera2(camera2: CameraControls, preset = this.state.preset): void {
    this.update({ camera2, preset });
  }

  applyPreset(preset: PresetName): void {
    this.update({ preset, camera2: PRESETS[preset] });
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(this.state, snapshot));
  }
}

export function visibilityForState(state: AppState): SceneVisibility {
  if (!state.presentation.active) {
    return {
      camera2: true,
      candidates: true,
      baseline: true,
      plane: true,
      lines: true,
      correspondence: true,
      family: state.showFamily,
      epipoles: true,
    };
  }
  const stage = state.presentation.stage;
  return {
    camera2: stage >= 3,
    candidates: stage >= 2,
    baseline: stage >= 4,
    plane: stage >= 4,
    lines: stage >= 5,
    correspondence: stage >= 7,
    family: stage >= 8,
    epipoles: stage >= 8,
  };
}
