import { describe, expect, it } from 'vitest';
import { imageFilesFrom, isLikelyHeic, scaledSize } from './imageSources';

describe('image sources', () => {
  it('caps the long side and keeps the aspect ratio', () => {
    expect(scaledSize(4032, 3024, 1280)).toEqual({ width: 1280, height: 960 });
    expect(scaledSize(3024, 4032, 1280)).toEqual({ width: 960, height: 1280 });
    expect(scaledSize(800, 600, 1280)).toEqual({ width: 800, height: 600 });
  });

  it('recognizes HEIC photos by type or extension', () => {
    expect(isLikelyHeic({ name: 'IMG_0001.HEIC', type: '' })).toBe(true);
    expect(isLikelyHeic({ name: 'x', type: 'image/heif' })).toBe(true);
    expect(isLikelyHeic({ name: 'x.jpg', type: 'image/jpeg' })).toBe(false);
  });

  it('keeps only image files from a drop or picker', () => {
    const files = [
      new File(['a'], 'room.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'notes.txt', { type: 'text/plain' }),
      new File(['c'], 'IMG_2.heic', { type: '' }),
    ];
    expect(imageFilesFrom(files).map((file) => file.name)).toEqual(['room.jpg', 'IMG_2.heic']);
    expect(imageFilesFrom(null)).toEqual([]);
  });
});
