import './concepts.css';
import type { Page } from '../../app/page';
import { CoreConceptsStore, type ConceptSection } from './model';

const MARKUP = `
  <main class="concepts-shell">
    <header class="concepts-hero">
      <div>
        <p class="concepts-kicker">Core concepts · calibrated two-view geometry</p>
        <h1>Make the matrix <span>move.</span></h1>
        <p>Manipulate image evidence first. Let the algebra explain what you observe.</p>
      </div>
      <nav class="concepts-switch" aria-label="Core concept">
        <button type="button" data-section="fundamental" aria-pressed="true">Fundamental matrix</button>
        <button type="button" data-section="essential" aria-pressed="false">Essential matrix</button>
      </nav>
    </header>
    <section class="concepts-stage" aria-live="polite">
      <p class="concepts-stage-label">Interactive playground</p>
      <h2 data-stage-title>Fundamental matrix</h2>
      <p data-stage-copy>Drag an image point and watch its possible correspondence collapse to a line.</p>
    </section>
  </main>`;

class ConceptsPage implements Page {
  private readonly store = new CoreConceptsStore();

  mount(container: HTMLElement): void {
    container.classList.add('concepts-page');
    container.innerHTML = MARKUP;
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-section]')];
    const title = container.querySelector<HTMLElement>('[data-stage-title]')!;
    const copy = container.querySelector<HTMLElement>('[data-stage-copy]')!;
    buttons.forEach((button) => button.addEventListener('click', () => {
      this.store.update({ section: button.dataset.section as ConceptSection });
    }));
    this.store.subscribe((state) => {
      buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.section === state.section)));
      const essential = state.section === 'essential';
      title.textContent = essential ? 'Essential matrix' : 'Fundamental matrix';
      copy.textContent = essential
        ? 'Remove camera intrinsics and expose the relative pose hidden inside two calibrated views.'
        : 'Drag an image point and watch its possible correspondence collapse to a line.';
    });
  }

  activate(): void {}

  deactivate(): void {}
}

export function createPage(): Page {
  return new ConceptsPage();
}

