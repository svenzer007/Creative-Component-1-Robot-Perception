import { MAX_IMAGE_SIZE, rasterize, shrink, type DecodedImage } from './imageSources';
import { VIEW_COLORS, VIEW_KEYS } from './model';

export type PairVerdict = 'good' | 'rotation' | 'overlap';

export interface PairCheck {
  verdict: PairVerdict;
  inliers: number;
}

export interface CameraDialogOptions {
  maxShots: number;
  /** Matches two images (in the vision worker) and classifies the pair. */
  check(previous: DecodedImage, next: DecodedImage): Promise<PairCheck | null>;
  use(shots: DecodedImage[]): void;
  /** Photos taken with the device's own camera app when live capture is unavailable. */
  fallback(files: FileList | null): void;
}

interface Shot {
  image: DecodedImage;
  check: PairCheck | null | 'pending';
}

const LIVE_SIZE = 480;
const CHECK_SIZE = 640;

const VERDICT_TEXT: Record<PairVerdict, string> = {
  good: 'Good baseline: enough sideways motion and shared texture.',
  rotation: 'You turned in place, or the scene is flat. Step sideways.',
  overlap: 'Too little in common. Aim back at the same scene.',
};

/**
 * Guided capture: a live viewfinder that ghosts the previous photo so the scene stays framed,
 * plus a parallax meter that matches the live view against that photo about once a second and
 * says whether the camera has moved sideways enough. Turning in place is the degenerate case
 * the 3D lab's Near rotation preset shows.
 */
export class CameraDialog {
  private readonly dialog: HTMLDialogElement;
  private readonly video: HTMLVideoElement;
  private readonly ghost: HTMLCanvasElement;
  private readonly hint: HTMLElement;
  private readonly meter: HTMLElement;
  private readonly error: HTMLElement;
  private readonly shotsList: HTMLElement;
  private readonly shutter: HTMLButtonElement;
  private readonly useButton: HTMLButtonElement;
  private readonly ghostToggle: HTMLInputElement;
  private stream: MediaStream | null = null;
  private shots: Shot[] = [];
  private liveTimer = 0;
  private liveBusy = false;
  private lastSmall: DecodedImage | null = null;
  private session = 0;

