import { describe, expect, it } from 'vitest';
import { ROUTES } from '../../app/routes';
import { createPage } from './conceptsPage';

describe('Core Concepts page', () => {
  it('is registered as a lazy top-level route without changing the default route', () => {
    const route = ROUTES.find((candidate) => candidate.id === 'concepts');
    expect(route?.path).toBe('/concepts');
    expect(route?.label).toBe('Core concepts');
  });

  it('preserves local section state across lifecycle changes', () => {
    const page = createPage();
    const container = document.createElement('section');
    page.mount(container);
    const essential = container.querySelector<HTMLButtonElement>('[data-section="essential"]')!;
    essential.click();
    page.deactivate();
    page.activate();
    expect(essential.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector<HTMLElement>('[data-essential]')!.hidden).toBe(false);
    expect(container.querySelector<HTMLElement>('[data-measurement-stage]')!.hidden).toBe(false);
  });

  it('presents the beginner learning hierarchy and notation explicitly', () => {
    const page = createPage();
    const container = document.createElement('section');
    page.mount(container);
    expect(container.querySelector('h1')?.textContent).toContain('Core Concepts of Epipolar Geometry');
    expect(container.querySelector('.concepts-symbols')?.textContent).toContain('Lowercase e/e′');
    expect(container.textContent).toContain('One point constrains its match to one line');
    expect(container.textContent).toContain('Constraint error');
    expect(container.textContent).toContain('Distance to epipolar line');
    expect(container.textContent).toContain('Show several epipolar lines');
    const presets = [...container.querySelectorAll<HTMLButtonElement>('.concepts-presets [data-preset]')];
    expect(presets.map((button) => button.dataset.preset)).toEqual(['forward', 'general', 'rectified', 'nearRotation']);
    expect(presets[0].classList.contains('is-active')).toBe(true);
    expect(container.querySelectorAll('.concepts-deep-dive')).toHaveLength(2);
    expect(container.querySelector('.concepts-proof-card')?.textContent).toContain('same baseline');
  });

  it('supports keyboard nudging and pointer selection', () => {
    const page = createPage();
    const container = document.createElement('section');
    page.mount(container);
    const source = container.querySelector<SVGSVGElement>('[data-source-svg]')!;
    const target = container.querySelector<SVGSVGElement>('[data-target-svg]')!;
    const before = Number(source.querySelector('circle.concept-source-point')!.getAttribute('cx'));
    source.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(Number(source.querySelector('circle.concept-source-point')!.getAttribute('cx'))).toBe(before + 1);

    Object.defineProperty(target, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 640, height: 420 }),
    });
    Object.defineProperty(target, 'setPointerCapture', { value: () => undefined });
    const event = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 300, clientY: 190 });
    Object.defineProperty(event, 'pointerId', { value: 7 });
    target.dispatchEvent(event);
    expect(Number(target.querySelector('circle.concept-target-point')!.getAttribute('cx'))).toBe(300);
    expect(Number(target.querySelector('circle.concept-target-point')!.getAttribute('cy'))).toBe(190);
  });

  it('keeps the shared image measurements interactive in the Essential lesson', () => {
    const page = createPage();
    const container = document.createElement('section');
    page.mount(container);
    container.querySelector<HTMLButtonElement>('[data-section="essential"]')!.click();
    const source = container.querySelector<SVGSVGElement>('[data-source-svg]')!;
    const beforePixel = Number(source.querySelector('circle.concept-source-point')!.getAttribute('cx'));
    const beforeNormalized = container.querySelector<HTMLElement>('[data-normalized-source]')!.textContent;
    source.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(Number(source.querySelector('circle.concept-source-point')!.getAttribute('cx'))).toBe(beforePixel + 1);
    expect(container.querySelector<HTMLElement>('[data-normalized-source]')!.textContent).not.toBe(beforeNormalized);
    expect(container.querySelector<HTMLElement>('[data-stage-title]')!.textContent).toContain('Essential Matrix');
    expect(container.querySelector<HTMLElement>('[data-pencil-control]')!.hidden).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('[data-snap]')!.hidden).toBe(true);
    expect(container.querySelector('.concepts-observation')?.textContent).toContain('same image measurements');
  });

  it('resets baseline scaling when Camera 2 geometry is edited', () => {
    const page = createPage();
    const container = document.createElement('section');
    page.mount(container);
    const scale = container.querySelector<HTMLInputElement>('[data-baseline-scale]')!;
    scale.value = '2';
    scale.dispatchEvent(new Event('input', { bubbles: true }));
    expect(scale.nextElementSibling?.textContent).toBe('2.00×');
    const cameraX = container.querySelector<HTMLInputElement>('[data-camera="x"]')!;
    cameraX.value = '2.1';
    cameraX.dispatchEvent(new Event('input', { bubbles: true }));
    expect(scale.value).toBe('1');
    expect(scale.nextElementSibling?.textContent).toBe('1.00×');
  });

  it('updates normalized coordinates from focal and principal-point controls', () => {
    const page = createPage();
    const container = document.createElement('section');
    page.mount(container);
    const before = container.querySelector<HTMLElement>('[data-normalized-source]')!.textContent;
    const focal = container.querySelector<HTMLInputElement>('[data-focal="1"]')!;
    focal.value = '800';
    focal.dispatchEvent(new Event('input', { bubbles: true }));
    expect(container.querySelector<HTMLElement>('[data-normalized-source]')!.textContent).not.toBe(before);
    expect(Number(container.querySelector<HTMLElement>('[data-f-calibration-change]')!.textContent)).toBeGreaterThan(0);
    expect(Number(container.querySelector<HTMLElement>('[data-e-calibration-change]')!.textContent)).toBeLessThan(1e-10);
    expect(container.querySelector<HTMLElement>('[data-notice]')!.textContent).toContain('physical pose');
    const cx = container.querySelector<HTMLInputElement>('[data-intrinsics="1:cx"]')!;
    const afterFocal = container.querySelector<HTMLElement>('[data-normalized-source]')!.textContent;
    cx.value = '280';
    cx.dispatchEvent(new Event('input', { bubbles: true }));
    expect(container.querySelector<HTMLElement>('[data-normalized-source]')!.textContent).not.toBe(afterFocal);
  });

  it('renders accessible epipole descriptions for the current preset', () => {
    const page = createPage();
    const container = document.createElement('section');
    page.mount(container);
    const descriptions = [...container.querySelectorAll<SVGGElement>('g[aria-label*="epipole"]')]
      .map((group) => group.getAttribute('aria-label'));
    expect(descriptions.some((description) => description?.includes('target epipole e′'))).toBe(true);
    container.querySelector<HTMLButtonElement>('[data-preset="rectified"]')!.click();
    const infinite = [...container.querySelectorAll<SVGGElement>('g[aria-label*="epipole"]')]
      .map((group) => group.getAttribute('aria-label'));
    expect(infinite.some((description) => description?.includes('at infinity'))).toBe(true);
  });

  it('links the supporting estimator lesson to the existing labs', () => {
    const page = createPage();
    const container = document.createElement('section');
    page.mount(container);
    const links = [...container.querySelectorAll<HTMLAnchorElement>('.bridge-actions a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['#/photos', '#/lab']);
    expect(container.querySelector('.estimation-flow')?.textContent).toContain('Af = 0');
    expect(container.querySelector('.estimation-flow')?.textContent).toContain('rank(F) = 2');
  });
});
