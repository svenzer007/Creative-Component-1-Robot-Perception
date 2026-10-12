import type { PageModule } from './page';

export interface RouteDefinition {
  id: string;
  /** Hash path such as '/photos'; the URL reads …/#/photos. */
  path: string;
  /** Short tab label. */
  label: string;
  /** Document title while the route is open. */
  title: string;
  load: () => Promise<PageModule>;
}

export type RouteListener = (route: RouteDefinition, previous: RouteDefinition | null) => void;

/** '#/photos?x=1' → '/photos'; '', '#', and '#/' → '/'. Tolerates a missing leading slash. */
export function hashToPath(hash: string): string {
  const raw = hash.replace(/^#/, '').split(/[?#]/)[0].trim();
  if (!raw || raw === '/') return '/';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
}

export function findRoute(routes: readonly RouteDefinition[], path: string): RouteDefinition | null {
  const lower = path.toLowerCase();
  return routes.find((route) => route.path.toLowerCase() === lower) ?? null;
}

/**
 * Hash-based routing. GitHub Pages serves static files with no single-page-app fallback, so
 * paths after '#' are the only client routes that survive refreshes and deep links.
 */
export class HashRouter {
  private readonly listeners = new Set<RouteListener>();
  private current: RouteDefinition | null = null;

  constructor(
    private readonly routes: readonly RouteDefinition[],
    private readonly fallbackId: string,
    private readonly view: Window = window,
  ) {
    if (!routes.some((route) => route.id === fallbackId)) throw new Error(`Unknown fallback route: ${fallbackId}`);
  }

  get route(): RouteDefinition | null {
    return this.current;
  }

  href(id: string): string {
    const route = this.routes.find((candidate) => candidate.id === id);
    if (!route) throw new Error(`Unknown route: ${id}`);
    return `#${route.path}`;
  }

  navigate(id: string): void {
    const target = this.href(id);
    if (this.view.location.hash === target) return;
    this.view.location.hash = target;
  }

  /** Resolves the current URL, notifies listeners, and follows later hash changes. */
  start(listener?: RouteListener): () => void {
    if (listener) this.listeners.add(listener);
    this.view.addEventListener('hashchange', this.sync);
    this.sync();
    return () => {
      if (listener) this.listeners.delete(listener);
      this.view.removeEventListener('hashchange', this.sync);
    };
  }

  private readonly sync = (): void => {
    const path = hashToPath(this.view.location.hash);
    const match = findRoute(this.routes, path);
    const route = match ?? this.routes.find((candidate) => candidate.id === this.fallbackId)!;
    if (!match || `#${route.path}` !== this.view.location.hash) {
      // Canonicalize empty or unknown hashes without adding a history entry.
      const url = new URL(this.view.location.href);
      url.hash = route.path;
      this.view.history.replaceState(this.view.history.state, '', url);
    }
    if (route === this.current) return;
    const previous = this.current;
    this.current = route;
    this.listeners.forEach((notify) => notify(route, previous));
  };
}
