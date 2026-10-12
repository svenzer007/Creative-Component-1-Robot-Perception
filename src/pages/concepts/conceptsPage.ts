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
  type IntrinsicsControls,
} from './model';
import {
  formatMatrix,
  formatVector,
  renderBaselineDiagram,
  renderImagePair,
  renderNormalizedPlanes,
} from './views';

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

    <section class="concepts-essential" data-essential hidden>
      <div class="concepts-workspace-heading">
        <div><span>01 · Calibrate</span><h2>Pixels are not yet viewing rays</h2><p>Keep the same x and x′. Remove K₁ and K₂ to reach canonical camera coordinates.</p></div>
        <div class="concepts-presets" aria-label="Essential matrix camera presets">
          <button type="button" data-preset="general">General</button>
          <button type="button" data-preset="rectified">Rectified</button>
          <button type="button" data-preset="forward">Forward</button>
          <button type="button" data-preset="nearRotation">Near rotation</button>
        </div>
      </div>

      <div class="calibration-grid">
        <article class="calibration-card source-calibration">
          <header><span>Image 1 calibration</span><code>x̂ = K₁⁻¹x</code></header>
          <div class="calibration-equation"><code data-pixel-source></code><b>→ K₁⁻¹ →</b><code data-normalized-source></code></div>
          <svg data-normalized-source-svg viewBox="0 0 320 210" role="img" aria-label="Camera 1 normalized z equals 1 image plane"></svg>
          <label class="focal-control">Focal length <input data-focal="1" type="range" min="250" max="1000" step="5"><output></output></label>
        </article>
        <article class="calibration-card target-calibration">
          <header><span>Image 2 calibration</span><code>x̂′ = K₂⁻¹x′</code></header>
          <div class="calibration-equation"><code data-pixel-target></code><b>→ K₂⁻¹ →</b><code data-normalized-target></code></div>
          <svg data-normalized-target-svg viewBox="0 0 320 210" role="img" aria-label="Camera 2 normalized z equals 1 image plane"></svg>
          <label class="focal-control">Focal length <input data-focal="2" type="range" min="250" max="1000" step="5"><output></output></label>
        </article>
        <details class="intrinsics-details">
          <summary>Advanced intrinsics · fx, fy, cx, cy</summary>
          <div class="intrinsics-editor">
            <fieldset><legend>K₁</legend>
              <label>fx <input data-intrinsics="1:fx" type="range" min="250" max="1000" step="5"><output></output></label>
              <label>fy <input data-intrinsics="1:fy" type="range" min="250" max="1000" step="5"><output></output></label>
              <label>cx <input data-intrinsics="1:cx" type="range" min="200" max="440" step="2"><output></output></label>
              <label>cy <input data-intrinsics="1:cy" type="range" min="120" max="300" step="2"><output></output></label>
            </fieldset>
            <fieldset><legend>K₂</legend>
              <label>fx <input data-intrinsics="2:fx" type="range" min="250" max="1000" step="5"><output></output></label>
              <label>fy <input data-intrinsics="2:fy" type="range" min="250" max="1000" step="5"><output></output></label>
              <label>cx <input data-intrinsics="2:cx" type="range" min="200" max="440" step="2"><output></output></label>
              <label>cy <input data-intrinsics="2:cy" type="range" min="120" max="300" step="2"><output></output></label>
            </fieldset>
          </div>
        </details>
        <p class="z-note"><strong>z = 1 is a coordinate convention, not scene depth.</strong> It turns each calibrated pixel into a canonical ray direction [u, v, 1]ᵀ.</p>
      </div>

      <section class="essential-bridge">
        <div class="concepts-workspace-heading compact"><div><span>02 · Reveal</span><h2>Calibration exposes relative pose</h2><p>Two independent paths reach the same Essential Matrix, up to homogeneous scale and sign.</p></div></div>
        <div class="essential-matrix-flow">
          <article><span>From pixel geometry</span><h3>E = K₂ᵀ F K₁</h3><pre data-e-from-f></pre></article>
          <div class="matrix-equivalence"><strong>≈</strong><code data-e-agreement></code><small>scale/sign agreement</small></div>
          <article><span>From relative pose</span><h3>E = [t]× R</h3><pre data-e-pose></pre></article>
        </div>
        <div class="normalized-constraint"><span>normalized epipolar constraint</span><strong>x̂′ᵀ E x̂</strong><code data-normalized-residual></code></div>
      </section>

      <section class="scale-experiment">
        <div class="concepts-workspace-heading compact"><div><span>03 · Experiment</span><h2>Stretch the baseline. Keep the epipolar geometry.</h2><p>E recovers translation direction—not metric translation magnitude or global scene scale.</p></div></div>
        <div class="scale-grid">
          <article class="baseline-card">
            <svg data-baseline-svg viewBox="0 0 500 240" role="img" aria-label="Top-down camera baseline scale diagram"></svg>
            <label class="baseline-control"><span>Baseline multiplier λ</span><input data-baseline-scale type="range" min="0.25" max="2.5" step="0.05"><output></output></label>
            <div data-essential-warning class="concepts-warning" role="status" hidden></div>
          </article>
          <article class="scale-readout">
            <div><span>raw ‖E‖<sub>F</sub></span><strong data-e-raw-norm></strong><small>scales with λ</small></div>
            <div><span>raw ‖F‖<sub>F</sub></span><strong data-f-raw-norm></strong><small>scales with λ</small></div>
            <div class="invariant"><span>canonical E drift</span><strong data-e-drift></strong><small>unchanged</small></div>
            <div class="invariant"><span>canonical F drift</span><strong data-f-drift></strong><small>same lines</small></div>
          </article>
          <article class="dof-five-card">
            <span>Essential Matrix · 5 DoF</span>
            <div class="rotation-dof"><strong>3</strong><p>rotation<br><small>roll · pitch · yaw</small></p></div>
            <b>+</b>
            <div class="translation-dof"><strong>2</strong><p>translation direction<br><small>azimuth · elevation</small></p></div>
            <b>=</b><strong class="five">5</strong>
            <p class="scale-excluded">Baseline magnitude is intentionally outside the count.</p>
            <code data-translation-direction></code>
          </article>
        </div>
        <div class="essential-singular"><span>Essential singular values</span><code data-essential-singular></code><small>ideal structure: (σ, σ, 0)</small></div>
      </section>

      <details class="next-concepts">
        <summary>What comes next? · E to four pose candidates</summary>
        <div><strong>2 candidate rotations × 2 translation signs = 4 (R, t) candidates</strong><p>Triangulation and a positive-depth (cheirality) test select the physically valid configuration. This focused v1 stops before that decomposition.</p></div>
      </details>
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
    container.querySelectorAll<HTMLInputElement>('[data-focal]').forEach((input) => {
      input.addEventListener('input', () => {
        const which = input.dataset.focal === '1' ? 'intrinsics1' : 'intrinsics2';
        const value = Number(input.value);
        this.store.update({ [which]: { ...this.store.getState()[which], fx: value, fy: value } });
      });
    });
    container.querySelectorAll<HTMLInputElement>('[data-intrinsics]').forEach((input) => {
      input.addEventListener('input', () => {
        const [camera, field] = input.dataset.intrinsics!.split(':') as ['1' | '2', keyof IntrinsicsControls];
        const key = camera === '1' ? 'intrinsics1' : 'intrinsics2';
        this.store.update({ [key]: { ...this.store.getState()[key], [field]: Number(input.value) } });
      });
    });
    container.querySelector<HTMLInputElement>('[data-baseline-scale]')!.addEventListener('input', (event) => {
      this.store.update({ baselineScale: Number((event.currentTarget as HTMLInputElement).value) });
    });
    const sourceSvg = container.querySelector<SVGSVGElement>('[data-source-svg]')!;
    const targetSvg = container.querySelector<SVGSVGElement>('[data-target-svg]')!;
    this.bindImageInteraction(sourceSvg, 'source');
    this.bindImageInteraction(targetSvg, 'target');
    this.store.subscribe((state, snapshot) => {
      buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.section === state.section)));
      container.querySelector<HTMLElement>('[data-fundamental]')!.hidden = state.section !== 'fundamental';
      container.querySelector<HTMLElement>('[data-essential]')!.hidden = state.section !== 'essential';
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
    renderNormalizedPlanes(
      container.querySelector<SVGSVGElement>('[data-normalized-source-svg]')!,
      container.querySelector<SVGSVGElement>('[data-normalized-target-svg]')!,
      snapshot,
    );
    renderBaselineDiagram(container.querySelector<SVGSVGElement>('[data-baseline-svg]')!, snapshot);
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
    container.querySelector<HTMLElement>('[data-pixel-source]')!.textContent = formatVector(snapshot.sourcePoint, 1);
    container.querySelector<HTMLElement>('[data-pixel-target]')!.textContent = formatVector(snapshot.targetPoint, 1);
    container.querySelector<HTMLElement>('[data-normalized-source]')!.textContent = formatVector(snapshot.sourceNormalized, 3);
    container.querySelector<HTMLElement>('[data-normalized-target]')!.textContent = formatVector(snapshot.targetNormalized, 3);
    container.querySelectorAll<HTMLInputElement>('[data-focal]').forEach((input) => {
      const intrinsics = input.dataset.focal === '1' ? state.intrinsics1 : state.intrinsics2;
      input.value = String(intrinsics.fx);
      input.nextElementSibling!.textContent = intrinsics.fx === intrinsics.fy
        ? `${intrinsics.fx.toFixed(0)} px`
        : `${intrinsics.fx.toFixed(0)} / ${intrinsics.fy.toFixed(0)} px`;
    });
    container.querySelectorAll<HTMLInputElement>('[data-intrinsics]').forEach((input) => {
      const [camera, field] = input.dataset.intrinsics!.split(':') as ['1' | '2', keyof IntrinsicsControls];
      const intrinsics = camera === '1' ? state.intrinsics1 : state.intrinsics2;
      input.value = String(intrinsics[field]);
      input.nextElementSibling!.textContent = intrinsics[field].toFixed(0);
    });
    container.querySelector<HTMLElement>('[data-e-from-f]')!.textContent = snapshot.essentialFromF
      ? formatMatrix(snapshot.essentialFromF) : 'degenerate';
    container.querySelector<HTMLElement>('[data-e-pose]')!.textContent = snapshot.essentialCanonical
      ? formatMatrix(snapshot.essentialCanonical) : 'E = 0';
    container.querySelector<HTMLElement>('[data-e-agreement]')!.textContent = snapshot.essentialAgreement === null
      ? 'undefined' : snapshot.essentialAgreement.toExponential(2);
    container.querySelector<HTMLElement>('[data-normalized-residual]')!.textContent = snapshot.normalizedResidual === null
      ? 'undefined' : snapshot.normalizedResidual.toExponential(3);
    const scale = container.querySelector<HTMLInputElement>('[data-baseline-scale]')!;
    scale.value = String(state.baselineScale);
    scale.nextElementSibling!.textContent = `${state.baselineScale.toFixed(2)}×`;
    container.querySelector<HTMLElement>('[data-e-raw-norm]')!.textContent = snapshot.essentialRawNorm.toExponential(3);
    container.querySelector<HTMLElement>('[data-f-raw-norm]')!.textContent = snapshot.fundamentalRawNorm.toExponential(3);
    container.querySelector<HTMLElement>('[data-e-drift]')!.textContent = snapshot.essentialScaleInvariantError === null
      ? 'undefined' : snapshot.essentialScaleInvariantError.toExponential(2);
    container.querySelector<HTMLElement>('[data-f-drift]')!.textContent = snapshot.fundamentalScaleInvariantError === null
      ? 'undefined' : snapshot.fundamentalScaleInvariantError.toExponential(2);
    container.querySelector<HTMLElement>('[data-translation-direction]')!.textContent = snapshot.translationDirection
      ? `t̂ = ${formatVector(snapshot.translationDirection, 3)}` : 't̂ is undefined when t = 0';
    container.querySelector<HTMLElement>('[data-essential-singular]')!.textContent = formatVector(snapshot.essentialSingularValues, 4);
    const essentialWarning = container.querySelector<HTMLElement>('[data-essential-warning]')!;
    essentialWarning.hidden = !snapshot.warning;
    essentialWarning.textContent = snapshot.warning ?? '';
  }

  activate(): void {}

  deactivate(): void {}
}

export function createPage(): Page {
  return new ConceptsPage();
}
