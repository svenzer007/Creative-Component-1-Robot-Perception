import { describe, expect, it } from 'vitest';
import { AppStore } from '../state/appState';
import { pointerToNormalized } from './coordinates';

const rectangle = { left: 100, top: 50, width: 500, height: 500 };

describe('direct point manipulation', () => {
  it('maps the panel center to the normalized origin', () => {
    expect(pointerToNormalized(350, 300, rectangle)).toEqual({ u: 0, v: 0 });
  });

  it('inverts screen Y and clamps to slider bounds', () => {
    expect(pointerToNormalized(100, 50, rectangle)).toEqual({ u: -0.8, v: 0.8 });
    expect(pointerToNormalized(600, 550, rectangle)).toEqual({ u: 0.8, v: -0.8 });
    const upper = pointerToNormalized(350, 150, rectangle);
    expect(upper.v).toBeGreaterThan(0);
  });

  it('updates x and all derived geometry through the shared store', () => {
    const store = new AppStore();
    const oldPlane = store.snapshot().ray.plane!.normal;
    store.setImagePoint(-0.4, 0.55);
    const snapshot = store.snapshot();
    expect(snapshot.x).toEqual([-0.4, 0.55, 1]);
    expect(snapshot.ray.plane!.normal).not.toEqual(oldPlane);
    expect(snapshot.ray.agreementError!).toBeLessThan(1e-9);
    expect(Math.abs(snapshot.residual!)).toBeLessThan(1e-9);
  });
});
