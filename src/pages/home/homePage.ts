import './homePage.css';
import type { Page } from '../../app/page';
import type { RouteDefinition } from '../../app/router';
import { ROUTES } from '../../app/routes';
import { HeroFigure } from './heroFigure';

export interface Author {
  name: string;
  initials: string;
  program: string;
  /** One of the app's camera-view hues, so each author reads as one view of the same scene. */
  color: string;
}

/** Listed alphabetically by surname: equal billing, equal cards. */
export const AUTHORS: readonly Author[] = [
  { name: 'Stavan Christian', initials: 'SC', program: 'PhD candidate, Electrical and Computer Engineering', color: '#52d6ff' },
  { name: 'Ernest Saakian', initials: 'ES', program: 'M.S. Computer Engineering', color: '#ffb84d' },
  { name: 'Sai Sriya Tulluri', initials: 'ST', program: 'M.S. Mechatronics and Robotics', color: '#a990ff' },
];

export const AFFILIATION = 'NYU Tandon School of Engineering';

/** One-line introduction for every tab, keyed by route id. A new tab needs a line here (a test checks). */
export const PAGE_INTROS: Readonly<Record<string, { verb: string; text: string }>> = {
  start: { verb: 'Watch', text: 'A two-minute narrated animation that introduces the idea from scratch, with chapters to jump between.' },
  lab: { verb: 'Play', text: 'Move two cameras and a point in 3D and watch every part of the construction respond, with an eight-step guided mode.' },
  concepts: { verb: 'Understand', text: 'Playgrounds for the fundamental and essential matrices, from pixel coordinates to camera pose.' },
  photos: { verb: 'Try', text: 'Epipolar lines on real images: start from a sample scene, upload your own, or take new photos.' },
  applications: { verb: 'Discover', text: 'Real systems that depend on this geometry, from planetary rovers to film sets, each with sources.' },
};

const COUNT_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

/** Every tab except Home, in the order the bar shows them. */
export const directoryRoutes = (): RouteDefinition[] => ROUTES.filter((route) => route.id !== 'home');

function authorCard(author: Author): string {
  return `
    <article class="home-author" style="--author: ${author.color}">
      <span class="home-corner tl"></span><span class="home-corner tr"></span><span class="home-corner bl"></span><span class="home-corner br"></span>
      <span class="home-author-badge" aria-hidden="true">${author.initials}</span>
      <h3>${author.name}</h3>
      <p>${author.program}</p>
    </article>`;
}

function directory(): string {
  const routes = directoryRoutes();
  const cards = routes.map((route, index) => {
    const intro = PAGE_INTROS[route.id];
    return `
      <li style="--i: ${index}">
        <a class="home-page-card" href="#${route.path}">
          <span class="home-page-top"><span class="home-page-number">${String(index + 1).padStart(2, '0')}</span><span class="home-page-verb">${intro?.verb ?? ''}</span></span>
          <strong>${route.label}</strong>
          <p>${intro?.text ?? ''}</p>
          <span class="home-page-open">Open ${route.label}<span aria-hidden="true">→</span></span>
        </a>
      </li>`;
  }).join('');
  const count = COUNT_WORDS[routes.length] ?? String(routes.length);
  return `
    <section class="home-pages" aria-labelledby="home-pages-title">
      <div class="home-section-head">
        <p class="home-eyebrow">Explore</p>
        <h2 id="home-pages-title">${count} ways in</h2>
        <p>Follow them in order, or open whichever you need.</p>
      </div>
      <ol class="home-page-list">${cards}</ol>
    </section>`;
}

/** Landing page: what the project explains and why, who made it, and a way into every tab. */
class HomePage implements Page {
  private figure: HeroFigure | null = null;

  mount(container: HTMLElement): void {
    container.classList.add('home-page');
    container.innerHTML = `
      <main class="home-shell">
        <header class="home-hero">
          <div class="home-hero-copy">
            <p class="home-eyebrow">NYU Tandon · ROB-GY 6203 Robot Perception</p>
            <h1>How two cameras <span>see in 3D</span></h1>
            <p class="home-lede">Epipolar geometry describes how two images of the same scene, taken from different positions, constrain each other. It is the foundation that lets machines turn flat pictures into 3D measurements, and most systems that perceive depth or motion with cameras are built on it.</p>
            <p class="home-lede">This project makes that geometry something you can see and handle: first by intuition, then through its equations, and finally on real photographs.</p>
            <div class="home-actions">
              <a class="primary-button home-cta" href="#/start">Begin with the 2-minute intro</a>
              <button type="button" class="quiet-button home-scroll">See all pages</button>
            </div>
          </div>
          <figure class="home-figure"></figure>
        </header>

        <section class="home-authors" aria-labelledby="home-authors-title">
          <div class="home-section-head">
            <p class="home-eyebrow">Authors</p>
            <h2 id="home-authors-title">Three views, one project</h2>
            <p>Listed alphabetically by surname.</p>
          </div>
          <div class="home-author-grid">${AUTHORS.map(authorCard).join('')}</div>
          <p class="home-affiliation"><span>${AFFILIATION}</span></p>
        </section>

        ${directory()}
      </main>
      <footer><span>ROB-GY 6203 Robot Perception · Creative Component 1</span><span>${AFFILIATION}</span></footer>
    `;
    this.figure = new HeroFigure();
    container.querySelector('.home-figure')!.append(this.figure.element);
    // In-page jumps use scrolling, not '#anchors': the hash belongs to the router.
    container.querySelector('.home-scroll')!.addEventListener('click', () => {
      container.querySelector('.home-pages')!.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  activate(): void {
    this.figure?.play();
  }

  deactivate(): void {
    this.figure?.pause();
  }
}

export function createPage(): Page {
  return new HomePage();
}
