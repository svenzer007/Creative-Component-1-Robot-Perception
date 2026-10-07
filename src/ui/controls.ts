import type { AppState, CameraControls, PresetName } from '../types';
import type { AppStore } from '../state/appState';
import { PRESETS } from '../state/appState';

type InputKey = 'u' | 'v' | 'depth' | 'cx' | 'cy' | 'cz' | 'yaw' | 'pitch';

const readNumber = (input: HTMLInputElement): number => Number.parseFloat(input.value);

export class ControlsPanel {
  private readonly inputs: Record<InputKey, HTMLInputElement>;
  private readonly outputs: Record<InputKey, HTMLOutputElement>;
  private animationFrame = 0;
  private animationDirection = 1;
  private lastAnimationTime = 0;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(
    private readonly root: HTMLElement,
    private readonly store: AppStore,
    resetView: () => void,
  ) {
    const getInput = (key: InputKey): HTMLInputElement => root.querySelector<HTMLInputElement>(`#${key}-slider`)!;
    const getOutput = (key: InputKey): HTMLOutputElement => root.querySelector<HTMLOutputElement>(`#${key}-output`)!;
    this.inputs = {
      u: getInput('u'), v: getInput('v'), depth: getInput('depth'),
      cx: getInput('cx'), cy: getInput('cy'), cz: getInput('cz'),
      yaw: getInput('yaw'), pitch: getInput('pitch'),
    };
    this.outputs = {
      u: getOutput('u'), v: getOutput('v'), depth: getOutput('depth'),
      cx: getOutput('cx'), cy: getOutput('cy'), cz: getOutput('cz'),
      yaw: getOutput('yaw'), pitch: getOutput('pitch'),
    };

    (['u', 'v', 'depth'] as const).forEach((key) => {
      this.inputs[key].addEventListener('input', () => this.store.update({ [key]: readNumber(this.inputs[key]) }));
    });
    (['cx', 'cy', 'cz', 'yaw', 'pitch'] as const).forEach((key) => {
      this.inputs[key].addEventListener('input', () => this.updateCamera());
    });
    root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
      button.addEventListener('click', () => this.store.applyPreset(button.dataset.preset as PresetName));
    });
    root.querySelector<HTMLInputElement>('#family-toggle')!.addEventListener('change', (event) => {
      this.store.update({ showFamily: (event.target as HTMLInputElement).checked });
    });
    document.querySelector<HTMLButtonElement>('#reset-view')!.addEventListener('click', resetView);
    root.querySelector<HTMLButtonElement>('#depth-play')!.addEventListener('click', () => this.play());
    root.querySelector<HTMLButtonElement>('#depth-pause')!.addEventListener('click', () => this.pause());
    root.querySelector<HTMLButtonElement>('#depth-reset')!.addEventListener('click', () => {
      this.pause();
      this.animationDirection = 1;
      this.store.update({ depth: 4.5 });
    });
    if (this.reducedMotion) {
      const play = root.querySelector<HTMLButtonElement>('#depth-play')!;
      play.disabled = true;
      play.title = 'Automatic motion is disabled by your reduced-motion preference.';
    }
  }

  update(state: AppState): void {
    const values: Record<InputKey, number> = {
      u: state.u,
      v: state.v,
      depth: state.depth,
      cx: state.camera2.center[0],
      cy: state.camera2.center[1],
      cz: state.camera2.center[2],
      yaw: state.camera2.yawDegrees,
      pitch: state.camera2.pitchDegrees,
    };
    (Object.keys(values) as InputKey[]).forEach((key) => {
      this.inputs[key].value = String(values[key]);
      const unit = key === 'yaw' || key === 'pitch' ? '°' : '';
      this.outputs[key].value = `${values[key].toFixed(key === 'depth' ? 2 : 2)}${unit}`;
    });
    this.root.querySelector<HTMLInputElement>('#family-toggle')!.checked = state.showFamily;
    this.root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
      const preset = PRESETS[button.dataset.preset as PresetName];
      const matches = preset.center.every((value, index) => Math.abs(value - state.camera2.center[index]) < 1e-9)
        && preset.yawDegrees === state.camera2.yawDegrees
        && preset.pitchDegrees === state.camera2.pitchDegrees;
      button.classList.toggle('is-active', matches);
    });
  }

  private updateCamera(): void {
    const camera2: CameraControls = {
      center: [readNumber(this.inputs.cx), readNumber(this.inputs.cy), readNumber(this.inputs.cz)],
      yawDegrees: readNumber(this.inputs.yaw),
      pitchDegrees: readNumber(this.inputs.pitch),
    };
    this.store.setCamera2(camera2);
  }

  private play(): void {
    if (this.reducedMotion || this.animationFrame) return;
    this.lastAnimationTime = performance.now();
    this.animationFrame = requestAnimationFrame(this.animateDepth);
  }

  private pause(): void {
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
  }

  private animateDepth = (time: number): void => {
    const elapsed = Math.min(0.05, (time - this.lastAnimationTime) / 1000);
    this.lastAnimationTime = time;
    let next = this.store.getState().depth + this.animationDirection * elapsed * 1.2;
    if (next >= 8) {
      next = 8;
      this.animationDirection = -1;
    } else if (next <= 1.5) {
      next = 1.5;
      this.animationDirection = 1;
    }
    this.store.update({ depth: next });
    this.animationFrame = requestAnimationFrame(this.animateDepth);
  };
}
