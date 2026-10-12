/**
 * A top-level tab. Pages are created lazily on first visit and then kept alive, so their state
 * survives tab switches; they must stop animation loops and media streams while hidden.
 */
export interface Page {
  /** Builds the page inside its container. Called once, the first time its route opens. */
  mount(container: HTMLElement): void | Promise<void>;
  /** The page became visible. */
  activate(): void;
  /** The page is about to be hidden. */
  deactivate(): void;
}

export interface PageModule {
  createPage(): Page;
}
