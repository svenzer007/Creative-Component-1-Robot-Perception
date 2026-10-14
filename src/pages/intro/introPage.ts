import './introPage.css';
import type { Page } from '../../app/page';

// Times are where the narration for each chapter begins (about 1 s before the scene change).
const CHAPTERS: { t: number; label: string }[] = [
  { t: 6, label: 'You already do this' },
  { t: 20, label: 'A photo loses depth' },
  { t: 37, label: 'Add a second camera' },
  { t: 56, label: 'The epipolar plane' },
  { t: 73, label: 'Epipoles' },
  { t: 89, label: 'Why it matters' },
  { t: 105, label: 'Two special cases' },
  { t: 119, label: 'One equation' },
];

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** The 2-minute intro: a narrated intro to epipolar geometry, before the labs. */
class IntroPage implements Page {
  private video: HTMLVideoElement | null = null;

  mount(container: HTMLElement): void {
    const base = import.meta.env.BASE_URL;
    container.classList.add('intro-page');
    container.innerHTML = `
      <div class="intro-shell">
        <header class="intro-hero">
          <p class="intro-kicker">2-minute intro</p>
          <h1>One pixel, <span>one line.</span></h1>
          <p class="intro-lede">New to epipolar geometry? Watch this short animated explainer first. It builds the idea from scratch:
          why one photo loses depth, how a second camera turns a point into a line, and why that matters for robots.</p>
        </header>

        <div class="intro-grid">
          <figure class="intro-video">
            <video controls preload="metadata" playsinline poster="${base}media/epipolar-basics-poster.jpg">
              <source src="${base}media/epipolar-basics.mp4" type="video/mp4">
              Your browser cannot play this video.
            </video>
          </figure>

          <aside class="intro-chapters" aria-label="Video chapters">
            <h2>Chapters</h2>
            <ol>
              ${CHAPTERS.map((c) => `<li><button type="button" data-t="${c.t}"><span>${fmt(c.t)}</span>${c.label}</button></li>`).join('')}
            </ol>
          </aside>
        </div>

        <section class="intro-next" aria-label="Where to go next">
          <a class="intro-card" href="#/lab">
            <span class="intro-card-kicker">Play with it</span>
            <strong>3D lab →</strong>
            <p>Move the cameras and the point yourself and watch the epipolar line follow.</p>
          </a>
          <a class="intro-card" href="#/concepts">
            <span class="intro-card-kicker">Want the math?</span>
            <strong>Core concepts →</strong>
            <p>The fundamental and essential matrices, step by step, with interactive playgrounds.</p>
          </a>
          <a class="intro-card" href="#/photos">
            <span class="intro-card-kicker">Try real images</span>
            <strong>Photo lab →</strong>
            <p>See epipolar lines on real photos, or take your own.</p>
          </a>
        </section>
      </div>`;

    this.video = container.querySelector('video');
    container.querySelectorAll<HTMLButtonElement>('.intro-chapters button').forEach((button) => {
      button.addEventListener('click', () => this.seek(Number(button.dataset.t)));
    });
  }

  /** Jump to a chapter; waits for the video's metadata if it has not loaded yet. */
  private seek(time: number): void {
    const video = this.video;
    if (!video) return;
    const go = (): void => {
      video.currentTime = time;
      void video.play().catch(() => undefined);
    };
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) go();
    else {
      video.addEventListener('loadedmetadata', go, { once: true });
      video.load();
    }
  }

  activate(): void {}

  deactivate(): void {
    this.video?.pause();
  }
}

export function createPage(): Page {
  return new IntroPage();
}
