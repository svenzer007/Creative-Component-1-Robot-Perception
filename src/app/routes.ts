import type { RouteDefinition } from './router';

/**
 * Every top-level tab. Adding a lab means adding one entry here plus a module under src/pages
 * that exports createPage(); the module is downloaded the first time its tab opens.
 */
export const ROUTES: readonly RouteDefinition[] = [
  {
    id: 'home',
    path: '/home',
    label: 'Home',
    title: 'Epipolar Geometry Lab',
    load: () => import('../pages/home/homePage'),
  },
  {
    id: 'intro',
    path: '/intro',
    label: '2-minute intro',
    title: '2-minute intro · Epipolar Geometry Lab',
    load: () => import('../pages/intro/introPage'),
  },
  {
    id: 'lab',
    path: '/lab',
    label: '3D lab',
    title: '3D lab · Epipolar Geometry Lab',
    load: () => import('../pages/lab/labPage'),
  },
  {
    id: 'concepts',
    path: '/concepts',
    label: 'Core concepts',
    title: 'Core Concepts · Epipolar Geometry Lab',
    load: () => import('../pages/concepts/conceptsPage'),
  },
  {
    id: 'photos',
    path: '/photos',
    label: 'Photo lab',
    title: 'Photo lab · Epipolar Geometry Lab',
    load: () => import('../pages/photos/photoPage'),
  },
  {
    id: 'applications',
    path: '/applications',
    label: 'Applications',
    title: 'Applications · Epipolar Geometry Lab',
    load: () => import('../pages/applications/applicationsPage'),
  },
];

/** Home is the landing page: the bare URL and unknown paths open it. Links such as #/lab keep working. */
export const DEFAULT_ROUTE_ID = 'home';
