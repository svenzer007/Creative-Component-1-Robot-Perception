import type { RouteDefinition } from './router';

/**
 * Every top-level tab. Adding a lab means adding one entry here plus a module under src/pages
 * that exports createPage(); the module is downloaded the first time its tab opens.
 */
export const ROUTES: readonly RouteDefinition[] = [
  {
    id: 'lab',
    path: '/lab',
    label: '3D lab',
    title: 'Epipolar Geometry Lab',
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

/** The 3D lab stays the landing page, so existing links and the presentation flow keep working. */
export const DEFAULT_ROUTE_ID = 'lab';
