import type { Mat3, Vec3 } from '../../types';
import { cross3, normalizeLine, svd3 } from '../../math/linearAlgebra';
import { canonicalScale } from '../../vision/fundamental';
import {
  closestPointOnLine,
  epipolarLine,
  epipoles,
  pointLineDistance,
  transferPoint,
  type Pixel,
} from '../../vision/geometry2d';
import { grayFromRgba, searchAlongLine, searchPosition, type LineSearch } from '../../vision/ncc';
import {
  DEFAULT_ANALYSIS,
  pairQuality,
  viewPairs,
  type AnalysisProgress,
  type AnalysisResult,
  type PairAnalysis,
} from '../../vision/pipeline';
import { projectToPixel, SAMPLE_HEIGHT, SAMPLE_WIDTH } from '../../vision/syntheticScene';
import type { VisionClient } from '../../vision/visionClient';
import { CameraDialog, type PairCheck } from './cameraDialog';
import { decodeImageFile, imageFilesFrom, type DecodedImage } from './imageSources';
import {
  fitManualPair,
  formatCount,
  formatValue,
  fundamentalBetween,
  MAX_PINS,
  MAX_VIEWS,
  MIN_VIEWS,
  nextPinColor,
  VIEW_COLORS,
  VIEW_KEYS,
  type ManualFit,
  type ManualMatch,
  type PairModel,
  type PhotoView,
  type Pin,
  type ViewPoint,
} from './model';
import {
  renderManual,
  renderMath,
  renderRail,
  renderSearch,
  type ManualElements,
  type MathElements,
  type MathModel,
  type RailStep,
  type SearchElements,
  type SearchModel,
  type Statistic,
} from './panels';
import { PhotoFrame, type FrameCallbacks } from './photoFrame';
import { SampleTruth } from './sampleTruth';

const PENCIL_COLORS = ['#9f86ff', '#8c95ff', '#70d6ff', '#7fe8d6', '#8cffb5', '#c5f28b', '#ffd670', '#ffb084', '#ff8fab'];
/** A cardboard-box label in the sample room: textured, visible to every camera. */
const SAMPLE_PIN_POINT: Vec3 = [1.26, 0.27, 3.0];

const MARKUP = `
  <header class="ph-hero">
    <div class="ph-hero-copy">
      <p class="eyebrow">Photo lab · real images</p>
      <h1>Photo <span>Lab</span></h1>
      <p class="subtitle">Point at anything in one photo. Its match has to sit on the epipolar line drawn in every other photo.</p>
    </div>
    <ol class="ph-rail" aria-label="Processing pipeline">
      <li><span class="ph-step-key"><i></i>Photos</span><span class="ph-step-value">—</span><span class="ph-step-note">waiting</span></li>
      <li><span class="ph-step-key"><i></i>Keypoints</span><span class="ph-step-value">—</span><span class="ph-step-note">AKAZE detector</span></li>
      <li><span class="ph-step-key"><i></i>Matches</span><span class="ph-step-value">—</span><span class="ph-step-note">ratio test</span></li>
      <li><span class="ph-step-key"><i></i>RANSAC</span><span class="ph-step-value">—</span><span class="ph-step-note">robust fit</span></li>
      <li><span class="ph-step-key"><i></i>F</span><span class="ph-step-value">—</span><span class="ph-step-note">rank 2</span></li>
    </ol>
  </header>

  <main class="ph-main">
    <section class="ph-source" aria-label="Photos in use">
      <div class="ph-source-info">
        <span class="ph-source-chip"></span>
        <span class="ph-source-text"></span>
      </div>
      <div class="ph-source-actions">
        <label class="ph-button"><input type="file" accept="image/*" multiple hidden data-input="upload">Upload photos</label>
        <button type="button" class="ph-button" data-action="camera">Take photos</button>
        <button type="button" class="ph-button" data-action="sample">Sample room</button>
      </div>
      <p class="ph-privacy">Photos stay on this device: nothing is uploaded or saved.</p>
    </section>

    <div class="ph-toolbar">
      <div class="ph-seg" role="group" aria-label="Photos shown">
        <button type="button" data-views="2">2 views</button>
        <button type="button" data-views="3">3 views</button>
        <button type="button" data-views="4">4 views</button>
      </div>
      <div class="ph-seg" role="group" aria-label="Tool">
        <button type="button" data-tool="explore">Explore</button>
        <button type="button" data-tool="match">Mark matches</button>
      </div>
      <button type="button" class="ph-toggle" data-layer="scan">Live scan</button>
      <button type="button" class="ph-toggle" data-layer="epipoles">Epipoles</button>
      <button type="button" class="ph-toggle" data-layer="pencil">Pencil of lines</button>
      <button type="button" class="ph-toggle" data-layer="matches">Matches</button>
      <span class="ph-spacer"></span>
      <button type="button" class="quiet-button" data-action="clear">Clear pins</button>
    </div>

    <div class="ph-callout" role="status" hidden></div>
    <div class="ph-frames" data-count="2"></div>

    <div class="ph-pinbar">
      <span class="ph-label">Pins</span>
      <div class="ph-pins"></div>
      <span class="ph-hint"></span>
    </div>

    <div class="ph-cards">
      <article class="ph-card ph-search">
        <header class="ph-card-head">
          <div><h2>Search along the line</h2><p>Correlation of an 11 × 11 patch around x, slid along l′ in the other photo.</p></div>
          <span class="ph-chip ph-chip-live" hidden><i></i>Live</span>
        </header>
        <div class="ph-patches">
          <figure><div class="ph-patch"><canvas width="23" height="23" data-patch="source"></canvas></div><figcaption data-caption="source">x</figcaption></figure>
          <figure><div class="ph-patch"><canvas width="23" height="23" data-patch="best"></canvas></div><figcaption data-caption="best">best on l′</figcaption></figure>
          <div class="ph-score"><b>—</b><span>peak correlation</span></div>
          <button type="button" class="ph-button ph-accept" hidden>Use as match</button>
        </div>
        <svg class="ph-profile" viewBox="0 0 600 120" preserveAspectRatio="none" role="img" aria-label="Correlation along the epipolar line"></svg>
        <div class="ph-axis"><span>0 px</span><span>position along l′</span><span data-length>— px</span></div>
        <div class="ph-legend"><span><i></i>Correlation</span><span class="ph-legend-truth"><i></i>True x′ (known in the sample room)</span></div>
        <p class="ph-verdict"></p>
      </article>

      <article class="ph-card ph-math">
        <header class="ph-card-head">
          <div><h2>Live math</h2><p data-math="subtitle"></p></div>
          <span class="ph-chip" data-math="quality"></span>
        </header>
        <div class="ph-eqs">
          <div class="ph-eq"><span>Selected point x</span><code data-math="point">—</code></div>
          <div class="ph-eq is-featured"><span>Epipolar line l′ = Fx</span><code data-math="line">—</code></div>
          <div class="ph-eq"><span data-math="match-label">Match x′</span><code data-math="match">—</code></div>
          <div class="ph-eq is-featured"><span>Constraint x′ᵀFx</span><code data-math="residual">—</code></div>
          <div class="ph-eq is-wide is-featured" data-math="transfer-card" hidden><span>Three-view transfer x″ = l₁ × l₂</span><code data-math="transfer"></code></div>
        </div>
        <div class="ph-fmatrix">
          <div><span class="ph-mini-label" data-math="f-label">F</span><pre data-math="f"></pre></div>
          <div class="ph-singular" data-math="singular"></div>
        </div>
        <div class="ph-stats" data-math="stats"></div>
      </article>
    </div>

    <article class="ph-card ph-manual" hidden>
      <header class="ph-card-head">
        <div><h2>Your matches</h2><p data-manual="summary"></p></div>
        <div class="ph-seg" role="group" aria-label="F comes from">
          <button type="button" data-fsource="auto">Automatic F</button>
          <button type="button" data-fsource="manual">F from my matches</button>
        </div>
      </header>
      <p class="ph-pending" data-manual="pending" hidden></p>
      <ol class="ph-manual-list" data-manual="list"></ol>
      <div class="ph-manual-actions">
        <button type="button" class="quiet-button" data-manual="undo">Undo last</button>
        <button type="button" class="quiet-button" data-manual="clear">Clear matches</button>
      </div>
    </article>

    <section class="ph-tips" aria-label="Tips for good photos">
      <article><b>Step, don’t turn</b><p>Epipolar geometry needs a baseline. Photos taken from one spot are related by a homography, like the 3D lab’s Near rotation preset.</p></article>
      <article><b>Pick texture</b><p>Shelves, posters, plants, and brick give the detector distinct corners. Blank walls and glass give it nothing to match.</p></article>
      <article><b>Keep the scene still</b><p>People or objects that move between shots break the single rigid geometry that F describes.</p></article>
    </section>
  </main>

  <footer><span>Photo lab · F estimated on your device with AKAZE features, RANSAC, and the normalized eight-point algorithm</span><span>NYU Tandon ROB-GY 6203</span></footer>
  <div class="ph-drop" hidden><div>Drop 2 to 4 photos of the same scene</div></div>
  <p class="ph-sr" aria-live="polite"></p>
`;

