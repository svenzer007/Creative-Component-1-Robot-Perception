import type { CameraControls, CameraPose, EpipoleResult, Mat3, Vec3 } from '../../types';
import type { Pixel } from '../../vision/geometry2d';
import { CAMERA_1, PRESETS } from '../../state/appState';
import { cameraPoseFromControls } from '../../math/camera';
import { calibratedEpipolar, essentialFromFundamental, matrixAgreementUpToScale, normalizeImagePoint } from '../../math/calibratedEpipolar';
import { dot3, mat3Vec3, norm3, normalize3, scale3, svd3 } from '../../math/linearAlgebra';
import {
  clipToImage,
  closestPointOnLine,
  epipolarLine,
  epipoles,
  pointLineDistance,
  reverseEpipolarLine,
} from '../../vision/geometry2d';

export type ConceptSection = 'fundamental' | 'essential';
export type ConceptPreset = 'general' | 'rectified' | 'forward' | 'nearRotation';
export type LessonFocus = 'intro' | 'source' | 'target' | 'pencil' | 'preset' | 'pose' | 'calibration' | 'scale';

export interface IntrinsicsControls {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
}

export interface CoreConceptsState {
  section: ConceptSection;
  preset: ConceptPreset;
  camera2: CameraControls;
  sourcePixel: Pixel;
  targetPixel: Pixel;
  intrinsics1: IntrinsicsControls;
  intrinsics2: IntrinsicsControls;
  baselineScale: number;
  showPencil: boolean;
  showAdvancedGeometry: boolean;
  lessonFocus: LessonFocus;
}

export const IMAGE_WIDTH = 640;
export const IMAGE_HEIGHT = 420;
export const FAMILY_PIXELS: readonly Pixel[] = [
  [88, 78],
  [210, 148],
  [352, 262],
  [548, 338],
];

export const CONCEPT_PRESETS: Record<ConceptPreset, CameraControls> = {
  general: PRESETS.general,
  rectified: PRESETS.rectified,
  forward: PRESETS.forward,
  nearRotation: PRESETS.rotation,
};

export const PRESET_DESCRIPTIONS: Record<ConceptSection, Record<ConceptPreset, string>> = {
  fundamental: {
    forward: 'Forward motion brings the epipole into the image, so the epipolar lines radiate from a visible point.',
    general: 'Translation and rotation produce oblique epipolar lines and a typically off-frame epipole.',
    rectified: 'Parallel cameras with a horizontal baseline produce horizontal, parallel lines and an epipole at infinity.',
    nearRotation: 'A tiny baseline makes the translational epipolar signal weak and numerically fragile.',
  },
  essential: {
    forward: 'Translation is mainly along the viewing direction, making its direction and the finite epipole easy to see.',
    general: 'Both relative rotation R and translation t are nontrivial, giving a generic Essential-matrix configuration.',
    rectified: 'The cameras share orientation and translate horizontally, making the calibrated stereo geometry especially simple.',
    nearRotation: 'Translation is tiny; as ‖t‖ approaches zero, E becomes degenerate and translational stereo information disappears.',
  },
};

const controlsMatch = (first: CameraControls, second: CameraControls): boolean => (
  first.center.every((value, index) => Math.abs(value - second.center[index]) < 1e-9)
  && Math.abs(first.yawDegrees - second.yawDegrees) < 1e-9
  && Math.abs(first.pitchDegrees - second.pitchDegrees) < 1e-9
);

/** Returns the preset represented by the base pose, independent of the scale experiment. */
export function matchingPreset(camera2: CameraControls): ConceptPreset | null {
  const match = (Object.keys(CONCEPT_PRESETS) as ConceptPreset[])
    .find((preset) => controlsMatch(camera2, CONCEPT_PRESETS[preset]));
  return match ?? null;
}

export function presetDescription(section: ConceptSection, camera2: CameraControls): string {
  const preset = matchingPreset(camera2);
  if (preset) return PRESET_DESCRIPTIONS[section][preset];
  return section === 'essential'
    ? 'Custom pose: the Camera 2 controls now define the relative rotation R and translation t.'
    : 'Custom pose: the current camera geometry now determines the epipolar lines and epipoles.';
}

export const DEFAULT_INTRINSICS_1: IntrinsicsControls = { fx: 520, fy: 520, cx: 320, cy: 210 };
export const DEFAULT_INTRINSICS_2: IntrinsicsControls = { fx: 560, fy: 560, cx: 320, cy: 210 };

