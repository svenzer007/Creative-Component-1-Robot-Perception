import type { Page } from '../../app/page';

export function createPage(): Page {
  return {
    mount(container) {
      container.innerHTML = '<main><h1>Photo lab</h1></main>';
    },
    activate() {},
    deactivate() {},
  };
}