type LayerName = 'scan' | 'epipoles' | 'pencil' | 'matches';

type Status =
  | { phase: 'rendering'; progress: number }
  | { phase: 'analyzing'; progress: AnalysisProgress }
  | { phase: 'ready' }
  | { phase: 'error'; message: string };

type Gesture =
  | { kind: 'press'; view: number; point: Pixel; pointerId: number; scale: number }
  | { kind: 'place'; view: number; point: Pixel; pointerId: number; scale: number }
  | { kind: 'drag-pin'; pinId: number; pointerId: number; moved: boolean; touch: boolean }
  | { kind: 'drag-match'; pinId: number; pointerId: number; touch: boolean };

interface PinSearch {
  target: number;
  search: LineSearch | null;
  truth: { point: Pixel; visible: boolean } | null;
}

const distance = (a: Pixel, b: Pixel): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Controller for the Photo lab tab: owns state, runs the vision worker, and renders everything. */
export class PhotoLab {
  private readonly frames: PhotoFrame[];
  private readonly framesHost: HTMLElement;
  private readonly rail: HTMLElement;
  private readonly callout: HTMLElement;
  private readonly pinsHost: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly sourceChip: HTMLElement;
  private readonly sourceText: HTMLElement;
  private readonly liveRegion: HTMLElement;
  private readonly dropZone: HTMLElement;
  private readonly manualCard: HTMLElement;
  private readonly search: SearchElements;
  private readonly math: MathElements;
  private readonly manual: ManualElements;
  private readonly camera: CameraDialog;

  private views: PhotoView[] = [];
  private sourceKind: 'sample' | 'photos' = 'sample';
  private truth: SampleTruth | null = null;
  private truthErrors = new Map<string, number | null>();
  private visibleCount = 2;
  private status: Status = { phase: 'rendering', progress: 0 };
  private analysis: AnalysisResult | null = null;
  private pins: Pin[] = [];
  private activePinId: number | null = null;
  private pinSequence = 0;
  private freshPinId: number | null = null;
  private tool: 'explore' | 'match' = 'explore';
  private layers: Record<LayerName, boolean> = { scan: true, epipoles: true, pencil: false, matches: false };
  private hover: ViewPoint | null = null;
  private hoverScale = 1;
  private gesture: Gesture | null = null;
  private manualMatches: ManualMatch[] = [];
  private manualFits: ManualFit[] = [];
  private manualSequence = 0;
  private pendingManual: ViewPoint | null = null;
  private fSource: 'auto' | 'manual' = 'auto';
  private pendingImages: DecodedImage[] = [];
  private pinSearch: PinSearch | null = null;
  private token = 0;
  private hoverFrame = 0;
  private dragDepth = 0;

  constructor(private readonly root: HTMLElement, private readonly client: VisionClient) {
    root.classList.add('photo-page');
    root.innerHTML = MARKUP;
    const query = <T extends Element>(selector: string): T => root.querySelector<T>(selector)!;
    this.framesHost = query('.ph-frames');
    this.rail = query('.ph-rail');
    this.callout = query('.ph-callout');
    this.pinsHost = query('.ph-pins');
    this.hint = query('.ph-hint');
    this.sourceChip = query('.ph-source-chip');
    this.sourceText = query('.ph-source-text');
    this.liveRegion = query('.ph-sr');
    this.dropZone = query('.ph-drop');
    this.manualCard = query('.ph-manual');
    this.search = {
      root: query('.ph-search'),
      live: query('.ph-chip-live'),
      sourcePatch: query('[data-patch="source"]'),
      bestPatch: query('[data-patch="best"]'),
      sourceCaption: query('[data-caption="source"]'),
      bestCaption: query('[data-caption="best"]'),
      score: query('.ph-score b'),
      profile: query('.ph-profile'),
      length: query('[data-length]'),
      truthLegend: query('.ph-legend-truth'),
      verdict: query('.ph-verdict'),
      accept: query('.ph-accept'),
    };
    this.math = {
      subtitle: query('[data-math="subtitle"]'),
      quality: query('[data-math="quality"]'),
      point: query('[data-math="point"]'),
      line: query('[data-math="line"]'),
      match: query('[data-math="match"]'),
      matchLabel: query('[data-math="match-label"]'),
      residual: query('[data-math="residual"]'),
      transferCard: query('[data-math="transfer-card"]'),
      transfer: query('[data-math="transfer"]'),
      fundamentalLabel: query('[data-math="f-label"]'),
      fundamental: query('[data-math="f"]'),
      singular: query('[data-math="singular"]'),
      statistics: query('[data-math="stats"]'),
    };
    this.manual = {
      summary: query('[data-manual="summary"]'),
      pending: query('[data-manual="pending"]'),
      list: query('[data-manual="list"]'),
      useManual: query('[data-fsource="manual"]'),
      useAuto: query('[data-fsource="auto"]'),
    };

    const callbacks: FrameCallbacks = {
      down: (view, point, event, scale) => this.pointerDown(view, point, event, scale),
      move: (view, point, event, scale) => this.pointerMove(view, point, event, scale),
      up: (view, point, event, scale) => this.pointerUp(view, point, event, scale),
      cancel: () => this.pointerCancel(),
      leave: (view) => this.pointerLeave(view),
      key: (view, event) => this.keyDown(view, event),
    };
    this.frames = Array.from({ length: MAX_VIEWS }, (_, index) => {
      const frame = new PhotoFrame(index, callbacks);
      frame.hidden = true;
      this.framesHost.append(frame.element);
      return frame;
    });

    this.camera = new CameraDialog(root, {
      maxShots: MAX_VIEWS,
      check: (previous, next) => this.checkPair(previous, next),
      use: (shots) => void this.loadPhotos(shots, 'camera'),
      fallback: (files) => void this.addFiles(imageFilesFrom(files)),
    });
    this.bindControls();
  }

  start(): void {
    void this.loadSample();
  }

  activate(): void {
    document.addEventListener('paste', this.onPaste);
  }

  deactivate(): void {
    document.removeEventListener('paste', this.onPaste);
    this.camera.close();
    this.hover = null;
    this.gesture = null;
    this.frames.forEach((frame) => frame.hideLoupe());
  }

  /* ---------------- loading and analysis ---------------- */

  private get ready(): boolean {
    return this.status.phase === 'ready' && this.analysis !== null;
  }

  /** Pins and lines work once analysis has finished, even if it failed: F can come from hand-marked matches. */
  private get interactive(): boolean {
    return this.status.phase === 'ready' || this.status.phase === 'error';
  }

  private resetScene(kind: 'sample' | 'photos'): number {
    this.token += 1;
    this.sourceKind = kind;
    this.analysis = null;
    this.truth = null;
    this.truthErrors.clear();
    this.pins = [];
    this.activePinId = null;
    this.manualMatches = [];
    this.manualFits = [];
    this.pendingManual = null;
    this.fSource = 'auto';
    this.hover = null;
    this.pinSearch = null;
    return this.token;
  }

  async loadSample(): Promise<void> {
    const token = this.resetScene('sample');
    const width = SAMPLE_WIDTH;
    const height = SAMPLE_HEIGHT;
    this.truth = new SampleTruth(width, height);
    this.views = VIEW_KEYS.map((key, index) => ({
      key,
      label: `Camera ${key}`,
      color: VIEW_COLORS[index],
      width,
      height,
      rgba: new Uint8ClampedArray(width * height * 4),
      gray: null,
    }));
    this.views.forEach((view, index) => this.frames[index].setView(view, false));
    this.visibleCount = 2;
    this.status = { phase: 'rendering', progress: 0 };
    this.render();
    let rowsDone = 0;
    try {
      await this.client.renderSample(width, height, this.views.length, (view, startRow, endRow, rgba) => {
        if (token !== this.token) return;
        this.views[view].rgba.set(rgba, startRow * width * 4);
        this.frames[view].paintRows(rgba, startRow, endRow);
        rowsDone += endRow - startRow;
        this.status = { phase: 'rendering', progress: rowsDone / (height * this.views.length) };
        this.renderRailOnly();
      });
    } catch (error) {
      if (token === this.token) this.fail(error);
      return;
    }
    if (token !== this.token) return;
    const pinPixel = projectToPixel(this.truth.cameras[0], SAMPLE_PIN_POINT);
    if (pinPixel) this.addPin(0, pinPixel, false);
    await this.analyze(token);
  }

