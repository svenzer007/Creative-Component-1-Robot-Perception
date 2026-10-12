import type { AppState } from '../types';
import type { AppStore } from '../state/appState';

export const STAGES = [
  { title: 'One pixel', caption: 'A pixel tells us a direction, not depth.' },
  { title: 'Depth ambiguity', caption: 'Every point along this ray produces the same image point x.' },
  { title: 'Second camera', caption: 'From Camera 2 these possible 3D points appear at different locations.' },
  { title: 'Epipolar plane', caption: 'The two camera centers and the viewing ray lie in one epipolar plane.' },
  { title: 'Epipolar line', caption: 'That plane intersects Camera 2’s image plane in the epipolar line.' },
  { title: 'Fundamental matrix', caption: 'F maps a point in one image to its epipolar line in the other: l′ = Fx.' },
  { title: 'Epipolar constraint', caption: 'The true correspondence must lie on that line: x′ᵀFx ≈ 0.' },
  { title: 'Epipoles', caption: 'Every epipolar line passes through its image’s epipole.' },
] as const;

export class PresentationController {
  constructor(private readonly root: HTMLElement, private readonly store: AppStore) {
    root.querySelector<HTMLButtonElement>('#presentation-start')!.addEventListener('click', () => {
      store.update({ presentation: { active: true, stage: 1 } });
    });
    root.querySelector<HTMLButtonElement>('#presentation-prev')!.addEventListener('click', () => this.move(-1));
    root.querySelector<HTMLButtonElement>('#presentation-next')!.addEventListener('click', () => this.move(1));
    root.querySelector<HTMLButtonElement>('#presentation-restart')!.addEventListener('click', () => {
      store.update({ presentation: { active: true, stage: 1 } });
    });
    root.querySelector<HTMLButtonElement>('#presentation-exit')!.addEventListener('click', () => {
      store.update({ presentation: { active: false, stage: 1 } });
    });
  }

  update(state: AppState): void {
    const overlay = this.root.querySelector<HTMLElement>('#presentation-bar')!;
    overlay.hidden = !state.presentation.active;
    this.root.classList.toggle('presentation-active', state.presentation.active);
    if (!state.presentation.active) return;
    const stage = STAGES[state.presentation.stage - 1];
    this.root.querySelector<HTMLElement>('#presentation-step')!.textContent = `Stage ${state.presentation.stage} / ${STAGES.length}`;
    this.root.querySelector<HTMLElement>('#presentation-title')!.textContent = stage.title;
    this.root.querySelector<HTMLElement>('#presentation-caption')!.textContent = stage.caption;
    this.root.querySelector<HTMLButtonElement>('#presentation-prev')!.disabled = state.presentation.stage === 1;
    this.root.querySelector<HTMLButtonElement>('#presentation-next')!.disabled = state.presentation.stage === STAGES.length;
  }

  private move(delta: number): void {
    const current = this.store.getState().presentation.stage;
    const stage = Math.max(1, Math.min(STAGES.length, current + delta));
    this.store.update({ presentation: { active: true, stage } });
  }
}