export const DEFAULT_CONCEPTS_STATE: CoreConceptsState = {
  section: 'fundamental',
  preset: 'forward',
  camera2: structuredClone(CONCEPT_PRESETS.forward),
  sourcePixel: [248, 166],
  targetPixel: [404, 238],
  intrinsics1: structuredClone(DEFAULT_INTRINSICS_1),
  intrinsics2: structuredClone(DEFAULT_INTRINSICS_2),
  baselineScale: 1,
  showPencil: false,
  showAdvancedGeometry: false,
  lessonFocus: 'intro',
};

export const intrinsicsMatrix = (controls: IntrinsicsControls): Mat3 => [
  controls.fx, 0, controls.cx,
  0, controls.fy, controls.cy,
  0, 0, 1,
];

export interface PencilLine {
  source: Pixel;
  line: Vec3;
  clipped: readonly [Vec3, Vec3] | null;
}

export interface CoreConceptsSnapshot {
  state: CoreConceptsState;
  camera1: CameraPose;
  camera2: CameraPose;
  sourceK: Mat3;
  targetK: Mat3;
  sourcePoint: Vec3;
  targetPoint: Vec3;
  sourceNormalized: Vec3;
  targetNormalized: Vec3;
  relativeRotation: Mat3;
  relativeTranslation: Vec3;
  essentialRaw: Mat3;
  essentialCanonical: Mat3 | null;
  essentialFromF: Mat3 | null;
  fundamentalRaw: Mat3;
  fundamentalCanonical: Mat3 | null;
  fundamentalLine: Vec3 | null;
  fundamentalLineClipped: readonly [Vec3, Vec3] | null;
  reverseLine: Vec3 | null;
  reverseLineClipped: readonly [Vec3, Vec3] | null;
  closestTarget: Pixel | null;
  algebraicResidual: number | null;
  signedDistance: number | null;
  distance: number | null;
  epipoleSource: EpipoleResult | null;
  epipoleTarget: EpipoleResult | null;
  pencil: readonly PencilLine[];
  singularValues: Vec3;
  rank: number;
  baselineLength: number;
  essentialAgreement: number | null;
  normalizedResidual: number | null;
  essentialSingularValues: Vec3;
  translationDirection: Vec3 | null;
  essentialRawNorm: number;
  fundamentalRawNorm: number;
  essentialScaleInvariantError: number | null;
  fundamentalScaleInvariantError: number | null;
  fundamentalCalibrationChange: number | null;
  essentialPoseCalibrationChange: number | null;
  warning: string | null;
}

const scaledCameraControls = (controls: CameraControls, factor: number): CameraControls => ({
  ...controls,
  center: scale3(controls.center, factor),
});

const matrixNorm = (matrix: Mat3): number => Math.hypot(...matrix);

