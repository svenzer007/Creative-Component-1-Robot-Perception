import type { Pixel } from '../../vision/geometry2d';

export const clampPixel = (point: Pixel, width: number, height: number): Pixel => [
  Math.min(width, Math.max(0, point[0])),
  Math.min(height, Math.max(0, point[1])),
];

/** Maps a pointer from CSS pixels into a top-left-origin SVG image coordinate system. */
export function clientToImagePixel(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  width: number,
  height: number,
): Pixel {
  if (bounds.width <= 0 || bounds.height <= 0) return [0, 0];
  return clampPixel([
    (clientX - bounds.left) * width / bounds.width,
    (clientY - bounds.top) * height / bounds.height,
  ], width, height);
}

