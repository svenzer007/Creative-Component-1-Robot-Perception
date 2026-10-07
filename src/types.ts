export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export interface CameraPose {
  center: Vec3;
  /** Row-major world-to-camera rotation. */
  rotation: Mat3;
}

export interface Plane3 {
  point: Vec3;
  normal: Vec3;
}

export interface Line3 {
  point: Vec3;
  direction: Vec3;
}

export interface ProjectionResult {
  camera: Vec3;
  homogeneous: Vec3;
  normalized: Vec3 | null;
  inFront: boolean;
}

export interface EpipoleResult {
  homogeneous: Vec3;
  finite: boolean;
  normalized: Vec3 | null;
}

export interface EpipolarGeometry {
  relativeRotation: Mat3;
  relativeTranslation: Vec3;
  fundamental: Mat3;
  singularValues: Vec3;
  rank: number;
  epipole1: EpipoleResult | null;
  epipole2: EpipoleResult | null;
}

export type PresetName = 'general' | 'rectified' | 'forward' | 'rotation';

export interface CameraControls {
  center: Vec3;
  yawDegrees: number;
  pitchDegrees: number;
}

export interface PresentationState {
  active: boolean;
  stage: number;
}

export interface AppState {
  u: number;
  v: number;
  depth: number;
  camera2: CameraControls;
  preset: PresetName;
  showFamily: boolean;
  presentation: PresentationState;
}

export interface PlaneIntersection2D {
  worldLine: Line3;
  cameraLine: Vec3;
  clippedCameraPoints: readonly [Vec3, Vec3] | null;
  clippedWorldPoints: readonly [Vec3, Vec3] | null;
}

export interface RayGeometry {
  x: Vec3;
  directionWorld: Vec3;
  plane: Plane3 | null;
  line1: Vec3 | null;
  line2FromF: Vec3 | null;
  line2FromIntersection: Vec3 | null;
  line2Intersection: PlaneIntersection2D | null;
  agreementError: number | null;
}

export interface GeometrySnapshot {
  state: AppState;
  camera1: CameraPose;
  camera2: CameraPose;
  x: Vec3;
  worldPoint: Vec3;
  candidateDepths: readonly number[];
  candidateWorldPoints: readonly Vec3[];
  projection2: ProjectionResult;
  candidateProjections2: readonly ProjectionResult[];
  epipolar: EpipolarGeometry;
  ray: RayGeometry;
  family: readonly RayGeometry[];
  residual: number | null;
  baselineLength: number;
  warning: string | null;
}

export interface SceneVisibility {
  camera2: boolean;
  candidates: boolean;
  baseline: boolean;
  plane: boolean;
  lines: boolean;
  correspondence: boolean;
  family: boolean;
  epipoles: boolean;
}