export function deriveConcepts(state: CoreConceptsState): CoreConceptsSnapshot {
  const camera1 = CAMERA_1;
  const camera2 = cameraPoseFromControls(scaledCameraControls(state.camera2, state.baselineScale));
  const sourceK = intrinsicsMatrix(state.intrinsics1);
  const targetK = intrinsicsMatrix(state.intrinsics2);
  const calibrated = calibratedEpipolar(
    { pose: camera1, intrinsics: sourceK },
    { pose: camera2, intrinsics: targetK },
  );
  const reference = calibratedEpipolar(
    { pose: camera1, intrinsics: sourceK },
    { pose: cameraPoseFromControls(state.camera2), intrinsics: targetK },
  );
  const calibrationReference = calibratedEpipolar(
    { pose: camera1, intrinsics: intrinsicsMatrix(DEFAULT_INTRINSICS_1) },
    { pose: camera2, intrinsics: intrinsicsMatrix(DEFAULT_INTRINSICS_2) },
  );
  const sourcePoint: Vec3 = [state.sourcePixel[0], state.sourcePixel[1], 1];
  const targetPoint: Vec3 = [state.targetPixel[0], state.targetPixel[1], 1];
  const fundamental = calibrated.fundamentalCanonical;
  const fundamentalLine = fundamental ? epipolarLine(fundamental, state.sourcePixel) : null;
  const reverseLine = fundamental ? reverseEpipolarLine(fundamental, state.targetPixel) : null;
  const closestTarget = fundamentalLine ? closestPointOnLine(fundamentalLine, state.targetPixel) : null;
  const signedDistance = fundamentalLine
    ? dot3(targetPoint, fundamentalLine) / Math.hypot(fundamentalLine[0], fundamentalLine[1])
    : null;
  const poles = fundamental ? epipoles(fundamental) : null;
  const decomposition = fundamental ? svd3(fundamental) : null;
  const pencil = fundamental
    ? FAMILY_PIXELS.flatMap((source): PencilLine[] => {
      const line = epipolarLine(fundamental, source);
      return line ? [{ source, line, clipped: clipToImage(line, IMAGE_WIDTH, IMAGE_HEIGHT) }] : [];
    })
    : [];
  const essentialFromF = fundamental
    ? essentialFromFundamental(fundamental, sourceK, targetK)
    : null;
  const baselineLength = norm3(calibrated.translation);
  const sourceNormalized = normalizeImagePoint(sourceK, sourcePoint);
  const targetNormalized = normalizeImagePoint(targetK, targetPoint);

  let warning: string | null = null;
  if (calibrated.status === 'degenerate') {
    warning = 'Zero baseline: E and F collapse to zero, so translational epipolar geometry is undefined.';
  } else if (baselineLength < 0.08) {
    warning = 'Near pure rotation: the tiny translation makes epipolar geometry numerically fragile.';
  } else if (!fundamentalLine?.every(Number.isFinite)) {
    warning = 'This point maps to a line at infinity for the current configuration.';
  }

  return {
    state,
    camera1,
    camera2,
    sourceK,
    targetK,
    sourcePoint,
    targetPoint,
    sourceNormalized,
    targetNormalized,
    relativeRotation: calibrated.rotation,
    relativeTranslation: calibrated.translation,
    essentialRaw: calibrated.essentialRaw,
    essentialCanonical: calibrated.essentialCanonical,
    essentialFromF,
    fundamentalRaw: calibrated.fundamentalRaw,
    fundamentalCanonical: fundamental,
    fundamentalLine,
    fundamentalLineClipped: fundamentalLine ? clipToImage(fundamentalLine, IMAGE_WIDTH, IMAGE_HEIGHT) : null,
    reverseLine,
    reverseLineClipped: reverseLine ? clipToImage(reverseLine, IMAGE_WIDTH, IMAGE_HEIGHT) : null,
    closestTarget,
    algebraicResidual: fundamental ? dot3(targetPoint, mat3Vec3(fundamental, sourcePoint)) : null,
    signedDistance,
    distance: fundamentalLine ? pointLineDistance(fundamentalLine, state.targetPixel) : null,
    epipoleSource: poles?.source ?? null,
    epipoleTarget: poles?.target ?? null,
    pencil,
    singularValues: decomposition?.singularValues ?? [0, 0, 0],
    rank: decomposition?.rank ?? 0,
    baselineLength,
    essentialAgreement: essentialFromF
      ? matrixAgreementUpToScale(essentialFromF, calibrated.essentialRaw)
      : null,
    normalizedResidual: calibrated.essentialCanonical
      ? dot3(targetNormalized, mat3Vec3(calibrated.essentialCanonical, sourceNormalized))
      : null,
    essentialSingularValues: calibrated.essentialCanonical
      ? svd3(calibrated.essentialCanonical).singularValues
      : [0, 0, 0],
    translationDirection: normalize3(calibrated.translation),
    essentialRawNorm: matrixNorm(calibrated.essentialRaw),
    fundamentalRawNorm: matrixNorm(calibrated.fundamentalRaw),
    essentialScaleInvariantError: reference.essentialCanonical && calibrated.essentialCanonical
      ? matrixAgreementUpToScale(reference.essentialCanonical, calibrated.essentialCanonical)
      : null,
    fundamentalScaleInvariantError: reference.fundamentalCanonical && calibrated.fundamentalCanonical
      ? matrixAgreementUpToScale(reference.fundamentalCanonical, calibrated.fundamentalCanonical)
      : null,
    fundamentalCalibrationChange: calibrationReference.fundamentalCanonical && calibrated.fundamentalCanonical
      ? matrixAgreementUpToScale(calibrationReference.fundamentalCanonical, calibrated.fundamentalCanonical)
      : null,
    essentialPoseCalibrationChange: calibrationReference.essentialCanonical && calibrated.essentialCanonical
      ? matrixAgreementUpToScale(calibrationReference.essentialCanonical, calibrated.essentialCanonical)
      : null,
    warning,
  };
}