  private async loadPhotos(images: readonly DecodedImage[], origin: 'upload' | 'camera'): Promise<void> {
    if (images.length < MIN_VIEWS) return;
    const token = this.resetScene('photos');
    this.views = images.slice(0, MAX_VIEWS).map((image, index) => ({
      key: VIEW_KEYS[index],
      label: image.name.length > 26 ? `${image.name.slice(0, 23)}…` : image.name,
      color: VIEW_COLORS[index],
      width: image.width,
      height: image.height,
      rgba: image.rgba,
      gray: null,
    }));
    this.views.forEach((view, index) => this.frames[index].setView(view));
    this.visibleCount = this.views.length;
    this.announce(`${this.views.length} photos loaded from ${origin === 'camera' ? 'the camera' : 'your files'}. Finding matches…`);
    await this.analyze(token);
  }

  private async analyze(token: number): Promise<void> {
    this.status = { phase: 'analyzing', progress: { stage: 'engine', completed: 0, total: 1 } };
    this.render();
    try {
      const result = await this.client.analyze(
        this.views.map((view) => ({ width: view.width, height: view.height, rgba: view.rgba })),
        DEFAULT_ANALYSIS,
        (progress) => {
          if (token !== this.token) return;
          this.status = { phase: 'analyzing', progress };
          this.renderRailOnly();
        },
      );
      if (token !== this.token) return;
      this.analysis = result;
      this.views.forEach((view) => {
        view.gray ??= grayFromRgba(view.rgba, view.width, view.height);
      });
      if (this.truth) {
        result.pairs.forEach((pair) => {
          this.truthErrors.set(`${pair.source}-${pair.target}`, pair.fundamental ? this.truth!.lineError(pair.fundamental, pair.source, pair.target) : null);
        });
      }
      this.status = { phase: 'ready' };
      this.freshPinId = this.activePinId;
      this.render();
      const focus = this.focusPair();
      if (focus) this.announce(`F estimated from ${focus.inlierCount} inlier matches. Point at a photo to see its epipolar line.`);
    } catch (error) {
      if (token === this.token) this.fail(error);
    }
  }

  private fail(error: unknown): void {
    this.status = { phase: 'error', message: error instanceof Error ? error.message : String(error) };
    this.render();
  }

