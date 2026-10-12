import { describe, expect, it } from 'vitest';
import { CoreConceptsStore, DEFAULT_CONCEPTS_STATE, intrinsicsMatrix } from './model';

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
});