/** One concise observation selected from the learner's most recent action. */
export function noticeForState(state: CoreConceptsState, snapshot: CoreConceptsSnapshot): string {
  if (state.lessonFocus === 'source') {
    return state.section === 'essential'
      ? 'Moving x changes both its pixel measurement and the calibrated ray x̂.'
      : 'Moving x rotates its allowed line l′ in the other image.';
  }
  if (state.lessonFocus === 'target') {
    if (state.section === 'essential') {
      if (snapshot.normalizedResidual === null) return 'The normalized constraint is undefined for this degenerate camera geometry.';
      return 'The normalized constraint error reaches zero only when x and candidate x′ satisfy the epipolar constraint.';
    }
    if (snapshot.distance === null) return 'The point-to-line distance is undefined for this degenerate camera geometry.';
    return 'The constraint error approaches zero as x′ reaches its epipolar line; the pixel distance measures the geometric gap.';
  }
  if (state.lessonFocus === 'pencil' && state.showPencil) {
    return 'Every colored target line passes through the same epipole e′.';
  }
  if (state.lessonFocus === 'calibration') {
    return 'Pixel and normalized coordinates and pixel-space F change, while pose-derived E, R, and t keep the same physical pose.';
  }
  if (state.lessonFocus === 'scale') {
    return 'Increasing the baseline scales raw E and F, while normalized epipolar geometry and translation direction stay the same.';
  }
  if (state.lessonFocus === 'pose' || !matchingPreset(state.camera2)) {
    return state.section === 'essential'
      ? 'The custom Camera 2 pose changes relative R and t, so E and the normalized constraint update with it.'
      : 'The custom Camera 2 pose changes the epipolar planes, lines, and epipoles together.';
  }
  const preset = matchingPreset(state.camera2) ?? state.preset;
  if (state.section === 'essential') {
    if (preset === 'rectified') return 'Identity relative rotation and horizontal translation make E especially simple.';
    if (preset === 'nearRotation') return 'As ‖t‖ approaches zero, E loses its translational epipolar signal.';
    if (preset === 'forward') return 'The translation direction is mainly forward, placing a finite epipole near the direction of travel.';
    return 'Nontrivial relative R and t combine in E = [t]×R.';
  }
  if (preset === 'rectified') return 'Every epipolar line is horizontal and parallel; their common epipole lies at infinity.';
  if (preset === 'nearRotation') return 'As translation becomes tiny, the translational epipolar signal becomes fragile.';
  if (preset === 'forward') return 'Every epipolar line radiates through the visible epipole near the direction of travel.';
  return 'The rotated camera produces oblique lines; their common epipole may sit outside the visible image.';
}

export function snapTargetToLine(snapshot: CoreConceptsSnapshot): Pixel | null {
  if (!snapshot.fundamentalLine || !snapshot.closestTarget) return null;
  return [
    Math.min(IMAGE_WIDTH, Math.max(0, snapshot.closestTarget[0])),
    Math.min(IMAGE_HEIGHT, Math.max(0, snapshot.closestTarget[1])),
  ];
}

export const matrixFrobeniusNorm = matrixNorm;

export type ConceptsListener = (state: CoreConceptsState, snapshot: CoreConceptsSnapshot) => void;

/** Small page-local store; the app shell keeps the owning page instance alive between tabs. */
export class CoreConceptsStore {
  private state: CoreConceptsState;
  private readonly listeners = new Set<ConceptsListener>();

  constructor(initial: CoreConceptsState = DEFAULT_CONCEPTS_STATE) {
    this.state = structuredClone(initial);
  }

  getState(): CoreConceptsState {
    return this.state;
  }

  snapshot(): CoreConceptsSnapshot {
    return deriveConcepts(this.state);
  }

  update(patch: Partial<CoreConceptsState>): void {
    this.state = { ...this.state, ...patch };
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(this.state, snapshot));
  }

  applyPreset(preset: ConceptPreset): void {
    this.update({ preset, camera2: structuredClone(CONCEPT_PRESETS[preset]), baselineScale: 1, lessonFocus: 'preset' });
  }

  subscribe(listener: ConceptsListener): () => void {
    this.listeners.add(listener);
    listener(this.state, this.snapshot());
    return () => this.listeners.delete(listener);
  }
}
