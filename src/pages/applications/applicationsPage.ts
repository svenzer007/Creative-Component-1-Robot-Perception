import type { Page } from '../../app/page';
import { pauseScenes, renderApplications, resumeScenes } from '../../ui/applications';

/** The Applications tab: real-world systems that rely on epipolar geometry. */
class ApplicationsPage implements Page {
  mount(container: HTMLElement): void {
    container.classList.add('applications-page');
    const inner = document.createElement('div');
    inner.className = 'applications-shell';
    container.append(inner);
    renderApplications(inner);
  }

  activate(): void {
    resumeScenes();
  }

  deactivate(): void {
    pauseScenes();
  }
}

export function createPage(): Page {
  return new ApplicationsPage();
}
