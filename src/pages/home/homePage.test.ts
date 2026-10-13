import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE_ID, ROUTES } from '../../app/routes';
import { AFFILIATION, AUTHORS, PAGE_INTROS, createPage, directoryRoutes } from './homePage';

const mounted = (): HTMLElement => {
  const container = document.createElement('section');
  createPage().mount(container);
  return container;
};

describe('Home page', () => {
  it('is the first tab and the landing route', () => {
    expect(ROUTES[0]).toMatchObject({ id: 'home', path: '/home', label: 'Home' });
    expect(DEFAULT_ROUTE_ID).toBe('home');
  });

  it('shows the three authors as equal cards, alphabetically by surname', () => {
    const container = mounted();
    const cards = [...container.querySelectorAll('.home-author')];
    expect(cards.map((card) => card.querySelector('h3')?.textContent)).toEqual(['Stavan Christian', 'Ernest Saakian', 'Sai Sriya Tulluri']);
    expect(cards.map((card) => card.querySelector('p')?.textContent)).toEqual([
      'PhD candidate, Electrical and Computer Engineering',
      'M.S. Computer Engineering',
      'M.S. Mechatronics and Robotics',
    ]);
    const surnames = AUTHORS.map((author) => author.name.split(' ').at(-1)!);
    expect([...surnames].sort()).toEqual(surnames);
    expect(new Set(cards.map((card) => card.className)).size).toBe(1);
    expect(container.querySelectorAll('.home-affiliation')).toHaveLength(1);
    expect(container.querySelector('.home-affiliation')?.textContent).toBe(AFFILIATION);
  });

  it('introduces every other tab, in bar order, with in-app links', () => {
    const container = mounted();
    const routes = directoryRoutes();
    const links = [...container.querySelectorAll<HTMLAnchorElement>('.home-page-card')];
    expect(routes.map((route) => route.id)).toEqual(ROUTES.slice(1).map((route) => route.id));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(routes.map((route) => `#${route.path}`));
    routes.forEach((route) => expect(PAGE_INTROS[route.id]?.text.length ?? 0).toBeGreaterThan(30));
    expect(container.querySelector('#home-pages-title')?.textContent).toBe('Five ways in');
  });

  it('draws the hero diagram', () => {
    const svg = mounted().querySelector('.home-figure svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.querySelectorAll('circle').length).toBeGreaterThan(8);
  });
});
