import { describe, expect, it } from 'vitest';
import { dot3, mat3Vec3, norm3, transpose3 } from '../../math/linearAlgebra';
import {
  CONCEPT_PRESETS,
  CoreConceptsStore,
  DEFAULT_CONCEPTS_STATE,
  deriveConcepts,
  intrinsicsMatrix,
  snapTargetToLine,
} from './model';
import { epipoleMarker } from './views';

describe('Core Concepts local state', () => {
  it('keeps interaction state in the page-owned store', () => {
    const store = new CoreConceptsStore();
    store.update({ section: 'essential', sourcePixel: [120, 90] });
    expect(store.getState().section).toBe('essential');
    expect(store.getState().sourcePixel).toEqual([120, 90]);
    expect(DEFAULT_CONCEPTS_STATE.section).toBe('fundamental');
  });

  it('applies shared Lab preset values and resets baseline scale', () => {
    const store = new CoreConceptsStore();
    store.update({ baselineScale: 2.2 });
    store.applyPreset('rectified');
    expect(store.getState().camera2.center).toEqual([1.8, 0, 0]);
    expect(store.getState().baselineScale).toBe(1);
  });

  it('constructs a zero-skew intrinsic matrix', () => {
    expect(intrinsicsMatrix({ fx: 500, fy: 510, cx: 320, cy: 210 })).toEqual([
      500, 0, 320,
      0, 510, 210,
      0, 0, 1,
    ]);
  });

  it('maps x to a target line and snaps x prime onto it', () => {
    const store = new CoreConceptsStore();
    const before = store.snapshot();
    expect(before.rank).toBe(2);
    expect(before.fundamentalLine).not.toBeNull();
    expect(before.distance).toBeGreaterThan(1);
    const snapped = snapTargetToLine(before)!;
    store.update({ targetPixel: snapped });
    const after = store.snapshot();
    expect(after.distance).toBeLessThan(1e-9);
    expect(Math.abs(after.algebraicResidual!)).toBeLessThan(1e-9);
  });

  it('computes consistent forward and reverse epipolar lines', () => {
    const snapshot = deriveConcepts(DEFAULT_CONCEPTS_STATE);
    const forwardResidual = dot3(
      snapshot.targetPoint,
      mat3Vec3(snapshot.fundamentalCanonical!, snapshot.sourcePoint),
    );
    const reverseResidual = dot3(
      snapshot.sourcePoint,
      mat3Vec3(transpose3(snapshot.fundamentalCanonical!), snapshot.targetPoint),
    );
    expect(Math.abs(forwardResidual)).toBeGreaterThan(0);
    expect(reverseResidual).toBeCloseTo(forwardResidual, 12);
  });

  it('makes every pencil line pass through the target epipole', () => {
    const snapshot = deriveConcepts({ ...structuredClone(DEFAULT_CONCEPTS_STATE), showPencil: true });
    expect(snapshot.pencil).toHaveLength(4);
    snapshot.pencil.forEach(({ line }) => {
      expect(Math.abs(dot3(snapshot.epipoleTarget!.homogeneous, line))).toBeLessThan(1e-8);
    });
    expect(norm3(mat3Vec3(snapshot.fundamentalCanonical!, snapshot.epipoleSource!.homogeneous))).toBeLessThan(1e-9);
    expect(norm3(mat3Vec3(transpose3(snapshot.fundamentalCanonical!), snapshot.epipoleTarget!.homogeneous))).toBeLessThan(1e-9);
  });

  it('produces horizontal lines and an epipole at infinity for rectified stereo', () => {
    const state = structuredClone(DEFAULT_CONCEPTS_STATE);
    state.camera2 = structuredClone(CONCEPT_PRESETS.rectified);
    state.preset = 'rectified';
    const snapshot = deriveConcepts(state);
    expect(Math.abs(snapshot.fundamentalLine![0])).toBeLessThan(1e-12);
    expect(Math.abs(snapshot.fundamentalLine![1])).toBeGreaterThan(0.99);
    expect(snapshot.epipoleTarget?.finite).toBe(false);
    expect(epipoleMarker(snapshot.epipoleTarget)?.infinite).toBe(true);
  });

  it('keeps the forward preset finite and marks off-panel epipoles safely', () => {
    const state = structuredClone(DEFAULT_CONCEPTS_STATE);
    state.camera2 = structuredClone(CONCEPT_PRESETS.forward);
    state.preset = 'forward';
    const snapshot = deriveConcepts(state);
    expect(snapshot.rank).toBe(2);
    expect(snapshot.epipoleTarget?.finite).toBe(true);
    expect(epipoleMarker(snapshot.epipoleTarget)).not.toBeNull();
  });

  it('handles exact and near-zero baselines without invalid geometry', () => {
    const zero = structuredClone(DEFAULT_CONCEPTS_STATE);
    zero.camera2.center = [0, 0, 0];
    const degenerate = deriveConcepts(zero);
    expect(degenerate.rank).toBe(0);
    expect(degenerate.fundamentalCanonical).toBeNull();
    expect(degenerate.fundamentalLine).toBeNull();
    expect(degenerate.warning).toContain('Zero baseline');

    const near = structuredClone(DEFAULT_CONCEPTS_STATE);
    near.camera2 = structuredClone(CONCEPT_PRESETS.nearRotation);
    const fragile = deriveConcepts(near);
    expect(fragile.rank).toBe(2);
    expect(fragile.warning).toContain('Near pure rotation');
  });

  it('bridges F and E and preserves the normalized epipolar constraint', () => {
    const store = new CoreConceptsStore();
    store.update({ targetPixel: snapTargetToLine(store.snapshot())! });
    const snapshot = store.snapshot();
    expect(snapshot.essentialAgreement).not.toBeNull();
    expect(snapshot.essentialAgreement!).toBeLessThan(1e-12);
    expect(Math.abs(snapshot.normalizedResidual!)).toBeLessThan(1e-11);
    expect(snapshot.essentialSingularValues[0]).toBeCloseTo(snapshot.essentialSingularValues[1], 11);
    expect(snapshot.essentialSingularValues[2]).toBeLessThan(1e-12);
  });

  it('scales raw matrices but preserves canonical geometry and translation direction', () => {
    const one = deriveConcepts(DEFAULT_CONCEPTS_STATE);
    const state = structuredClone(DEFAULT_CONCEPTS_STATE);
    state.baselineScale = 2.25;
    const scaled = deriveConcepts(state);
    expect(scaled.essentialRawNorm / one.essentialRawNorm).toBeCloseTo(2.25, 12);
    expect(scaled.fundamentalRawNorm / one.fundamentalRawNorm).toBeCloseTo(2.25, 12);
    expect(scaled.essentialScaleInvariantError).toBeLessThan(1e-12);
    expect(scaled.fundamentalScaleInvariantError).toBeLessThan(1e-12);
    scaled.translationDirection!.forEach((value, index) => {
      expect(value).toBeCloseTo(one.translationDirection![index], 12);
    });
    scaled.fundamentalLine!.forEach((value, index) => {
      expect(value).toBeCloseTo(one.fundamentalLine![index], 12);
    });
  });

  it('updates normalized coordinates when intrinsics change', () => {
    const first = deriveConcepts(DEFAULT_CONCEPTS_STATE);
    const state = structuredClone(DEFAULT_CONCEPTS_STATE);
    state.intrinsics1.fx = 800;
    state.intrinsics1.cx = 280;
    const changed = deriveConcepts(state);
    expect(changed.sourceNormalized).not.toEqual(first.sourceNormalized);
    expect(changed.sourceNormalized[0]).toBeCloseTo((state.sourcePixel[0] - 280) / 800, 12);
    expect(changed.fundamentalCanonical).not.toEqual(first.fundamentalCanonical);
  });
});