  constructor(host: HTMLElement, private readonly options: CameraDialogOptions) {
    const dialog = document.createElement('dialog');
    dialog.className = 'ph-camera';
    dialog.setAttribute('aria-labelledby', 'ph-camera-title');
    dialog.innerHTML = `
      <div class="ph-camera-head">
        <div><p class="eyebrow">Guided capture</p><h2 id="ph-camera-title">Take 2 to ${options.maxShots} photos</h2></div>
        <button type="button" class="quiet-button" data-action="cancel">Cancel</button>
      </div>
      <div class="ph-camera-stage">
        <video playsinline muted autoplay></video>
        <canvas class="ph-camera-ghost" hidden></canvas>
        <span class="ph-corner tl"></span><span class="ph-corner tr"></span><span class="ph-corner bl"></span><span class="ph-corner br"></span>
        <div class="ph-camera-meter" data-verdict="idle" hidden aria-live="polite"><i></i><span></span></div>
        <p class="ph-camera-error" role="alert" hidden></p>
      </div>
      <p class="ph-camera-hint"></p>
      <div class="ph-camera-controls">
        <label class="ph-check"><input type="checkbox" checked> Ghost of last photo</label>
        <button type="button" class="ph-shutter" aria-label="Take photo"><span></span></button>
        <button type="button" class="primary-button" data-action="use">Use photos</button>
      </div>
      <ol class="ph-camera-shots" aria-label="Photos taken"></ol>
      <p class="ph-camera-fallback">No camera in the browser? <label class="ph-link">Use your device's camera app<input type="file" accept="image/*" capture="environment" multiple hidden></label></p>
    `;
    host.append(dialog);
    this.dialog = dialog;
    this.video = dialog.querySelector('video')!;
    this.ghost = dialog.querySelector<HTMLCanvasElement>('.ph-camera-ghost')!;
    this.hint = dialog.querySelector<HTMLElement>('.ph-camera-hint')!;
    this.meter = dialog.querySelector<HTMLElement>('.ph-camera-meter')!;
    this.error = dialog.querySelector<HTMLElement>('.ph-camera-error')!;
    this.shotsList = dialog.querySelector<HTMLElement>('.ph-camera-shots')!;
    this.shutter = dialog.querySelector<HTMLButtonElement>('.ph-shutter')!;
    this.useButton = dialog.querySelector<HTMLButtonElement>('[data-action="use"]')!;
    this.ghostToggle = dialog.querySelector<HTMLInputElement>('.ph-check input')!;

    dialog.querySelector('[data-action="cancel"]')!.addEventListener('click', () => this.close());
    dialog.addEventListener('close', () => this.stop());
    this.shutter.addEventListener('click', () => void this.capture());
    this.useButton.addEventListener('click', () => {
      if (this.shots.length < 2) return;
      const images = this.shots.map((shot) => shot.image);
      this.close();
      this.options.use(images);
    });
    this.ghostToggle.addEventListener('change', () => this.updateGhost());
    dialog.querySelector<HTMLInputElement>('.ph-camera-fallback input')!.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      this.close();
      this.options.fallback(input.files);
      input.value = '';
    });
  }

  get isOpen(): boolean {
    return this.dialog.open;
  }

  async open(): Promise<void> {
    this.session += 1;
    this.shots = [];
    this.lastSmall = null;
    this.error.hidden = true;
    this.meter.hidden = true;
    this.render();
    this.dialog.showModal();
    await this.start(this.session);
  }

  close(): void {
    if (this.dialog.open) this.dialog.close();
    this.stop();
  }

  private async start(session: number): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.fail('The live camera needs a secure (https) page and a supporting browser. Use your device’s camera app below.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (session !== this.session || !this.dialog.open) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play().catch(() => undefined);
      this.shutter.disabled = false;
      this.liveTimer = window.setInterval(() => void this.liveTick(), 1000);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      this.fail(name === 'NotAllowedError'
        ? 'Camera access is blocked. Allow it in your browser’s site settings, or use your device’s camera app below.'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'No camera was found. Use your device’s camera app below, or upload photos instead.'
          : 'The camera could not start. Use your device’s camera app below, or upload photos instead.');
    }
  }

  private stop(): void {
    window.clearInterval(this.liveTimer);
    this.liveTimer = 0;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  private fail(message: string): void {
    this.error.textContent = message;
    this.error.hidden = false;
    this.shutter.disabled = true;
  }

  private frame(maxSize: number, name: string): DecodedImage | null {
    const { videoWidth, videoHeight } = this.video;
    if (!videoWidth || !videoHeight) return null;
    return rasterize(this.video, videoWidth, videoHeight, name, maxSize);
  }

  private async capture(): Promise<void> {
    if (this.shots.length >= this.options.maxShots) return;
    const image = this.frame(MAX_IMAGE_SIZE, `Camera photo ${this.shots.length + 1}`);
    if (!image) return;
    this.dialog.querySelector('.ph-camera-stage')!.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 220 });
    const previous = this.shots.at(-1);
    const shot: Shot = { image, check: previous ? 'pending' : null };
    this.shots.push(shot);
    this.lastSmall = shrink(image, LIVE_SIZE);
    this.updateGhost();
    this.render();
    if (previous) {
      const session = this.session;
      const result = await this.options.check(shrink(previous.image, CHECK_SIZE), shrink(image, CHECK_SIZE)).catch(() => null);
      if (session !== this.session) return;
      shot.check = result;
      this.render();
    }
  }

  private async liveTick(): Promise<void> {
    if (this.liveBusy || !this.lastSmall || this.shots.length >= this.options.maxShots) return;
    const live = this.frame(LIVE_SIZE, 'live');
    if (!live) return;
    this.liveBusy = true;
    const session = this.session;
    try {
      const result = await this.options.check(this.lastSmall, live);
      if (session !== this.session || !this.dialog.open) return;
      this.meter.hidden = false;
      this.meter.dataset.verdict = result?.verdict ?? 'overlap';
      this.meter.querySelector('span')!.textContent = result ? VERDICT_TEXT[result.verdict] : VERDICT_TEXT.overlap;
      this.shutter.classList.toggle('is-ready', result?.verdict === 'good');
    } finally {
      this.liveBusy = false;
    }
  }

  private updateGhost(): void {
    const last = this.shots.at(-1);
    const show = !!last && this.ghostToggle.checked;
    this.ghost.hidden = !show;
    if (!show || !last) return;
    this.ghost.width = last.image.width;
    this.ghost.height = last.image.height;
    this.ghost.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(last.image.rgba), last.image.width, last.image.height), 0, 0);
  }

  private render(): void {
    const count = this.shots.length;
    const left = this.options.maxShots - count;
    this.hint.textContent = count === 0
      ? 'Frame a scene with texture, such as shelves, posters, or plants, then take the first photo.'
      : count === 1
        ? 'Now take a step or two to the side and aim at the same spot. Turning in place gives no baseline.'
        : left > 0
          ? `Take up to ${left} more from new spots, or use these ${count} photos.`
          : `That’s ${count}. Use these photos.`;
    this.useButton.textContent = count >= 2 ? `Use ${count} photos` : 'Take at least 2';
    this.useButton.disabled = count < 2;
    this.shutter.disabled = !this.stream || left <= 0;
    if (count === 0) this.meter.hidden = true;
    this.shotsList.replaceChildren(...this.shots.map((shot, index) => {
      const item = document.createElement('li');
      const thumbnail = document.createElement('canvas');
      const small = shrink(shot.image, 160);
      thumbnail.width = small.width;
      thumbnail.height = small.height;
      thumbnail.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(small.rgba), small.width, small.height), 0, 0);
      const label = document.createElement('span');
      label.className = 'ph-shot-label';
      label.textContent = VIEW_KEYS[index] ?? String(index + 1);
      label.style.background = VIEW_COLORS[index] ?? VIEW_COLORS[0];
      const status = document.createElement('span');
      status.className = 'ph-shot-status';
      if (shot.check === 'pending') {
        status.textContent = 'Checking…';
      } else if (shot.check) {
        status.dataset.verdict = shot.check.verdict;
        status.textContent = shot.check.verdict === 'good' ? `Good · ${shot.check.inliers} inliers` : shot.check.verdict === 'rotation' ? 'Only turned?' : 'Little overlap';
      } else {
        status.textContent = index === 0 ? 'First view' : '—';
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ph-icon-button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove photo ${label.textContent}`);
      remove.addEventListener('click', () => {
        this.shots.splice(index, 1);
        this.lastSmall = this.shots.length ? shrink(this.shots[this.shots.length - 1].image, LIVE_SIZE) : null;
        this.updateGhost();
        this.render();
      });
      item.append(thumbnail, label, status, remove);
      return item;
    }));
  }
}
