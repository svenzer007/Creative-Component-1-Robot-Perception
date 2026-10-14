import type { Page } from '../../app/page';
import { GeometryScene } from '../../scene/createScene';
import { AppStore, visibilityForState } from '../../state/appState';
import { ControlsPanel } from '../../ui/controls';
import { ImagePlaneViews } from '../../ui/imagePlanes';
import { MathPanel } from '../../ui/mathPanel';
import { PresentationController } from '../../ui/presentation';

const LAB_MARKUP = `
  <header class="site-header">
    <div>
      <p class="eyebrow">3D Geometry Lab</p>
      <h1>Epipolar Geometry <span>Lab</span></h1>
      <p class="subtitle">From one pixel to one line of possible correspondences.</p>
    </div>
    <div class="header-actions">
      <span id="consistency-badge" class="status-badge" aria-live="polite">Checking geometry…</span>
      <button id="presentation-start" class="primary-button">Explain mode</button>
    </div>
  </header>

  <main>
    <section class="hero-grid" aria-label="Interactive geometry lab">
      <article class="scene-card">
        <div class="card-heading scene-heading">
          <div><span class="section-number">01</span><h2>3D geometry</h2></div>
          <button id="reset-view" class="quiet-button">Reset view</button>
        </div>
        <div id="scene-host" class="scene-host" aria-label="Interactive 3D epipolar geometry scene"></div>
        <div class="scene-hint">Drag to orbit · Shift-drag to pan · Scroll to zoom</div>
        <div class="legend" aria-label="Visual legend">
          <span><i class="legend-dot c1"></i>Camera 1 / ray</span>
          <span><i class="legend-dot c2"></i>Camera 2 / rays</span>
          <span><i class="legend-line plane"></i>Epipolar plane</span>
          <span><i class="legend-line epiline"></i>Epipolar line</span>
          <span><i class="legend-dot actual"></i>Actual X, x′</span>
        </div>
      </article>

      <aside class="control-card" id="controls-panel">
        <div class="card-heading"><div><span class="section-number">02</span><h2>Geometry controls</h2></div></div>
        <div id="geometry-warning" class="warning" role="status" hidden></div>

        <fieldset>
          <legend>Camera 1 image point</legend>
          <p class="control-note">Drag <strong>x</strong> below, or use these sliders.</p>
          <label class="range-control" for="u-slider"><span>u</span><input id="u-slider" type="range" min="-0.8" max="0.8" step="0.01"><output id="u-output"></output></label>
          <label class="range-control" for="v-slider"><span>v</span><input id="v-slider" type="range" min="-0.8" max="0.8" step="0.01"><output id="v-output"></output></label>
          <label class="range-control" for="depth-slider"><span>Depth λ</span><input id="depth-slider" type="range" min="1.5" max="8" step="0.01"><output id="depth-output"></output></label>
          <div class="button-row compact">
            <button id="depth-play" class="quiet-button">Play</button>
            <button id="depth-pause" class="quiet-button">Pause</button>
            <button id="depth-reset" class="quiet-button">Reset λ</button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Camera 2 pose</legend>
          <div class="preset-grid">
            <button data-preset="general">General</button>
            <button data-preset="rectified">Rectified</button>
            <button data-preset="forward">Forward</button>
            <button data-preset="rotation">Near rotation</button>
          </div>
          <label class="range-control" for="cx-slider"><span>C₂ x</span><input id="cx-slider" type="range" min="-3" max="3" step="0.01"><output id="cx-output"></output></label>
          <label class="range-control" for="cy-slider"><span>C₂ y</span><input id="cy-slider" type="range" min="-2" max="2" step="0.01"><output id="cy-output"></output></label>
          <label class="range-control" for="cz-slider"><span>C₂ z</span><input id="cz-slider" type="range" min="-1" max="2.5" step="0.01"><output id="cz-output"></output></label>
          <label class="range-control" for="yaw-slider"><span>Yaw</span><input id="yaw-slider" type="range" min="-45" max="45" step="1"><output id="yaw-output"></output></label>
          <label class="range-control" for="pitch-slider"><span>Pitch</span><input id="pitch-slider" type="range" min="-30" max="30" step="1"><output id="pitch-output"></output></label>
        </fieldset>

        <label class="toggle-control" for="family-toggle">
          <input id="family-toggle" type="checkbox">
          <span><strong>Show family of epipolar planes</strong><small>Reveal the “book of planes” around the baseline.</small></span>
        </label>
      </aside>
    </section>

    <section class="linked-section">
      <div class="section-heading"><span class="section-number">03</span><div><h2>Linked camera views</h2><p>Both panels use normalized image coordinates. Drag x in Camera 1.</p></div></div>
      <div class="image-grid">
        <article class="image-card">
          <div class="image-title"><span>Camera 1</span><small>reference image plane</small></div>
          <svg id="camera1-svg" class="image-plane" viewBox="0 0 500 500" role="img" aria-label="Camera 1 normalized image plane"></svg>
        </article>
        <article class="image-card">
          <div class="image-title"><span>Camera 2</span><small>candidate correspondences</small></div>
          <svg id="camera2-svg" class="image-plane" viewBox="0 0 500 500" role="img" aria-label="Camera 2 normalized image plane"></svg>
        </article>
      </div>
    </section>

    <section class="math-section" id="math-panel">
      <div class="section-heading"><span class="section-number">04</span><div><h2>Live mathematics</h2><p>The equations update from the same state as the geometry.</p></div></div>
      <div class="equation-grid">
        <article class="equation-card"><span>Known point</span><div>x = <code id="math-x"></code></div></article>
        <article class="equation-card featured"><span>Point → line</span><div>l′ = Fx = <code id="math-line"></code></div></article>
        <article class="equation-card"><span>Projected point</span><div>x′ = <code id="math-xprime"></code></div></article>
        <article class="equation-card featured"><span>Epipolar constraint</span><div>x′ᵀFx = <code id="math-residual"></code></div></article>
      </div>
      <details class="advanced-math">
        <summary>Advanced matrices and verification</summary>
        <div class="matrix-grid">
          <div><span>R<sub>rel</sub></span><pre id="math-r"></pre></div>
          <div><span>t<sub>rel</sub></span><pre id="math-t"></pre></div>
          <div><span>F = E</span><pre id="math-f"></pre></div>
          <div class="verification-list">
            <p>singular values <code id="math-singular"></code></p>
            <p>rank(F) <code id="math-rank"></code></p>
            <p>e, where Fe=0 <code id="math-e"></code></p>
            <p>e′, where Fᵀe′=0 <code id="math-eprime"></code></p>
            <p>baseline ‖t‖ <code id="math-baseline"></code></p>
            <p>3D intersection ↔ Fx error <code id="math-agreement"></code></p>
          </div>
        </div>
      </details>
    </section>
  </main>

  <footer><span>Phase 1 · Synthetic normalized cameras · K₁ = K₂ = I</span><span>NYU Tandon ROB-GY 6203</span></footer>

  <aside id="presentation-bar" class="presentation-bar" hidden aria-live="polite">
    <div><span id="presentation-step"></span><h2 id="presentation-title"></h2><p id="presentation-caption"></p></div>
    <div class="presentation-actions">
      <button id="presentation-prev">Previous</button>
      <button id="presentation-next" class="primary-button">Next</button>
      <button id="presentation-restart">Restart</button>
      <button id="presentation-exit">Exit</button>
    </div>
  </aside>
`;

