import { describe, expect, it } from 'vitest';
import type { Mat3 } from '../../types';
import { fundamentalDifference, fundamentalFromCameras } from '../../vision/fundamental';
import { GENERAL_PAIR, correspondences, visiblePoints } from '../../vision/testScenes';
import {
  clientToImage,
  fitManualPair,
  fundamentalBetween,
  manualCorrespondences,
  nextPinColor,
  PIN_COLORS,
  type ManualMatch,
  type Pin,
} from './model';

describe('Photo lab model', () => {
  it('looks up F in either direction, transposing the reverse pair', () => {
    const f: Mat3 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const models = [{ source: 0, target: 1, fundamental: f }];
    expect(fundamentalBetween(models, 0, 1)).toEqual(f);
    expect(fundamentalBetween(models, 1, 0)).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9]);
    expect(fundamentalBetween(models, 0, 2)).toBeNull();
  });

  it('maps client coordinates to image pixels and clamps to the image', () => {
    const box = { left: 100, top: 50, width: 400, height: 300 };
    expect(clientToImage(300, 200, box, 800, 600)).toEqual([400, 300]);
    expect(clientToImage(90, 40, box, 800, 600)).toEqual([0, 0]);
    expect(clientToImage(900, 900, box, 800, 600)).toEqual([800, 600]);
  });

  it('hands out unused pin colors first', () => {
    const pin = (color: string): Pin => ({ id: 1, view: 0, x: 0, y: 0, color, match: null });
    expect(nextPinColor([])).toBe(PIN_COLORS[0]);
    expect(nextPinColor([pin(PIN_COLORS[0]), pin(PIN_COLORS[2])])).toBe(PIN_COLORS[1]);
  });

  it('orients hand-marked matches from source to target', () => {
    const matches: ManualMatch[] = [
      { id: 1, first: { view: 0, x: 1, y: 2 }, second: { view: 1, x: 3, y: 4 } },
      { id: 2, first: { view: 1, x: 5, y: 6 }, second: { view: 0, x: 7, y: 8 } },
      { id: 3, first: { view: 0, x: 9, y: 9 }, second: { view: 2, x: 9, y: 9 } },
    ];
    expect(manualCorrespondences(matches, 0, 1)).toEqual([[1, 2, 3, 4], [7, 8, 5, 6]]);
    expect(manualCorrespondences(matches, 1, 0)).toEqual([[3, 4, 1, 2], [5, 6, 7, 8]]);
  });

  it('fits F through eight or more clicks and reports each click’s residual', () => {
    const { source, target } = GENERAL_PAIR;
    const clicks = correspondences(source, target, visiblePoints([source, target], 10, 7), 2, 5);
    const matches: ManualMatch[] = clicks.map(([x1, y1, x2, y2], index) => ({
      id: index,
      first: { view: 0, x: x1, y: y1 },
      second: { view: 1, x: x2, y: y2 },
    }));
    const fit = fitManualPair(matches, 0, 1);
    expect(fit.count).toBe(10);
    expect(fit.residuals).toHaveLength(10);
    expect(fit.rms!).toBeLessThan(1.5);
    expect(fundamentalDifference(fit.fundamental!, fundamentalFromCameras(source, target))).toBeLessThan(0.2);
    expect(fitManualPair(matches.slice(0, 7), 0, 1).fundamental).toBeNull();
  });
});
