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
    expect(container.querySelector<HTMLElement>('[data-essential-placeholder]')!.hidden).toBe(false);
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
});