/** The Phase 1 synthetic-camera lab, unchanged in behavior, wrapped as a tab. */
class LabPage implements Page {
  private scene: GeometryScene | null = null;
  private controls: ControlsPanel | null = null;

  mount(container: HTMLElement): void {
    container.classList.add('lab-page');
    container.innerHTML = LAB_MARKUP;
    const store = new AppStore();
    const scene = new GeometryScene(container.querySelector<HTMLElement>('#scene-host')!);
    const controls = new ControlsPanel(container.querySelector<HTMLElement>('#controls-panel')!, store, () => scene.resetView());
    const views = new ImagePlaneViews(
      container.querySelector<SVGSVGElement>('#camera1-svg')!,
      container.querySelector<SVGSVGElement>('#camera2-svg')!,
      store,
    );
    const math = new MathPanel(container.querySelector<HTMLElement>('#math-panel')!);
    const presentation = new PresentationController(container, store);

    store.subscribe((state, snapshot) => {
      const visibility = visibilityForState(state);
      controls.update(state);
      scene.update(snapshot, visibility);
      views.update(snapshot, visibility);
      math.update(snapshot);
      presentation.update(state);
    });
    this.scene = scene;
    this.controls = controls;
  }

  activate(): void {
    this.scene?.setActive(true);
  }

  deactivate(): void {
    this.scene?.setActive(false);
    this.controls?.pause();
  }
}

export function createPage(): Page {
  return new LabPage();
}
