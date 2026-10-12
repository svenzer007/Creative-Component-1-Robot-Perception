import type { CameraControls, Mat3 } from '../../types';
import type { Pixel } from '../../vision/geometry2d';
import { PRESETS } from '../../state/appState';

export type ConceptSection = 'fundamental' | 'essential';
export type ConceptPreset = 'general' | 'rectified' | 'forward' | 'nearRotation';

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
}

export const IMAGE_WIDTH = 640;
export const IMAGE_HEIGHT = 420;

export const CONCEPT_PRESETS: Record<ConceptPreset, CameraControls> = {
  general: PRESETS.general,
  rectified: PRESETS.rectified,
  forward: PRESETS.forward,
  nearRotation: PRESETS.rotation,
};

export const DEFAULT_CONCEPTS_STATE: CoreConceptsState = {
  section: 'fundamental',
  preset: 'general',
  camera2: structuredClone(CONCEPT_PRESETS.general),
  sourcePixel: [248, 166],
  targetPixel: [404, 238],
  intrinsics1: { fx: 520, fy: 520, cx: 320, cy: 210 },
  intrinsics2: { fx: 560, fy: 560, cx: 320, cy: 210 },
  baselineScale: 1,
  showPencil: false,
  showAdvancedGeometry: false,
};

export const intrinsicsMatrix = (controls: IntrinsicsControls): Mat3 => [
  controls.fx, 0, controls.cx,
  0, controls.fy, controls.cy,
  0, 0, 1,
];

export type ConceptsListener = (state: CoreConceptsState) => void;

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

  update(patch: Partial<CoreConceptsState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener(this.state));
  }

  applyPreset(preset: ConceptPreset): void {
    this.update({ preset, camera2: structuredClone(CONCEPT_PRESETS[preset]), baselineScale: 1 });
  }

  subscribe(listener: ConceptsListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
}

