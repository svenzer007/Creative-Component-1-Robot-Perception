import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PageModule } from './page';
import { HashRouter, findRoute, hashToPath, type RouteDefinition } from './router';

const load = (): Promise<PageModule> => Promise.reject(new Error('not loaded in tests'));
const ROUTES: RouteDefinition[] = [
  { id: 'lab', path: '/lab', label: '3D lab', title: 'Lab', load },
  { id: 'photos', path: '/photos', label: 'Photo lab', title: 'Photos', load },
];

describe('hash paths', () => {
  it('normalizes empty, slashed, and decorated hashes', () => {
    expect(hashToPath('')).toBe('/');
    expect(hashToPath('#')).toBe('/');
    expect(hashToPath('#/')).toBe('/');
    expect(hashToPath('#/photos')).toBe('/photos');
    expect(hashToPath('#photos')).toBe('/photos');
    expect(hashToPath('#/photos/')).toBe('/photos');
    expect(hashToPath('#/photos?view=2')).toBe('/photos');
  });

  it('matches routes case-insensitively', () => {
    expect(findRoute(ROUTES, '/PHOTOS')?.id).toBe('photos');
    expect(findRoute(ROUTES, '/nope')).toBeNull();
  });
});

describe('HashRouter', () => {
  let stop: (() => void) | null = null;
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    stop?.();
    stop = null;
  });

  it('opens the fallback route and canonicalizes an empty hash', () => {
    const seen: string[] = [];
    stop = new HashRouter(ROUTES, 'lab').start((route) => seen.push(route.id));
    expect(seen).toEqual(['lab']);
    expect(window.location.hash).toBe('#/lab');
  });

  it('redirects unknown paths to the fallback without a new history entry', () => {
    window.history.replaceState(null, '', '/#/does-not-exist');
    const length = window.history.length;
    const router = new HashRouter(ROUTES, 'lab');
    stop = router.start();
    expect(router.route?.id).toBe('lab');
    expect(window.location.hash).toBe('#/lab');
    expect(window.history.length).toBe(length);
  });

  it('follows deep links and later hash changes, reporting the previous route', async () => {
    window.history.replaceState(null, '', '/#/photos');
    const seen: string[] = [];
    const router = new HashRouter(ROUTES, 'lab');
    stop = router.start((route, previous) => seen.push(`${previous?.id ?? 'none'}→${route.id}`));
    router.navigate('lab');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toEqual(['none→photos', 'photos→lab']);
    expect(router.href('photos')).toBe('#/photos');
  });

  it('rejects an unknown fallback', () => {
    expect(() => new HashRouter(ROUTES, 'missing')).toThrow();
  });
});
