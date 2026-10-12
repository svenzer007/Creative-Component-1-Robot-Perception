import './applications.css';
import { APPLICATIONS, BASELINES } from './applicationsData';
import type { Application } from './applicationsData';
import { mountScenes, sceneHtml } from './applicationScenes';
export { pauseScenes, resumeScenes } from './applicationScenes';

function cardHtml(app: Application): string {
  const sources = app.sources
    .map((s) => `<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.label}</a>`)
    .join('');
  return `
    <article class="app-card accent-${app.accent}" data-category="${app.category}" id="app-${app.id}">
      <header class="app-card-head">
        <span class="app-category">${app.category}</span>
        <div class="app-stat"><strong>${app.stat}</strong><small>${app.statLabel}</small></div>
      </header>
      ${sceneHtml(app.id)}
      <h3>${app.title}</h3>
      <p class="app-hook">${app.hook}</p>
      <p class="app-body">${app.body}</p>
      <div class="app-epipolar">
        <span>Where’s the epipolar geometry?</span>
        <p>${app.epipolar}</p>
      </div>
      <footer class="app-sources"><span>Source</span>${sources}</footer>
    </article>`;
}

function baselineHtml(): string {
  const max = Math.max(...BASELINES.map((b) => b.cm));
  const rows = BASELINES.map((b) => {
    const pct = Math.max(1.2, (b.cm / max) * 100);
    return `
      <li>
        <span class="baseline-label">${b.label}</span>
        <span class="baseline-track"><span class="baseline-bar" style="width:${pct.toFixed(2)}%"></span></span>
        <a class="baseline-value" href="${b.source.url}" target="_blank" rel="noopener noreferrer" title="Source: ${b.source.label}">${b.display}</a>
      </li>`;
  }).join('');
  return `
    <section class="apps-panel baseline-panel" aria-labelledby="baseline-title">
      <div class="apps-panel-head">
        <h3 id="baseline-title">Same idea, very different baselines</h3>
        <p>The baseline is the distance between the two camera centers. With Z = fB / d, a wider baseline B produces more disparity d for the same depth Z, so far-away things can be measured more precisely. Click a value to see its source.</p>
      </div>
      <ul class="baseline-list">${rows}</ul>
    </section>`;
}

/**
 * Renders the Applications section into `host`. Self-contained: it imports its own
 * styles and needs only the shared CSS variables from styles.css.
 *
 *   import { renderApplications } from './ui/applications';
 *   renderApplications(document.querySelector<HTMLElement>('#applications')!);
 */
export function renderApplications(host: HTMLElement): void {
  host.classList.add('apps-main');
  const categories = [...new Set(APPLICATIONS.map((a) => a.category))];
  host.innerHTML = `
    <section class="apps-intro">
      <p class="eyebrow">Applications</p>
      <h2>Epipolar geometry in the wild</h2>
      <p>The lab shows one idea: a pixel in one camera becomes a line in the other. Here is where that idea quietly runs the world, from Mars to the operating room.</p>
    </section>

    <section class="apps-thread" aria-label="The common pattern">
      <div><span>1</span><strong>Two views</strong><p>Two cameras (or eyes) separated by a baseline see the same scene.</p></div>
      <div><span>2</span><strong>One line</strong><p>A point in one view can only match along its epipolar line in the other.</p></div>
      <div><span>3</span><strong>Triangulate</strong><p>The two viewing rays meet at the point’s 3D position: depth.</p></div>
    </section>

    <div class="apps-filter" role="toolbar" aria-label="Filter applications by field">
      ${categories.map((c) => `<button type="button" data-filter="${c}" aria-pressed="false">${c}</button>`).join('')}
    </div>

    <div class="apps-grid">${APPLICATIONS.map(cardHtml).join('')}</div>

    ${baselineHtml()}

    <p class="apps-note">Every fact on this page links to its source. Explanations of where epipolar geometry appears describe the underlying principle, not each company’s internal implementation.</p>
  `;

  mountScenes(host);

  const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.apps-filter button'));
  const cards = Array.from(host.querySelectorAll<HTMLElement>('.app-card'));
  // Click a field to show only its cards; click it again to show everything.
  let current: string | null = null;
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter ?? null;
      current = current === filter ? null : filter;
      buttons.forEach((b) => {
        const active = b.dataset.filter === current;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      cards.forEach((card) => {
        card.hidden = current !== null && card.dataset.category !== current;
      });
      // Let the remaining cards use the full width (see applications.css).
      const grid = host.querySelector<HTMLElement>('.apps-grid');
      if (grid) {
        const visible = cards.filter((card) => !card.hidden).length;
        if (current === null) delete grid.dataset.count;
        else grid.dataset.count = String(Math.min(visible, 3));
      }
    });
  });
}