  private async addFiles(files: File[]): Promise<void> {
    if (!files.length) return;
    const results = await Promise.allSettled(files.slice(0, MAX_VIEWS).map((file) => decodeImageFile(file)));
    const images = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    const failures = results.flatMap((result) => (result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : 'A file could not be opened.'] : []));
    if (failures.length) this.showNotice(failures.join(' '), 'warn');
    if (files.length > MAX_VIEWS) this.showNotice(`Only the first ${MAX_VIEWS} photos are used.`, 'warn');
    this.addImages(images);
  }

  private addImages(images: readonly DecodedImage[]): void {
    if (!images.length) return;
    const combined = [...this.pendingImages, ...images].slice(0, MAX_VIEWS);
    if (combined.length < MIN_VIEWS) {
      this.pendingImages = combined;
      this.showNotice('1 photo ready. Add 1 to 3 more of the same scene, each taken a step or two to the side.', 'info');
      return;
    }
    this.pendingImages = [];
    void this.loadPhotos(combined, 'upload');
  }

  private async checkPair(previous: DecodedImage, next: DecodedImage): Promise<PairCheck | null> {
    const result = await this.client.analyze([previous, next], { ...DEFAULT_ANALYSIS, maxFeatures: 1500 }, () => undefined);
    const pair = result.pairs[0];
    if (!pair?.fundamental || pair.inlierCount < 20) return { verdict: 'overlap', inliers: pair?.inlierCount ?? 0 };
    if (pair.degenerate) return { verdict: 'rotation', inliers: pair.inlierCount };
    return { verdict: pairQuality(pair) === 'unreliable' ? 'overlap' : 'good', inliers: pair.inlierCount };
  }

  /* ---------------- geometry lookups ---------------- */

  private models(): PairModel[] {
    const automatic: PairModel[] = this.analysis?.pairs.map(({ source, target, fundamental }) => ({ source, target, fundamental })) ?? [];
    if (this.fSource !== 'manual') return automatic;
    const manual = this.manualFits.filter((fit) => fit.fundamental).map(({ source, target, fundamental }) => ({ source, target, fundamental }));
    return [...manual, ...automatic];
  }

  /** F that maps a pixel in `source` to its epipolar line in `target`. */
  private fundamental(source: number, target: number): Mat3 | null {
    return fundamentalBetween(this.models(), source, target);
  }

  private pairAnalysis(a: number, b: number): PairAnalysis | null {
    return this.analysis?.pairs.find((pair) => (pair.source === a && pair.target === b) || (pair.source === b && pair.target === a)) ?? null;
  }

  private manualFit(a: number, b: number): ManualFit | null {
    return this.manualFits.find((fit) => (fit.source === Math.min(a, b) && fit.target === Math.max(a, b))) ?? null;
  }

  private usesManual(a: number, b: number): boolean {
    return this.fSource === 'manual' && !!this.manualFit(a, b)?.fundamental;
  }

  private visible(view: number): boolean {
    return view < this.views.length && view < this.visibleCount;
  }

  private visibleViews(): number[] {
    return Array.from({ length: Math.min(this.visibleCount, this.views.length) }, (_, index) => index);
  }

  private firstOther(view: number): number {
    return this.visibleViews().find((candidate) => candidate !== view) ?? (view === 0 ? 1 : 0);
  }

  private activePin(): Pin | null {
    return this.pins.find((pin) => pin.id === this.activePinId) ?? null;
  }

  private pinLabel(pin: Pin): string {
    return `P${this.pins.indexOf(pin) + 1}`;
  }

  private focusViews(): [number, number] {
    const pin = this.activePin();
    if (pin && this.visible(pin.view)) return [pin.view, pin.match?.view ?? this.firstOther(pin.view)];
    return [0, 1];
  }

  private focusPair(): PairAnalysis | null {
    const [a, b] = this.focusViews();
    return this.pairAnalysis(a, b);
  }

  /** Pixel location of camera `source`'s epipole in `target`, if finite. */
  private epipoleIn(target: number, source: number): Pixel | null {
    const fundamental = this.fundamental(source, target);
    if (!fundamental) return null;
    const point = epipoles(fundamental).target.normalized;
    return point ? [point[0], point[1]] : null;
  }

  private ensureGray(view: PhotoView): NonNullable<PhotoView['gray']> {
    view.gray ??= grayFromRgba(view.rgba, view.width, view.height);
    return view.gray;
  }

  private searchFrom(source: number, point: Pixel, target: number): LineSearch | null {
    const fundamental = this.fundamental(source, target);
    const line = fundamental ? epipolarLine(fundamental, point) : null;
    if (!line) return null;
    return searchAlongLine(this.ensureGray(this.views[source]), point, this.ensureGray(this.views[target]), line);
  }

  /* ---------------- pins and manual matches ---------------- */

  private addPin(view: number, point: Pixel, announce = true): void {
    if (this.pins.length >= MAX_PINS) this.pins.shift();
    const pin: Pin = { id: (this.pinSequence += 1), view, x: point[0], y: point[1], color: nextPinColor(this.pins), match: null };
    this.pins.push(pin);
    this.activePinId = pin.id;
    this.freshPinId = pin.id;
    this.render();
    if (announce) this.announce(`${this.pinLabel(pin)} pinned in ${this.views[view].label} at ${point[0].toFixed(0)}, ${point[1].toFixed(0)}.`);
  }

  private removePin(id: number): void {
    this.pins = this.pins.filter((pin) => pin.id !== id);
    if (this.activePinId === id) this.activePinId = this.pins.at(-1)?.id ?? null;
    this.render();
  }

  private refitManual(): void {
    this.manualFits = viewPairs(this.views.length)
      .map(([source, target]) => fitManualPair(this.manualMatches, source, target))
      .filter((fit) => fit.count > 0);
    const anyManual = this.manualFits.some((fit) => fit.fundamental);
    if (this.fSource === 'manual' && !anyManual) this.fSource = 'auto';
    // Without an automatic estimate, the first hand-made F is the only geometry there is.
    if (this.fSource === 'auto' && anyManual && !this.analysis?.pairs.some((pair) => pair.fundamental)) this.fSource = 'manual';
  }

  private tap(view: number, point: Pixel, scale: number): void {
    if (this.tool === 'match') {
      this.tapManual(view, point);
      return;
    }
    if (!this.interactive) return;
    const active = this.activePin();
    if (active && active.view !== view && this.visible(active.view)) {
      const fundamental = this.fundamental(active.view, view);
      const line = fundamental ? epipolarLine(fundamental, [active.x, active.y]) : null;
      if (line && pointLineDistance(line, point) <= 22 * scale) {
        const [x, y] = closestPointOnLine(line, point);
        active.match = { view, x, y, origin: 'tap' };
        this.render();
        this.announce(`Match for ${this.pinLabel(active)} set in ${this.views[view].label}.`);
        return;
      }
    }
    this.addPin(view, point);
  }

  private tapManual(view: number, point: Pixel): void {
    if (!this.pendingManual || this.pendingManual.view === view) {
      this.pendingManual = { view, x: point[0], y: point[1] };
      this.render();
      this.announce('Now click the same point in another photo.');
      return;
    }
    this.manualMatches.push({
      id: (this.manualSequence += 1),
      first: this.pendingManual,
      second: { view, x: point[0], y: point[1] },
    });
    this.pendingManual = null;
    this.refitManual();
    this.render();
  }

  /* ---------------- pointer and keyboard ---------------- */

  private pointerDown(view: number, point: Pixel, event: PointerEvent, scale: number): void {
    if (!this.visible(view) || this.status.phase === 'rendering') return;
    const element = this.frames[view].element;
    const touch = event.pointerType !== 'mouse';
    if (this.tool === 'explore' && this.interactive) {
      const radius = (touch ? 22 : 13) * scale;
      const pinHit = this.pins
        .filter((pin) => pin.view === view && distance([pin.x, pin.y], point) <= radius)
        .sort((a, b) => distance([a.x, a.y], point) - distance([b.x, b.y], point))[0];
      if (pinHit) {
        this.gesture = { kind: 'drag-pin', pinId: pinHit.id, pointerId: event.pointerId, moved: false, touch };
        element.setPointerCapture(event.pointerId);
        if (this.activePinId !== pinHit.id) {
          this.activePinId = pinHit.id;
          this.render();
        }
        event.preventDefault();
        return;
      }
      const active = this.activePin();
      if (active?.match && active.match.view === view && distance([active.match.x, active.match.y], point) <= radius) {
        this.gesture = { kind: 'drag-match', pinId: active.id, pointerId: event.pointerId, touch };
        element.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
    }
    if (!touch) {
      this.gesture = { kind: 'press', view, point, pointerId: event.pointerId, scale };
      return;
    }
    this.gesture = { kind: 'place', view, point, pointerId: event.pointerId, scale };
    element.setPointerCapture(event.pointerId);
    this.hover = { view, x: point[0], y: point[1] };
    this.hoverScale = scale;
    this.frames[view].showLoupe(point, nextPinColor(this.pins));
    this.scheduleHover();
  }

  private pointerMove(view: number, point: Pixel, event: PointerEvent, scale: number): void {
    const gesture = this.gesture;
    if (gesture && 'pointerId' in gesture && gesture.pointerId !== event.pointerId) return;
    if (gesture?.kind === 'drag-pin') {
      const pin = this.pins.find((candidate) => candidate.id === gesture.pinId);
      if (!pin) return;
      pin.x = Math.min(this.views[pin.view].width, Math.max(0, point[0]));
      pin.y = Math.min(this.views[pin.view].height, Math.max(0, point[1]));
      pin.match = null;
      gesture.moved = true;
      if (gesture.touch) this.frames[pin.view].showLoupe([pin.x, pin.y], pin.color);
      this.frames[pin.view].setReadout([pin.x, pin.y]);
      this.render();
      return;
    }
    if (gesture?.kind === 'drag-match') {
      const pin = this.pins.find((candidate) => candidate.id === gesture.pinId);
      if (!pin?.match) return;
      const fundamental = this.fundamental(pin.view, pin.match.view);
      const line = fundamental ? epipolarLine(fundamental, [pin.x, pin.y]) : null;
      if (!line) return;
      const [x, y] = closestPointOnLine(line, point);
      pin.match = { ...pin.match, x, y, origin: 'tap' };
      if (gesture.touch) this.frames[pin.match.view].showLoupe([x, y], pin.color);
      this.render();
      return;
    }
    if (gesture?.kind === 'place') {
      gesture.point = point;
      this.hover = { view, x: point[0], y: point[1] };
      this.frames[view].showLoupe(point, nextPinColor(this.pins));
      this.scheduleHover();
      return;
    }
    if (event.pointerType === 'mouse' && this.visible(view)) {
      this.hover = { view, x: point[0], y: point[1] };
      this.hoverScale = scale;
      this.scheduleHover();
    }
  }

  private pointerUp(view: number, point: Pixel, event: PointerEvent, scale: number): void {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    this.gesture = null;
    this.frames.forEach((frame) => frame.hideLoupe());
    if (gesture.kind === 'drag-pin' || gesture.kind === 'drag-match') {
      this.render();
      return;
    }
    if (gesture.kind === 'place') {
      this.hover = null;
      this.tap(gesture.view, gesture.point, gesture.scale);
      return;
    }
    if (distance(gesture.point, point) < 8 * scale && view === gesture.view) this.tap(view, point, scale);
  }

  private pointerCancel(): void {
    this.gesture = null;
    this.hover = null;
    this.frames.forEach((frame) => frame.hideLoupe());
    this.scheduleHover();
  }

  private pointerLeave(view: number): void {
    if (this.gesture) return;
    if (this.hover?.view === view) {
      this.hover = null;
      this.scheduleHover();
    }
  }

  private keyDown(view: number, event: KeyboardEvent): void {
    const active = this.activePin();
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, Pixel> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key] && active && active.view === view) {
      event.preventDefault();
      active.x = Math.min(this.views[view].width, Math.max(0, active.x + moves[event.key][0]));
      active.y = Math.min(this.views[view].height, Math.max(0, active.y + moves[event.key][1]));
      active.match = null;
      this.render();
    } else if ((event.key === 'Enter' || event.key === ' ') && this.visible(view)) {
      event.preventDefault();
      this.tap(view, [this.views[view].width / 2, this.views[view].height / 2], 1);
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && active) {
      event.preventDefault();
      this.removePin(active.id);
    } else if (event.key === 'Escape' && this.pendingManual) {
      this.pendingManual = null;
      this.render();
    }
  }

  private scheduleHover(): void {
    if (this.hoverFrame) return;
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = 0;
      this.renderHover();
    });
  }

  /* ---------------- controls ---------------- */

  private bindControls(): void {
    const root = this.root;
    root.querySelectorAll<HTMLButtonElement>('[data-views]').forEach((button) => button.addEventListener('click', () => {
      const count = Number(button.dataset.views);
      if (count > this.views.length) return;
      this.visibleCount = count;
      this.pins = this.pins.filter((pin) => this.visible(pin.view));
      this.pins.forEach((pin) => {
        if (pin.match && !this.visible(pin.match.view)) pin.match = null;
      });
      if (!this.activePin()) this.activePinId = this.pins.at(-1)?.id ?? null;
      this.render();
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => button.addEventListener('click', () => {
      this.tool = button.dataset.tool === 'match' ? 'match' : 'explore';
      this.pendingManual = null;
      this.render();
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-layer]').forEach((button) => button.addEventListener('click', () => {
      const layer = button.dataset.layer as LayerName;
      this.layers[layer] = !this.layers[layer];
      if (layer === 'scan' && !this.layers.scan) this.hover = null;
      this.render();
    }));
    root.querySelector('[data-action="clear"]')!.addEventListener('click', () => {
      this.pins = [];
      this.activePinId = null;
      this.render();
    });
    root.querySelector('[data-action="sample"]')!.addEventListener('click', () => {
      this.pendingImages = [];
      void this.loadSample();
    });
    root.querySelector('[data-action="camera"]')!.addEventListener('click', () => void this.camera.open());
    root.querySelector<HTMLInputElement>('[data-input="upload"]')!.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      void this.addFiles(imageFilesFrom(input.files));
      input.value = '';
    });
    this.search.accept.addEventListener('click', () => {
      const pin = this.activePin();
      const found = this.pinSearch;
      if (!pin || !found?.search) return;
      const [x, y] = searchPosition(found.search, found.search.bestIndex);
      pin.match = { view: found.target, x, y, origin: 'suggestion' };
      this.render();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-fsource]').forEach((button) => button.addEventListener('click', () => {
      this.fSource = button.dataset.fsource === 'manual' && this.manualFits.some((fit) => fit.fundamental) ? 'manual' : 'auto';
      this.render();
    }));
    root.querySelector('[data-manual="undo"]')!.addEventListener('click', () => {
      this.manualMatches.pop();
      this.refitManual();
      this.render();
    });
    root.querySelector('[data-manual="clear"]')!.addEventListener('click', () => {
      this.manualMatches = [];
      this.pendingManual = null;
      this.refitManual();
      this.render();
    });

    const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes('Files');
    root.addEventListener('dragenter', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      this.dragDepth += 1;
      this.dropZone.hidden = false;
    });
    root.addEventListener('dragover', (event) => {
      if (hasFiles(event)) event.preventDefault();
    });
    root.addEventListener('dragleave', () => {
      this.dragDepth = Math.max(0, this.dragDepth - 1);
      if (!this.dragDepth) this.dropZone.hidden = true;
    });
    root.addEventListener('drop', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      this.dragDepth = 0;
      this.dropZone.hidden = true;
      void this.addFiles(imageFilesFrom(event.dataTransfer?.files));
    });
  }

  private readonly onPaste = (event: ClipboardEvent): void => {
    const files = imageFilesFrom(event.clipboardData?.files);
    if (!files.length) return;
    event.preventDefault();
    void this.addFiles(files);
  };

  private announce(message: string): void {
    this.liveRegion.textContent = message;
  }

  private showNotice(message: string, tone: 'info' | 'warn'): void {
    this.callout.hidden = false;
    this.callout.dataset.tone = tone;
    this.callout.textContent = message;
  }

  /* ---------------- rendering ---------------- */

  private render(): void {
    this.pinSearch = this.computePinSearch();
    this.renderFrames();
    this.renderToolbar();
    this.renderSource();
    this.renderPins();
    this.renderRailOnly();
    this.renderCallout();
    this.renderMathCard();
    this.renderManualCard();
    this.renderHover();
    this.freshPinId = null;
  }

  private computePinSearch(): PinSearch | null {
    const pin = this.activePin();
    if (!pin || !this.interactive || !this.visible(pin.view)) return null;
    const target = pin.match && this.visible(pin.match.view) ? pin.match.view : this.firstOther(pin.view);
    const point: Pixel = [pin.x, pin.y];
    return {
      target,
      search: this.searchFrom(pin.view, point, target),
      truth: this.truth?.correspondence(pin.view, point, target) ?? null,
    };
  }

  private renderFrames(): void {
    const visible = this.visibleViews();
    const active = this.activePin();
    this.framesHost.dataset.count = String(visible.length);
    this.framesHost.classList.toggle('is-busy', !this.ready && this.status.phase !== 'error');
    this.frames.forEach((frame, index) => {
      frame.hidden = !visible.includes(index);
      if (frame.element.hidden) return;
      frame.clear('matches', 'pencil', 'lines');
      frame.clearMarks();
      const view = this.views[index];
      const isSource = !!active && active.view === index;
      frame.setRole(!active ? 'view' : isSource ? 'source' : 'target', isSource);
      const keypoints = this.analysis?.features[index]?.count;
      frame.setMeta(`${view.width} × ${view.height} px${keypoints ? ` · ${formatCount(keypoints)} keypoints` : ''}`);
    });
    if (!this.interactive) {
      this.pins.filter((pin) => this.visible(pin.view)).forEach((pin) => {
        this.frames[pin.view].mark('pin', [pin.x, pin.y], { color: pin.color, label: this.pinLabel(pin), active: pin.id === this.activePinId });
      });
      return;
    }
    if (this.layers.matches) this.drawMatches();
    if (this.layers.pencil) this.drawPencil();
    this.pins.filter((pin) => this.visible(pin.view)).forEach((pin) => this.drawPin(pin, pin.id === this.activePinId));
    if (this.layers.epipoles) this.drawEpipoles();
    if (this.tool === 'match' || this.manualMatches.length) this.drawManual();
  }

  private drawPin(pin: Pin, isActive: boolean): void {
    const label = this.pinLabel(pin);
    const fresh = pin.id === this.freshPinId;
    const point: Pixel = [pin.x, pin.y];
    this.frames[pin.view].mark('pin', point, { color: pin.color, label, active: isActive, fresh });
    const match = pin.match && this.visible(pin.match.view) ? pin.match : null;

    this.visibleViews().filter((view) => view !== pin.view).forEach((target) => {
      const fundamental = this.fundamental(pin.view, target);
      const line = fundamental ? epipolarLine(fundamental, point) : null;
      const transferView = isActive && match !== null && target !== match.view;
      this.frames[target].line('lines', line, {
        color: transferView ? this.views[pin.view].color : pin.color,
        variant: transferView ? 'transfer' : isActive ? 'strong' : 'normal',
        growFrom: fresh ? (this.epipoleIn(target, pin.view) ?? [0, 0]) : null,
      });
      if (match?.view === target) {
        this.frames[target].mark('match', [match.x, match.y], { color: pin.color, label: `x′ ${label}`, title: 'Drag along the line to adjust' });
      }
      if (isActive && this.truth) {
        const truth = this.truth.correspondence(pin.view, point, target);
        if (truth) this.frames[target].mark('truth', truth.point, { label: truth.visible ? 'true x′' : 'true x′ · hidden', title: 'Exact correspondence, known only in the sample room' });
      }
      if (isActive && !match && this.pinSearch?.target === target && this.pinSearch.search && !this.pinSearch.search.flat) {
        const best = searchPosition(this.pinSearch.search, this.pinSearch.search.bestIndex);
        this.frames[target].mark('suggestion', best, { color: pin.color, label: `best match? ${formatValue(this.pinSearch.search.bestScore, 2)}` });
      }
    });

    if (isActive && match) {
      this.visibleViews().filter((view) => view !== pin.view && view !== match.view).forEach((third) => {
        const fromSource = this.fundamental(pin.view, third);
        const fromMatch = this.fundamental(match.view, third);
        if (!fromSource || !fromMatch) return;
        const result = transferPoint(fromSource, point, fromMatch, [match.x, match.y]);
        if (!result) return;
        this.frames[third].line('lines', result.fromSecond, { color: this.views[match.view].color, variant: 'transfer' });
        if (result.point && result.point[0] > -20 && result.point[0] < this.views[third].width + 20 && result.point[1] > -20 && result.point[1] < this.views[third].height + 20) {
          this.frames[third].mark('transfer', result.point, {
            label: `x″ · ${result.angleDegrees.toFixed(0)}°`,
            title: result.angleDegrees < 3 ? 'The two lines are nearly parallel: the point is close to the trifocal plane' : 'Where the two epipolar lines cross',
          });
        }
      });
    }
  }

  private drawMatches(): void {
    const [a, b] = this.focusViews();
    const pair = this.pairAnalysis(a, b);
    if (!pair || !this.visible(a) || !this.visible(b)) return;
    const inSource: number[] = [];
    const inTarget: number[] = [];
    const outSource: number[] = [];
    const outTarget: number[] = [];
    pair.matches.forEach(([x1, y1, x2, y2], index) => {
      const [first, second] = pair.inliers[index] ? [inSource, inTarget] : [outSource, outTarget];
      first.push(x1, y1);
      second.push(x2, y2);
    });
    const radius = Math.max(2, this.views[pair.source].width / 300);
    this.frames[pair.source].dots('matches', outSource, 'ph-dot-out', radius);
    this.frames[pair.target].dots('matches', outTarget, 'ph-dot-out', radius);
    this.frames[pair.source].dots('matches', inSource, 'ph-dot-in', radius);
    this.frames[pair.target].dots('matches', inTarget, 'ph-dot-in', radius);
  }

  /** Corresponding lines fanning out of both epipoles: the 3D lab's book of planes, seen in the images. */
  private drawPencil(): void {
    const [source, target] = this.focusViews();
    const fundamental = this.fundamental(source, target);
    if (!fundamental || !this.visible(source) || !this.visible(target)) return;
    const epipole = epipoles(fundamental).source.homogeneous;
    const view = this.views[source];
    const center: Pixel = [view.width / 2, view.height / 2];
    let direction: Pixel = Math.abs(epipole[2]) < 1e-12
      ? [epipole[0], epipole[1]]
      : [epipole[0] / epipole[2] - center[0], epipole[1] / epipole[2] - center[1]];
    const length = Math.hypot(direction[0], direction[1]) || 1;
    direction = [direction[0] / length, direction[1] / length];
    const across: Pixel = [-direction[1], direction[0]];
    const span = Math.min(view.width, view.height) * 0.9;
    PENCIL_COLORS.forEach((color, index) => {
      const offset = (index / (PENCIL_COLORS.length - 1) - 0.5) * span;
      const point: Pixel = [center[0] + across[0] * offset, center[1] + across[1] * offset];
      this.frames[source].line('pencil', normalizeLine(cross3(epipole, [point[0], point[1], 1])), { color, variant: 'pencil' });
      this.frames[target].line('pencil', epipolarLine(fundamental, point), { color, variant: 'pencil' });
    });
  }

  private drawEpipoles(): void {
    const visible = this.visibleViews();
    visible.forEach((target) => visible.filter((source) => source !== target).forEach((source) => {
      const fundamental = this.fundamental(source, target);
      if (!fundamental) return;
      const epipole = epipoles(fundamental).target;
      const view = this.views[target];
      const key = this.views[source].key;
      const point = epipole.normalized;
      if (point && point[0] >= 0 && point[0] <= view.width && point[1] >= 0 && point[1] <= view.height) {
        this.frames[target].mark('epipole', [point[0], point[1]], {
          label: `e · ${key}`,
          title: `Epipole: where camera ${key} sits in this image. Every line from ${key} passes through it.`,
        });
        return;
      }
      const direction: Pixel = point
        ? [point[0] - view.width / 2, point[1] - view.height / 2]
        : [epipole.homogeneous[0], epipole.homogeneous[1]];
      // Far beyond the frame, an estimated epipole can land on either side of infinity: only "nearly parallel" is reliable.
      const nearInfinity = !point || Math.hypot(direction[0], direction[1]) > 12 * Math.max(view.width, view.height);
      this.frames[target].edgeChip(direction, `e·${key}${nearInfinity ? ' ≈ ∞' : ''}`, this.views[source].color,
        nearInfinity
          ? `Camera ${key}'s epipole is near infinity, so its epipolar lines here are nearly parallel and even the side it lies on is uncertain.`
          : `Epipole of camera ${key} lies off this image; its lines converge in this direction.`);
    }));
  }

  private drawManual(): void {
    this.manualMatches.forEach((match, index) => {
      [match.first, match.second].forEach((point) => {
        if (this.visible(point.view)) this.frames[point.view].mark('manual', [point.x, point.y], { label: `m${index + 1}` });
      });
    });
    if (this.pendingManual && this.visible(this.pendingManual.view)) {
      this.frames[this.pendingManual.view].mark('pending', [this.pendingManual.x, this.pendingManual.y], { label: `m${this.manualMatches.length + 1} → ?` });
    }
  }

  private renderHover(): void {
    const hover = this.hover && this.visible(this.hover.view) && this.layers.scan ? this.hover : null;
    this.frames.forEach((frame, index) => {
      if (frame.element.hidden) return;
      frame.clear('ghost');
      frame.clearMarks(true);
      frame.setReadout(hover?.view === index ? [hover.x, hover.y] : null);
    });
    if (hover && this.interactive && this.tool === 'explore') {
      const point: Pixel = [hover.x, hover.y];
      const color = nextPinColor(this.pins);
      const frame = this.frames[hover.view];
      frame.crosshair(point, color, Math.max(10, 16 * this.hoverScale));
      this.visibleViews().filter((view) => view !== hover.view).forEach((target) => {
        const fundamental = this.fundamental(hover.view, target);
        this.frames[target].line('ghost', fundamental ? epipolarLine(fundamental, point) : null, { color, variant: 'ghost' });
      });
      const active = this.activePin();
      if (active && active.view !== hover.view) {
        const fundamental = this.fundamental(active.view, hover.view);
        const line = fundamental ? epipolarLine(fundamental, [active.x, active.y]) : null;
        if (line && pointLineDistance(line, point) <= 22 * this.hoverScale) {
          frame.mark('suggestion', closestPointOnLine(line, point), { color: active.color, label: `set x′ for ${this.pinLabel(active)}`, ghost: true });
        }
      }
    } else if (hover && this.tool === 'match') {
      this.frames[hover.view].crosshair([hover.x, hover.y], '#e9d5ff', Math.max(10, 16 * this.hoverScale));
    }
    this.renderSearchCard(hover && this.tool === 'explore' ? hover : null);
  }

  private renderSearchCard(hover: ViewPoint | null): void {
    if (!this.interactive) {
      renderSearch(this.search, null);
      return;
    }
    const pin = this.activePin();
    let source: number;
    let point: Pixel;
    let target: number;
    let found: LineSearch | null;
    let truth: PinSearch['truth'];
    let color: string;
    if (hover) {
      source = hover.view;
      point = [hover.x, hover.y];
      target = this.firstOther(source);
      found = this.searchFrom(source, point, target);
      truth = this.truth?.correspondence(source, point, target) ?? null;
      color = nextPinColor(this.pins);
    } else if (pin && this.pinSearch) {
      source = pin.view;
      point = [pin.x, pin.y];
      ({ target, search: found, truth } = this.pinSearch);
      color = pin.color;
    } else {
      renderSearch(this.search, null);
      return;
    }
    const sourceView = this.views[source];
    const targetView = this.views[target];
    let truthStep: number | null = null;
    if (found && truth) {
      const dx = found.end[0] - found.start[0];
      const dy = found.end[1] - found.start[1];
      truthStep = ((truth.point[0] - found.start[0]) * dx + (truth.point[1] - found.start[1]) * dy) / (found.length * found.length) * (found.scores.length - 1);
    }
    const best = found ? searchPosition(found, found.bestIndex) : null;
    const model: SearchModel = {
      live: !!hover,
      color,
      sourceLabel: sourceView.key,
      targetLabel: targetView.key,
      sourcePatch: { view: sourceView, x: point[0], y: point[1] },
      bestPatch: best ? { view: targetView, x: best[0], y: best[1] } : null,
      search: found,
      truthStep,
      ...this.searchVerdict(found, truth, best, targetView.key),
      canAccept: !hover && !!pin && !pin.match && !!found && !found.flat && found.bestScore > 0.5,
    };
    renderSearch(this.search, model);
  }

  private searchVerdict(
    found: LineSearch | null,
    truth: PinSearch['truth'],
    best: Pixel | null,
    targetKey: string,
  ): Pick<SearchModel, 'verdictTitle' | 'verdictText'> {
    if (!found || !best) return { verdictTitle: 'No search.', verdictText: 'The point is too close to the border, or its line misses the other photo.' };
    if (found.flat) return { verdictTitle: 'Flat patch.', verdictText: 'There is no texture around x, so every spot on l′ looks alike. The line still holds; the 1D search just can’t decide.' };
    if (truth && !truth.visible) return { verdictTitle: `Hidden in ${targetKey}.`, verdictText: 'The true match lies on l′ behind another surface, so the best correlation lands somewhere else on the line.' };
    if (found.runnerUpScore > 0.9 * found.bestScore && found.bestScore > 0.7) {
      return { verdictTitle: 'Several strong peaks.', verdictText: `Repeating texture along l′ makes even a 1D search ambiguous (peak ${found.bestScore.toFixed(2)}, runner-up ${found.runnerUpScore.toFixed(2)}).` };
    }
    if (truth) {
      const off = distance(best, truth.point);
      if (off < 4) return { verdictTitle: 'Found it.', verdictText: `The peak lands ${off.toFixed(1)} px from the true x′. The epipolar line turned a 2D search into a 1D one.` };
      return { verdictTitle: 'Misleading peak.', verdictText: `The viewpoint change distorts the patch, so the best score sits ${off.toFixed(0)} px from the true x′. Everything off l′ is still ruled out.` };
    }
    if (found.bestScore > 0.8) return { verdictTitle: 'Strong candidate.', verdictText: `A clear peak (${found.bestScore.toFixed(2)}) on l′. Only points on this line could match, so the search is 1D.` };
    return { verdictTitle: 'Weak peak.', verdictText: 'No position on l′ resembles the patch strongly, often because the viewpoint changed or the point is hidden. Tap the line to choose x′ yourself.' };
  }

  private renderToolbar(): void {
    const root = this.root;
    root.querySelectorAll<HTMLButtonElement>('[data-views]').forEach((button) => {
      const count = Number(button.dataset.views);
      button.hidden = count > Math.max(MIN_VIEWS, this.views.length);
      button.setAttribute('aria-pressed', String(count === this.visibleCount));
    });
    root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.tool === this.tool));
    });
    root.querySelectorAll<HTMLButtonElement>('[data-layer]').forEach((button) => {
      button.setAttribute('aria-pressed', String(this.layers[button.dataset.layer as LayerName]));
    });
    this.framesHost.dataset.tool = this.tool;
  }

  private renderSource(): void {
    const sample = this.sourceKind === 'sample';
    this.sourceChip.textContent = sample ? 'Sample room' : 'Your photos';
    this.sourceChip.dataset.kind = this.sourceKind;
    this.sourceText.textContent = sample
      ? '4 ray-traced views with known cameras, so every estimate can be checked against the truth.'
      : `${this.views.length} photos · ${this.views.map((view) => `${view.width}×${view.height}`).join(', ')} px`;
  }

  private renderPins(): void {
    this.pinsHost.replaceChildren();
    if (!this.pins.length) {
      const empty = document.createElement('span');
      empty.className = 'ph-hint';
      empty.textContent = 'None yet';
      this.pinsHost.append(empty);
    }
    this.pins.forEach((pin) => {
      const chip = document.createElement('div');
      chip.className = `ph-pin-chip${pin.id === this.activePinId ? ' is-active' : ''}`;
      chip.style.setProperty('--mark', pin.color);
      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'ph-pin-select';
      select.setAttribute('aria-pressed', String(pin.id === this.activePinId));
      select.innerHTML = '<i></i>';
      select.append(`${this.pinLabel(pin)} · ${this.views[pin.view]?.key ?? '?'} (${pin.x.toFixed(0)}, ${pin.y.toFixed(0)})${pin.match ? ` → ${this.views[pin.match.view]?.key}` : ''}`);
      select.addEventListener('click', () => {
        this.activePinId = pin.id;
        this.render();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ph-icon-button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${this.pinLabel(pin)}`);
      remove.addEventListener('click', () => this.removePin(pin.id));
      chip.append(select, remove);
      this.pinsHost.append(chip);
    });
    const many = this.visibleCount > 2;
    this.hint.textContent = this.tool === 'match'
      ? 'Click a point in one photo, then the same point in another. Eight pairs define F.'
      : many
        ? 'Click to pin a point. Then click its line in a second photo to choose x′; the third photo shows where it must be.'
        : 'Click to pin a point, or drag a pin. Click on its line in the other photo to choose x′. Arrow keys nudge.';
  }

  private renderRailOnly(): void {
    renderRail(this.rail, this.railSteps());
  }

  private railSteps(): RailStep[] {
    const status = this.status;
    const idle = (note: string): RailStep => ({ state: 'idle', value: '—', note });
    const visible = this.visibleViews();
    const photos: RailStep = status.phase === 'rendering'
      ? { state: 'run', value: `${Math.round(status.progress * 100)}%`, note: 'ray-tracing the sample room' }
      : { state: 'done', value: `${this.views.length} views`, note: this.views.length ? `${this.views[0].width} × ${this.views[0].height} px` : '' };
    if (status.phase === 'rendering') return [photos, idle('AKAZE detector'), idle('ratio test'), idle('robust fit'), idle('rank 2')];
    if (status.phase === 'error') {
      return [photos, { state: 'error', value: 'stopped', note: status.message }, idle('ratio test'), idle('robust fit'), idle('rank 2')];
    }
    if (status.phase === 'analyzing') {
      const { stage, completed, total } = status.progress;
      const order = ['engine', 'features', 'matching', 'estimation'];
      const at = order.indexOf(stage);
      const running = (value: string, note: string): RailStep => ({ state: 'run', value, note });
      const keypoints = at === 0
        ? running('loading', 'vision engine, first time only')
        : at === 1 ? running(`${completed}/${total}`, 'AKAZE detector') : { state: 'done' as const, value: 'found', note: 'AKAZE detector' };
      const matches = at < 2 ? idle('ratio test') : at === 2 ? running(`${completed}/${total} pairs`, 'ratio + mutual test') : { state: 'done' as const, value: 'matched', note: 'ratio + mutual test' };
      const ransac = at < 3 ? idle('robust fit') : running(`${completed}/${total} pairs`, 'eight-point samples');
      return [photos, keypoints, matches, ransac, idle('rank 2')];
    }
    const [a, b] = this.focusViews();
    const pair = this.pairAnalysis(a, b);
    const counts = visible.map((view) => `${this.views[view].key} ${formatCount(this.analysis?.features[view]?.count ?? 0)}`).join(' · ');
    const keypoints: RailStep = { state: 'done', value: counts, note: 'AKAZE corners' };
    if (!pair) return [photos, keypoints, idle('ratio test'), idle('robust fit'), idle('rank 2')];
    const key = `${this.views[a].key} ↔ ${this.views[b].key}`;
    const quality = pairQuality(pair);
    const matches: RailStep = { state: pair.matches.length >= 8 ? 'done' : 'warn', value: `${formatCount(pair.matches.length)} putative`, note: `${key} after ratio test` };
    const share = pair.matches.length ? Math.round(pair.inlierCount / pair.matches.length * 100) : 0;
    const ransac: RailStep = { state: pair.inlierCount >= 25 ? 'done' : 'warn', value: `${formatCount(pair.inlierCount)} inliers`, note: `${share}% agree · ${pair.iterations} iterations` };
    const truthError = this.truthErrors.get(`${pair.source}-${pair.target}`);
    const manual = this.usesManual(a, b);
    const fit: RailStep = manual
      ? { state: 'done', value: 'from your matches', note: `RMS ${formatValue(this.manualFit(a, b)?.rms ?? Number.NaN, 2)} px` }
      : {
        state: quality === 'unreliable' ? 'warn' : 'done',
        value: quality === 'unreliable' ? 'unreliable' : 'rank 2',
        note: truthError !== undefined && truthError !== null
          ? `${truthError.toFixed(2)} px from the true lines`
          : `RMS ${formatValue(pair.rmsSampson ?? Number.NaN, 2)} px · held-out ${formatValue(pair.heldOutError ?? Number.NaN, 2)} px`,
      };
    return [photos, keypoints, matches, ransac, fit];
  }

  private renderCallout(): void {
    if (this.status.phase === 'error') {
      this.showNotice(`The analysis stopped: ${this.status.message} Try the sample room, or mark matches by hand.`, 'warn');
      return;
    }
    if (!this.ready) {
      if (this.callout.dataset.tone !== 'info') this.callout.hidden = true;
      return;
    }
    const [a, b] = this.focusViews();
    const pair = this.pairAnalysis(a, b);
    if (!pair || this.usesManual(a, b)) {
      this.callout.hidden = true;
      return;
    }
    const names = `${this.views[a].key} and ${this.views[b].key}`;
    if (pair.degenerate) {
      this.callout.hidden = false;
      this.callout.dataset.tone = 'warn';
      this.callout.innerHTML = '';
      this.callout.append(
        `Photos ${names} look like a pure rotation or a flat surface: one homography explains the matches, so F is poorly defined. Retake from a step to the side. `,
        Object.assign(document.createElement('a'), { href: '#/lab', textContent: 'See why in the 3D lab (Near rotation preset).' }),
      );
      return;
    }
    if (pairQuality(pair) === 'unreliable') {
      this.callout.hidden = false;
      this.callout.dataset.tone = 'warn';
      this.callout.textContent = pair.inlierCount < 25
        ? `Only ${pair.inlierCount} matches agree between ${names}, so the lines may be off. Try more texture and overlap, or use Mark matches to click 8 or more pairs yourself.`
        : `The agreeing matches between ${names} cluster in one region, so lines far from it may be off. Add photos with more shared texture, or mark matches by hand.`;
      return;
    }
    this.callout.hidden = true;
  }

  private renderMathCard(): void {
    const pin = this.activePin();
    const [a, b] = this.focusViews();
    const source = pin && this.visible(pin.view) ? pin.view : a;
    const target = pin && this.pinSearch ? this.pinSearch.target : b;
    const fundamental = this.interactive ? this.fundamental(source, target) : null;
    const scaled = fundamental ? canonicalScale(fundamental) : null;
    const decomposition = scaled ? svd3(scaled) : null;
    const pair = this.pairAnalysis(source, target);
    const manual = this.usesManual(source, target);
    const manualFit = this.manualFit(source, target);
    const quality = manual ? 'fair' : pair ? pairQuality(pair) : 'unreliable';
    const keyS = this.views[source]?.key ?? 'A';
    const keyT = this.views[target]?.key ?? 'B';

    let point = '—';
    let line = '—';
    let match = '—';
    let matchLabel = 'Match x′';
    let residual = '—';
    let transfer: string | null = null;
    if (pin && scaled) {
      point = `[${pin.x.toFixed(1)}, ${pin.y.toFixed(1)}, 1]ᵀ`;
      const l = epipolarLine(scaled, [pin.x, pin.y]);
      if (l) line = `[${l[0].toFixed(4)}, ${l[1].toFixed(4)}, ${l[2].toFixed(1)}]ᵀ`;
      let candidate: Pixel | null = null;
      if (pin.match && pin.match.view === target) {
        candidate = [pin.match.x, pin.match.y];
        matchLabel = pin.match.origin === 'tap' ? 'Chosen match x′' : 'Accepted match x′';
      } else if (this.pinSearch?.truth) {
        candidate = this.pinSearch.truth.point;
        matchLabel = this.pinSearch.truth.visible ? 'True match x′ (sample)' : 'True match x′ (hidden)';
      } else if (this.pinSearch?.search && !this.pinSearch.search.flat) {
        candidate = searchPosition(this.pinSearch.search, this.pinSearch.search.bestIndex);
        matchLabel = 'Best match on l′ x′';
      }
      if (candidate) {
        match = `[${candidate[0].toFixed(1)}, ${candidate[1].toFixed(1)}, 1]ᵀ`;
        const f = scaled;
        const lx = f[0] * pin.x + f[1] * pin.y + f[2];
        const ly = f[3] * pin.x + f[4] * pin.y + f[5];
        const lz = f[6] * pin.x + f[7] * pin.y + f[8];
        const value = candidate[0] * lx + candidate[1] * ly + lz;
        residual = value === 0 ? '0 (exact in float64)' : `${value.toExponential(2)} · ${(Math.abs(value) / Math.hypot(lx, ly)).toFixed(2)} px from l′`;
      }
      if (pin.match && this.visibleCount > 2) {
        const third = this.visibleViews().find((view) => view !== pin.view && view !== pin.match!.view);
        const fromSource = third !== undefined ? this.fundamental(pin.view, third) : null;
        const fromMatch = third !== undefined ? this.fundamental(pin.match.view, third) : null;
        const result = third !== undefined && fromSource && fromMatch ? transferPoint(fromSource, [pin.x, pin.y], fromMatch, [pin.match.x, pin.match.y]) : null;
        if (result && third !== undefined) {
          const truth = this.truth?.correspondence(pin.view, [pin.x, pin.y], third) ?? null;
          transfer = !result.point
            ? `Lines are parallel in ${this.views[third].key}: the point lies on the trifocal plane.`
            : `[${result.point[0].toFixed(1)}, ${result.point[1].toFixed(1)}] in ${this.views[third].key} · lines meet at ${result.angleDegrees.toFixed(1)}°${result.angleDegrees < 3 ? ' (unstable: near the trifocal plane)' : ''}${truth ? ` · ${distance(result.point, truth.point).toFixed(2)} px from the truth` : ''}`;
        }
      }
    }

    const statistics: Statistic[] = [];
    if (manual && manualFit) {
      statistics.push({ label: 'Your matches', value: formatCount(manualFit.count) });
      statistics.push({ label: 'RMS residual', value: `${formatValue(manualFit.rms ?? Number.NaN, 2)} px`, tone: (manualFit.rms ?? 9) < 1.5 ? 'good' : 'warn' });
    } else if (pair) {
      statistics.push({ label: 'Putative matches', value: formatCount(pair.matches.length) });
      statistics.push({ label: 'RANSAC inliers', value: formatCount(pair.inlierCount), tone: pair.inlierCount >= 60 ? 'good' : pair.inlierCount >= 25 ? 'warn' : 'bad' });
      statistics.push({ label: 'RMS Sampson', value: `${formatValue(pair.rmsSampson ?? Number.NaN, 2)} px` });
      statistics.push({ label: 'Held-out error', value: pair.heldOutError === null ? 'too few' : `${formatValue(pair.heldOutError, 2)} px` });
      statistics.push({ label: 'Frame coverage', value: `${Math.round(pair.coverage * 100)}%`, tone: pair.coverage >= 0.5 ? 'good' : pair.coverage >= 0.3 ? 'warn' : 'bad' });
      statistics.push({ label: 'Rotation check', value: pair.homographyRatio === null ? '—' : `${pair.homographyRatio.toFixed(2)} ${pair.degenerate ? '· degenerate' : '· fine'}`, tone: pair.degenerate ? 'bad' : 'good' });
      const truthError = this.truthErrors.get(`${pair.source}-${pair.target}`);
      if (truthError !== undefined && truthError !== null) statistics.push({ label: 'vs. true lines', value: `${truthError.toFixed(2)} px median`, tone: truthError < 1 ? 'good' : 'warn' });
    }

    const model: MathModel = {
      subtitle: pin ? `${this.pinLabel(pin)} · ${keyS} → ${keyT}` : `${keyS} → ${keyT} · pin a point to fill in x and l′`,
      point,
      line,
      match,
      matchLabel,
      residual,
      transfer,
      fundamentalLabel: `F (${keyS} → ${keyT}), scaled to ‖F‖ = 1${manual ? ', from your matches' : ''}`,
      fundamental: scaled,
      singularValues: decomposition ? decomposition.singularValues : null,
      determinant: scaled ? scaled[0] * (scaled[4] * scaled[8] - scaled[5] * scaled[7]) - scaled[1] * (scaled[3] * scaled[8] - scaled[5] * scaled[6]) + scaled[2] * (scaled[3] * scaled[7] - scaled[4] * scaled[6]) : null,
      qualityLabel: !this.ready ? 'estimating' : manual ? 'your matches' : quality === 'strong' ? 'strong fit' : quality === 'fair' ? 'fair fit' : 'unreliable',
      qualityTone: !this.ready ? 'warn' : quality === 'strong' ? 'good' : quality === 'fair' ? 'warn' : 'bad',
      statistics,
    };
    renderMath(this.math, model);
  }

  private renderManualCard(): void {
    const show = this.tool === 'match' || this.manualMatches.length > 0;
    this.manualCard.hidden = !show;
    if (!show) return;
    const pairsWithFit = this.manualFits.filter((fit) => fit.fundamental);
    const counts = this.manualFits.map((fit) => `${this.views[fit.source].key}↔${this.views[fit.target].key} ${fit.count}/8`).join(' · ');
    const rows = this.manualMatches.map((match, index) => {
      const fit = this.manualFit(match.first.view, match.second.view);
      const ordered = match.first.view < match.second.view;
      const position = fit
        ? this.manualMatches.filter((other) => this.manualFit(other.first.view, other.second.view) === fit).indexOf(match)
        : -1;
      return {
        id: match.id,
        label: `m${index + 1}`,
        pair: ordered ? `${this.views[match.first.view].key}→${this.views[match.second.view].key}` : `${this.views[match.second.view].key}→${this.views[match.first.view].key}`,
        residual: fit?.fundamental && position >= 0 ? fit.residuals[position] : null,
      };
    });
    renderManual(this.manual, {
      pending: this.pendingManual ? `Point m${this.manualMatches.length + 1} is waiting in ${this.views[this.pendingManual.view].key}. Click the same spot in another photo.` : null,
      rows,
      summary: this.manualMatches.length
        ? `${this.manualMatches.length} marked · ${counts}${pairsWithFit.length ? ' · least-squares eight-point fit through your clicks' : ''}`
        : 'Click a point in one photo, then the same point in another. With 8 pairs the app solves for F from your clicks alone.',
      canUseManual: pairsWithFit.length > 0,
      usingManual: this.fSource === 'manual',
    }, (id) => {
      this.manualMatches = this.manualMatches.filter((match) => match.id !== id);
      this.refitManual();
      this.render();
    });
  }
}
