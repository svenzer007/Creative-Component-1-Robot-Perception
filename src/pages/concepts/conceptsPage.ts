import './concepts.css';
import type { Page } from '../../app/page';
import type { CameraControls } from '../../types';
import { mat3Vec3, norm3, transpose3 } from '../../math/linearAlgebra';
import { clientToImagePixel } from './coordinates';
import {
  CONCEPT_PRESETS,
  CoreConceptsStore,
  IMAGE_HEIGHT,
  IMAGE_WIDTH,
  snapTargetToLine,
  type ConceptPreset,
  type ConceptSection,
  type CoreConceptsSnapshot,
  type CoreConceptsState,
} from './model';
import { formatMatrix, formatVector, renderImagePair } from './views';

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
    <section class="concepts-workspace" data-fundamental>
      <div class="concepts-workspace-heading">
        <div><span>01 · Observe</span><h2>One point becomes one line</h2><p>Drag <strong>x</strong>. Camera geometry restricts its match to <strong>l′</strong>, not a single pixel.</p></div>
        <div class="concepts-presets" aria-label="Camera geometry presets">
          <button type="button" data-preset="general">General</button>
          <button type="button" data-preset="rectified">Rectified</button>
          <button type="button" data-preset="forward">Forward</button>
          <button type="button" data-preset="nearRotation">Near rotation</button>
        </div>
      </div>

      <div class="concepts-main-grid">
        <section class="concepts-image-pair" aria-label="Interactive image pair">
          <article class="concept-image-card source-card">
            <header><span>Image 1</span><small>drag x · arrows nudge</small></header>
            <svg data-source-svg viewBox="0 0 640 420" tabindex="0" role="application" aria-label="Source image. Drag or use arrow keys to move x."></svg>
          </article>
          <article class="concept-image-card target-card">
            <header><span>Image 2</span><small>drag candidate x′</small></header>
            <svg data-target-svg viewBox="0 0 640 420" tabindex="0" role="application" aria-label="Target image. Drag or use arrow keys to move candidate x prime."></svg>
          </article>
          <div class="concepts-observation" aria-live="polite">
            <div><span>point → line</span><strong>l′ = Fx</strong><code data-line-value>—</code></div>
            <div><span>candidate residual</span><strong>x′ᵀFx</strong><code data-residual>—</code></div>
            <div class="distance-meter"><span>geometric distance</span><strong data-distance>— px</strong><i><b data-distance-bar></b></i></div>
            <button type="button" data-snap class="concepts-snap">Snap x′ to line</button>
          </div>
        </section>

        <aside class="concepts-controls" aria-label="Core Concepts controls">
          <div class="concepts-control-heading"><span>Experiment controls</span><small data-geometry-summary></small></div>
          <label class="concepts-toggle"><input data-pencil type="checkbox"><span><strong>Show epipolar pencil</strong><small>Several source points reveal the shared e′.</small></span></label>
          <details data-geometry-details>
            <summary>Camera 2 geometry</summary>
            <div class="concepts-range-list">
              <label>C₂ x <input data-camera="x" type="range" min="-3" max="3" step="0.01"><output></output></label>
              <label>C₂ y <input data-camera="y" type="range" min="-2" max="2" step="0.01"><output></output></label>
              <label>C₂ z <input data-camera="z" type="range" min="-1" max="2.5" step="0.01"><output></output></label>
              <label>Yaw <input data-camera="yawDegrees" type="range" min="-45" max="45" step="1"><output></output></label>
              <label>Pitch <input data-camera="pitchDegrees" type="range" min="-30" max="30" step="1"><output></output></label>
            </div>
          </details>
          <div data-warning class="concepts-warning" role="status" hidden></div>
          <a href="#/lab" class="concepts-link">Explore this geometry in the 3D Lab <span>→</span></a>
        </aside>
      </div>

      <section class="concepts-reveal">
        <div class="concepts-workspace-heading compact">
          <div><span>02 · Explain</span><h2>The line pencil forces rank two</h2><p>Turn on the pencil. Every valid target line passes through the same epipole e′.</p></div>
        </div>
        <div class="concepts-reveal-grid">
          <article class="concepts-proof-card">
            <p class="proof-step">Observed geometry</p>
            <h3>All l′ pass through e′</h3>
            <div class="proof-arrow">↓</div>
            <code>e′ᵀF = 0 &nbsp;⇔&nbsp; Fᵀe′ = 0</code>
            <p>A nonzero left-null vector means F cannot have full rank 3.</p>
            <strong>For nondegenerate two-view geometry, rank(F) = 2.</strong>
          </article>
          <article class="concepts-singular-card">
            <div><span>Singular values</span><code data-singular-values></code></div>
            <div class="singular-bars"><i><b data-sigma="0"></b></i><i><b data-sigma="1"></b></i><i><b data-sigma="2"></b></i></div>
            <p>σ₃ collapses to zero, exposing the null space.</p>
            <div class="null-checks"><code data-null-source></code><code data-null-target></code></div>
          </article>
          <article class="concepts-dof-card">
            <span>Degrees of freedom</span>
            <div><strong>9</strong><small>matrix entries</small></div>
            <b>−</b><div><strong>1</strong><small>homogeneous scale</small></div>
            <b>−</b><div><strong>1</strong><small>rank constraint</small></div>
            <b>=</b><div class="dof-result"><strong>7</strong><small>DoF</small></div>
          </article>
        </div>
        <details class="concepts-matrix-details">
          <summary>Inspect F, epipoles, and relative pose</summary>
          <div class="concepts-matrix-grid">
            <div><span>F · canonical</span><pre data-matrix-f></pre></div>
            <div><span>R<sub>rel</sub></span><pre data-matrix-r></pre></div>
            <div><span>t<sub>rel</sub></span><pre data-vector-t></pre></div>
            <div><span>Null spaces</span><pre data-epipoles></pre></div>
          </div>
        </details>
      </section>
    </section>

    <section class="concepts-stage" data-essential-placeholder hidden aria-live="polite">
      <p class="concepts-stage-label">Next experiment</p>
      <h2>Remove the camera intrinsics</h2>
      <p>The selected pixels will carry forward into calibrated, normalized camera coordinates.</p>
    </section>
  </main>`;

class ConceptsPage implements Page {
  private readonly store = new CoreConceptsStore();
  private drag: { kind: 'source' | 'target'; pointerId: number } | null = null;

  mount(container: HTMLElement): void {
    container.classList.add('concepts-page');
    container.innerHTML = MARKUP;
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-section]')];
    buttons.forEach((button) => button.addEventListener('click', () => {
      this.store.update({ section: button.dataset.section as ConceptSection });
    }));
    container.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
      button.addEventListener('click', () => this.store.applyPreset(button.dataset.preset as ConceptPreset));
    });
    container.querySelector<HTMLInputElement>('[data-pencil]')!.addEventListener('change', (event) => {
      this.store.update({ showPencil: (event.currentTarget as HTMLInputElement).checked });
    });
    container.querySelector<HTMLButtonElement>('[data-snap]')!.addEventListener('click', () => {
      const targetPixel = snapTargetToLine(this.store.snapshot());
      if (targetPixel) this.store.update({ targetPixel });
    });
    const details = container.querySelector<HTMLDetailsElement>('[data-geometry-details]')!;
    details.addEventListener('toggle', () => this.store.update({ showAdvancedGeometry: details.open }));
    container.querySelectorAll<HTMLInputElement>('[data-camera]').forEach((input) => {
      input.addEventListener('input', () => this.updateCamera(input.dataset.camera!, Number(input.value)));
    });
    const sourceSvg = container.querySelector<SVGSVGElement>('[data-source-svg]')!;
    const targetSvg = container.querySelector<SVGSVGElement>('[data-target-svg]')!;
    this.bindImageInteraction(sourceSvg, 'source');
    this.bindImageInteraction(targetSvg, 'target');
    this.store.subscribe((state, snapshot) => {
      buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.section === state.section)));
      container.querySelector<HTMLElement>('[data-fundamental]')!.hidden = state.section !== 'fundamental';
      container.querySelector<HTMLElement>('[data-essential-placeholder]')!.hidden = state.section !== 'essential';
      this.render(container, sourceSvg, targetSvg, state, snapshot);
    });
  }

  private bindImageInteraction(svg: SVGSVGElement, kind: 'source' | 'target'): void {
    const update = (event: PointerEvent): void => {
      const point = clientToImagePixel(event.clientX, event.clientY, svg.getBoundingClientRect(), IMAGE_WIDTH, IMAGE_HEIGHT);
      this.store.update(kind === 'source' ? { sourcePixel: point } : { targetPixel: point });
    };
    svg.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.drag = { kind, pointerId: event.pointerId };
      svg.setPointerCapture(event.pointerId);
      update(event);
    });
    svg.addEventListener('pointermove', (event) => {
      if (this.drag?.kind === kind && this.drag.pointerId === event.pointerId) update(event);
    });
    const finish = (event: PointerEvent): void => {
      if (this.drag?.pointerId !== event.pointerId) return;
      this.drag = null;
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    };
    svg.addEventListener('pointerup', finish);
    svg.addEventListener('pointercancel', finish);
    svg.addEventListener('keydown', (event) => {
      const directions: Record<string, readonly [number, number]> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      const current = kind === 'source' ? this.store.getState().sourcePixel : this.store.getState().targetPixel;
      const step = event.shiftKey ? 10 : 1;
      const point: readonly [number, number] = [
        Math.min(IMAGE_WIDTH, Math.max(0, current[0] + direction[0] * step)),
        Math.min(IMAGE_HEIGHT, Math.max(0, current[1] + direction[1] * step)),
      ];
      this.store.update(kind === 'source' ? { sourcePixel: point } : { targetPixel: point });
    });
  }

  private updateCamera(field: string, value: number): void {
    const state = this.store.getState();
    let camera2: CameraControls;
    if (field === 'x' || field === 'y' || field === 'z') {
      const index = { x: 0, y: 1, z: 2 }[field];
      const center = [...state.camera2.center] as [number, number, number];
      center[index] = value;
      camera2 = { ...state.camera2, center };
    } else {
      camera2 = { ...state.camera2, [field]: value };
    }
    this.store.update({ camera2, baselineScale: 1 });
  }

  private render(
    container: HTMLElement,
    sourceSvg: SVGSVGElement,
    targetSvg: SVGSVGElement,
    state: CoreConceptsState,
    snapshot: CoreConceptsSnapshot,
  ): void {
    renderImagePair(sourceSvg, targetSvg, snapshot);
    container.querySelector<HTMLInputElement>('[data-pencil]')!.checked = state.showPencil;
    const line = snapshot.fundamentalLine;
    container.querySelector<HTMLElement>('[data-line-value]')!.textContent = line ? formatVector(line, 3) : 'undefined';
    container.querySelector<HTMLElement>('[data-residual]')!.textContent = snapshot.algebraicResidual === null
      ? 'undefined' : snapshot.algebraicResidual.toExponential(3);
    container.querySelector<HTMLElement>('[data-distance]')!.textContent = snapshot.distance === null
      ? 'undefined' : `${snapshot.distance.toFixed(2)} px`;
    container.querySelector<HTMLElement>('[data-distance-bar]')!.style.width = `${Math.min(100, snapshot.distance ?? 0)}%`;
    container.querySelector<HTMLButtonElement>('[data-snap]')!.disabled = !snapshot.closestTarget;
    const warning = container.querySelector<HTMLElement>('[data-warning]')!;
    warning.hidden = !snapshot.warning;
    warning.textContent = snapshot.warning ?? '';
    container.querySelector<HTMLElement>('[data-geometry-summary]')!.textContent = `baseline ${snapshot.baselineLength.toFixed(2)} · rank ${snapshot.rank}`;
    container.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
      const preset = CONCEPT_PRESETS[button.dataset.preset as ConceptPreset];
      const current = state.camera2;
      const selected = state.baselineScale === 1
        && preset.yawDegrees === current.yawDegrees
        && preset.pitchDegrees === current.pitchDegrees
        && preset.center.every((value, index) => value === current.center[index]);
      button.classList.toggle('is-active', selected);
    });
    const details = container.querySelector<HTMLDetailsElement>('[data-geometry-details]')!;
    details.open = state.showAdvancedGeometry;
    container.querySelectorAll<HTMLInputElement>('[data-camera]').forEach((input) => {
      const field = input.dataset.camera!;
      const value = field === 'x' ? state.camera2.center[0]
        : field === 'y' ? state.camera2.center[1]
          : field === 'z' ? state.camera2.center[2]
            : state.camera2[field as 'yawDegrees' | 'pitchDegrees'];
      input.value = String(value);
      input.nextElementSibling!.textContent = field.includes('Degrees') ? `${value.toFixed(0)}°` : value.toFixed(2);
    });
    container.querySelector<HTMLElement>('[data-singular-values]')!.textContent = formatVector(snapshot.singularValues, 3);
    const maximum = snapshot.singularValues[0] || 1;
    container.querySelectorAll<HTMLElement>('[data-sigma]').forEach((bar) => {
      bar.style.width = `${Math.max(0.5, snapshot.singularValues[Number(bar.dataset.sigma)] / maximum * 100)}%`;
    });
    const f = snapshot.fundamentalCanonical;
    const sourceNull = f && snapshot.epipoleSource
      ? norm3(mat3Vec3(f, snapshot.epipoleSource.homogeneous)) : null;
    const targetNull = f && snapshot.epipoleTarget
      ? norm3(mat3Vec3(transpose3(f), snapshot.epipoleTarget.homogeneous)) : null;
    container.querySelector<HTMLElement>('[data-null-source]')!.textContent = `‖Fe‖ = ${sourceNull === null ? '—' : sourceNull.toExponential(2)}`;
    container.querySelector<HTMLElement>('[data-null-target]')!.textContent = `‖Fᵀe′‖ = ${targetNull === null ? '—' : targetNull.toExponential(2)}`;
    container.querySelector<HTMLElement>('[data-matrix-f]')!.textContent = f ? formatMatrix(f) : 'degenerate';
    container.querySelector<HTMLElement>('[data-matrix-r]')!.textContent = formatMatrix(snapshot.relativeRotation);
    container.querySelector<HTMLElement>('[data-vector-t]')!.textContent = formatVector(snapshot.relativeTranslation);
    container.querySelector<HTMLElement>('[data-epipoles]')!.textContent = `e  = ${snapshot.epipoleSource ? formatVector(snapshot.epipoleSource.homogeneous) : '—'}\ne′ = ${snapshot.epipoleTarget ? formatVector(snapshot.epipoleTarget.homogeneous) : '—'}\nrank(F) = ${snapshot.rank}`;
  }

  activate(): void {}

  deactivate(): void {}
}

export function createPage(): Page {
  return new ConceptsPage();
}
