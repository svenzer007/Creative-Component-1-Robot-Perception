export const IMAGE_MIN = -0.8;
export const IMAGE_MAX = 0.8;

export interface NormalizedPoint {
  u: number;
  v: number;
}

export interface RectangleLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

/** Maps a pointer position to normalized coordinates; SVG/screen Y is inverted. */
export function pointerToNormalized(
  clientX: number,
  clientY: number,
  rectangle: RectangleLike,
  viewMinimum = -1.25,
  viewMaximum = 1.25,
  allowedMinimum = IMAGE_MIN,
  allowedMaximum = IMAGE_MAX,
): NormalizedPoint {
  const xRatio = clamp((clientX - rectangle.left) / rectangle.width, 0, 1);
  const yRatio = clamp((clientY - rectangle.top) / rectangle.height, 0, 1);
  return {
    u: clamp(viewMinimum + xRatio * (viewMaximum - viewMinimum), allowedMinimum, allowedMaximum),
    v: clamp(viewMaximum - yRatio * (viewMaximum - viewMinimum), allowedMinimum, allowedMaximum),
  };
}
