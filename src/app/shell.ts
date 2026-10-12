import type { Page } from './page';
import type { HashRouter, RouteDefinition } from './router';

interface MountedPage {
  container: HTMLElement;
  page: Page | null;
  ready: Promise<void>;
}

const BRAND_MARK = `
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" class="app-brand-mark">
    <rect x="1.5" y="5.5" width="11" height="11" rx="2.5" fill="none" stroke="#52d6ff" stroke-width="1.6"/>
    <rect x="17.5" y="13.5" width="11" height="11" rx="2.5" fill="none" stroke="#ffb84d" stroke-width="1.6"/>
    <path d="M7 11 23 19" stroke="#8cffb5" stroke-width="1.6"/>
    <circle cx="7" cy="11" r="2.2" fill="#52d6ff"/><circle cx="23" cy="19" r="2.2" fill="#ffb84d"/>
  </svg>`;

/**
 * Application frame: a sticky bar with one link per route and a container per page. Pages are
 * downloaded and mounted on first visit, then kept alive and only hidden, so a half-finished
 * construction in one tab is still there when you come back.
 */
export class AppShell {
  private readonly pagesHost: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly indicator: HTMLElement;
  private readonly links = new Map<string, HTMLAnchorElement>();
  private readonly pages = new Map<string, MountedPage>();
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private activeId: string | null = null;
  private generation = 0;

  constructor(root: HTMLElement, routes: readonly RouteDefinition[], router: HashRouter) {
    root.innerHTML = `
      <header class="app-bar">
        <div class="app-bar-inner">
          <a class="app-brand" href="${router.href(routes[0].id)}">
            ${BRAND_MARK}
            <span>Epipolar Lab<small>NYU Robot Perception</small></span>
          </a>
          <nav class="app-tabs" aria-label="Labs"><span class="app-tab-indicator" aria-hidden="true"></span></nav>
        </div>
      </header>
      <div class="app-pages"></div>
    `;
    this.pagesHost = root.querySelector<HTMLElement>('.app-pages')!;
    this.tabs = root.querySelector<HTMLElement>('.app-tabs')!;
    this.indicator = root.querySelector<HTMLElement>('.app-tab-indicator')!;
    routes.forEach((route) => {
      const link = document.createElement('a');
      link.className = 'app-tab';
      link.href = router.href(route.id);
      link.textContent = route.label;
      link.dataset.route = route.id;
      this.tabs.append(link);
      this.links.set(route.id, link);
    });
    new ResizeObserver(() => this.placeIndicator()).observe(this.tabs);
    void document.fonts?.ready.then(() => this.placeIndicator());
  }

  /** Opens a route: marks its tab, mounts the page on first visit, and swaps visibility. */
  async show(route: RouteDefinition, options: { userInitiated: boolean }): Promise<void> {
    const generation = ++this.generation;
    const previousId = this.activeId;
    this.activeId = route.id;
    document.title = route.title;
    this.links.forEach((link, id) => {
      if (id === route.id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    this.placeIndicator();

    const entry = this.ensurePage(route);
    if (previousId && previousId !== route.id) this.pages.get(previousId)?.page?.deactivate();
    this.swapVisibility(route.id, options.userInitiated && previousId !== null);
    if (options.userInitiated) {
      window.scrollTo({ top: 0 });
      entry.container.focus({ preventScroll: true });
    }

    try {
      await entry.ready;
    } catch {
      return;
    }
    if (generation === this.generation && this.activeId === route.id) entry.page?.activate();
  }

  private ensurePage(route: RouteDefinition): MountedPage {
    const existing = this.pages.get(route.id);
    if (existing) return existing;
    const container = document.createElement('section');
    container.className = 'app-page';
    container.dataset.route = route.id;
    container.tabIndex = -1;
    container.hidden = true;
    container.setAttribute('aria-label', route.label);
    container.innerHTML = '<div class="app-page-status" role="status"><span class="app-spinner" aria-hidden="true"></span>Loading…</div>';
    this.pagesHost.append(container);
    const entry: MountedPage = { container, page: null, ready: Promise.resolve() };
    entry.ready = this.mountPage(route, entry);
    this.pages.set(route.id, entry);
    return entry;
  }

  private async mountPage(route: RouteDefinition, entry: MountedPage): Promise<void> {
    try {
      const module = await route.load();
      const page = module.createPage();
      entry.container.replaceChildren();
      await page.mount(entry.container);
      entry.page = page;
    } catch (error) {
      this.showLoadError(route, entry, error);
      throw error;
    }
  }

  private showLoadError(route: RouteDefinition, entry: MountedPage, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    entry.container.innerHTML = `
      <div class="app-page-status app-page-error" role="alert">
        <strong>${route.label} couldn't load.</strong>
        <span>Check your connection, then try again.</span>
        <button type="button" class="primary-button">Try again</button>
        <small></small>
      </div>`;
    entry.container.querySelector('small')!.textContent = message;
    entry.container.querySelector('button')!.addEventListener('click', () => {
      this.pages.delete(route.id);
      entry.container.remove();
      void this.show(route, { userInitiated: false });
    });
  }

  private swapVisibility(activeId: string, animate: boolean): void {
    const apply = (): void => {
      this.pages.forEach((entry, id) => {
        entry.container.hidden = id !== activeId;
      });
    };
    const transition = (document as Document & { startViewTransition?: (callback: () => void) => unknown }).startViewTransition;
    if (animate && transition && !this.reducedMotion.matches) transition.call(document, apply);
    else apply();
  }

  private placeIndicator(): void {
    const link = this.activeId ? this.links.get(this.activeId) : null;
    if (!link) return;
    this.indicator.style.transform = `translateX(${link.offsetLeft}px)`;
    this.indicator.style.width = `${link.offsetWidth}px`;
    this.indicator.classList.add('is-ready');
  }
}
