/**
 * Turning files, clipboard images, and camera frames into pixels. Everything stays in memory:
 * nothing is uploaded or written to storage, and pixels are dropped when the scene changes.
 */

/** Long-side cap for analysis and display; keeps feature detection near a second per photo. */
export const MAX_IMAGE_SIZE = 1280;

export interface DecodedImage {
  name: string;
  width: number;
  height: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

export class ImageDecodeError extends Error {}

export function scaledSize(width: number, height: number, maxSize = MAX_IMAGE_SIZE): { width: number; height: number } {
  const scale = Math.min(1, maxSize / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export const isLikelyHeic = (file: { name: string; type: string }): boolean =>
  /hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);

export const isImageFile = (file: { name: string; type: string }): boolean =>
  file.type.startsWith('image/') || isLikelyHeic(file) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name);

export function imageFilesFrom(list: FileList | readonly File[] | null | undefined): File[] {
  return list ? Array.from(list).filter(isImageFile) : [];
}

/** Draws any image source into a canvas at most `maxSize` on its long side and reads the pixels. */
export function rasterize(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  name: string,
  maxSize = MAX_IMAGE_SIZE,
): DecodedImage {
  const { width, height } = scaledSize(sourceWidth, sourceHeight, maxSize);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new ImageDecodeError('This browser could not create a drawing surface.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  return { name, width, height, rgba: context.getImageData(0, 0, width, height).data };
}

/** Decodes a photo, honoring its EXIF orientation so phone pictures appear upright. */
export async function decodeImageFile(file: File, maxSize = MAX_IMAGE_SIZE): Promise<DecodedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    if (isLikelyHeic(file)) {
      throw new ImageDecodeError(`${file.name} is a HEIC photo, which this browser can't open. Export it as JPEG, or open this page in Safari.`);
    }
    throw new ImageDecodeError(`${file.name} couldn't be opened as an image.`);
  }
  try {
    return rasterize(bitmap, bitmap.width, bitmap.height, file.name, maxSize);
  } finally {
    bitmap.close();
  }
}

/** Downscaled copy for quick checks, such as the camera's live parallax meter. */
export function shrink(image: DecodedImage, maxSize: number): DecodedImage {
  if (Math.max(image.width, image.height) <= maxSize) return image;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
  return rasterize(canvas, image.width, image.height, image.name, maxSize);
}
