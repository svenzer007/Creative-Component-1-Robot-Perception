import { describe, expect, it } from 'vitest';
import { clampPixel, clientToImagePixel } from './coordinates';

describe('Core Concepts image coordinates', () => {
  it('maps client coordinates into the image domain with image y pointing down', () => {
    const bounds = { left: 100, top: 50, width: 320, height: 210 };
    expect(clientToImagePixel(260, 155, bounds, 640, 420)).toEqual([320, 210]);
    expect(clientToImagePixel(100, 50, bounds, 640, 420)).toEqual([0, 0]);
  });

  it('clamps pointer positions to the image', () => {
    expect(clampPixel([-10, 500], 640, 420)).toEqual([0, 420]);
    expect(clientToImagePixel(900, -30, { left: 0, top: 0, width: 640, height: 420 }, 640, 420))
      .toEqual([640, 0]);
  });
});

