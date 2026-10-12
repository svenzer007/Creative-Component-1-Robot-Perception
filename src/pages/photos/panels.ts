import type { Mat3 } from '../../types';
import type { LineSearch } from '../../vision/ncc';
import { formatValue, type PhotoView } from './model';

/* DOM renderers for the Photo lab's side panels. They take plain view-models and own no state. */

const SVG_NS = 'http://www.w3.org/2000/svg';

export type StepState = 'idle' | 'run' | 'done' | 'warn' | 'error';

export interface RailStep {
  state: StepState;
  value: string;
  note: string;
}

export function renderRail(list: HTMLElement, steps: readonly RailStep[]): void {
  const items = list.querySelectorAll<HTMLElement>('li');
  steps.forEach((step, index) => {
    const item = items[index];
    if (!item) return;
    item.dataset.state = step.state;
    item.querySelector('.ph-step-value')!.textContent = step.value;
    item.querySelector('.ph-step-note')!.textContent = step.note;
  });
}

export interface PatchRef {
  view: PhotoView;
  x: number;
  y: number;
}

export interface SearchModel {
  live: boolean;
  color: string;
  sourceLabel: string;
  targetLabel: string;
  sourcePatch: PatchRef | null;
  bestPatch: PatchRef | null;
  search: LineSearch | null;
  /** Position of the true correspondence along the search, in steps (sample room only). */
  truthStep: number | null;
  verdictTitle: string;
  verdictText: string;
  canAccept: boolean;
}

export interface SearchElements {
  root: HTMLElement;
  live: HTMLElement;
  sourcePatch: HTMLCanvasElement;
  bestPatch: HTMLCanvasElement;
  sourceCaption: HTMLElement;
  bestCaption: HTMLElement;
  score: HTMLElement;
  profile: SVGSVGElement;
  length: HTMLElement;
  truthLegend: HTMLElement;
  verdict: HTMLElement;
  accept: HTMLButtonElement;
}

function drawPatch(canvas: HTMLCanvasElement, patch: PatchRef | null): void {
  const context = canvas.getContext('2d')!;
  const size = canvas.width;
  const half = Math.floor(size / 2);
  if (!patch) {
    context.fillStyle = '#0b1019';
    context.fillRect(0, 0, size, size);
    return;
  }
  const image = context.createImageData(size, size);
  const { view } = patch;
  const cx = Math.floor(patch.x);
  const cy = Math.floor(patch.y);
  for (let dy = -half; dy <= half; dy += 1) {
    for (let dx = -half; dx <= half; dx += 1) {
      const x = Math.min(view.width - 1, Math.max(0, cx + dx));
      const y = Math.min(view.height - 1, Math.max(0, cy + dy));
      const from = (y * view.width + x) * 4;
      const to = ((dy + half) * size + dx + half) * 4;
      image.data[to] = view.rgba[from];
      image.data[to + 1] = view.rgba[from + 1];
      image.data[to + 2] = view.rgba[from + 2];
      image.data[to + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}

const profileY = (score: number): number => 112 - (Math.max(-0.25, Math.min(1, score)) + 0.25) / 1.25 * 104;

function svgPath(parent: SVGElement, attributes: Record<string, string | number>): void {
  const path = document.createElementNS(SVG_NS, 'path');
  Object.entries(attributes).forEach(([name, value]) => path.setAttribute(name, String(value)));
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  parent.append(path);
}

export function renderSearch(elements: SearchElements, model: SearchModel | null): void {
  const { profile } = elements;
  profile.replaceChildren();
  elements.live.hidden = !model?.live;
  elements.accept.hidden = !model?.canAccept;
  elements.truthLegend.hidden = model?.truthStep === null || model?.truthStep === undefined;
  if (!model) {
    drawPatch(elements.sourcePatch, null);
    drawPatch(elements.bestPatch, null);
    elements.score.textContent = '—';
    elements.length.textContent = '— px';
    elements.verdict.innerHTML = 'Point at a photo, or pin a point, to search its epipolar line.';
    return;
  }
  elements.root.style.setProperty('--mark', model.color);
  elements.sourceCaption.textContent = `x in ${model.sourceLabel}`;
  elements.bestCaption.textContent = `best on l′ in ${model.targetLabel}`;
  drawPatch(elements.sourcePatch, model.sourcePatch);
  drawPatch(elements.bestPatch, model.bestPatch);
  const { search } = model;
  elements.score.textContent = search ? formatValue(search.bestScore, 2) : '—';
  elements.length.textContent = search ? `${search.length.toFixed(0)} px` : '— px';
  if (search) {
    [1, 0.5, 0].forEach((grid) => svgPath(profile, { d: `M0 ${profileY(grid)}H600`, class: 'ph-profile-grid' }));
    const steps = search.scores.length - 1;
    let line = '';
    let area = '';
    let open = false;
    let openX = 0;
    let lastX = 0;
    for (let i = 0; i <= steps; i += 1) {
      const score = search.scores[i];
      const x = steps ? i / steps * 600 : 0;
      if (Number.isNaN(score)) {
        if (open) area += `L${lastX.toFixed(1)} 112L${openX.toFixed(1)} 112Z`;
        open = false;
        continue;
      }
      const y = profileY(score).toFixed(1);
      if (!open) {
        line += `M${x.toFixed(1)} ${y}`;
        area += `M${x.toFixed(1)} 112L${x.toFixed(1)} ${y}`;
        open = true;
        openX = x;
      } else {
        line += `L${x.toFixed(1)} ${y}`;
        area += `L${x.toFixed(1)} ${y}`;
      }
      lastX = x;
    }
    if (open) area += `L${lastX.toFixed(1)} 112L${openX.toFixed(1)} 112Z`;
    svgPath(profile, { d: area, class: 'ph-profile-area' });
    svgPath(profile, { d: line, class: 'ph-profile-line' });
    if (model.truthStep !== null && model.truthStep >= 0 && model.truthStep <= steps && steps) {
      svgPath(profile, { d: `M${(model.truthStep / steps * 600).toFixed(1)} 6V114`, class: 'ph-profile-truth' });
    }
    if (steps) svgPath(profile, { d: `M${(search.bestIndex / steps * 600).toFixed(1)} 6V114`, class: 'ph-profile-best' });
  }
  elements.verdict.innerHTML = '';
  const title = document.createElement('strong');
  title.textContent = model.verdictTitle;
  elements.verdict.append(title, ` ${model.verdictText}`);
}

export interface Statistic {
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'bad';
}

export interface MathModel {
  subtitle: string;
  point: string;
  line: string;
  match: string;
  matchLabel: string;
  residual: string;
  transfer: string | null;
  fundamentalLabel: string;
  fundamental: Mat3 | null;
  singularValues: readonly number[] | null;
  determinant: number | null;
  qualityLabel: string;
  qualityTone: 'good' | 'warn' | 'bad';
  statistics: readonly Statistic[];
}

export interface MathElements {
  subtitle: HTMLElement;
  quality: HTMLElement;
  point: HTMLElement;
  line: HTMLElement;
  match: HTMLElement;
  matchLabel: HTMLElement;
  residual: HTMLElement;
  transferCard: HTMLElement;
  transfer: HTMLElement;
  fundamentalLabel: HTMLElement;
  fundamental: HTMLElement;
  singular: HTMLElement;
  statistics: HTMLElement;
}

export function renderMath(elements: MathElements, model: MathModel): void {
  elements.subtitle.textContent = model.subtitle;
  elements.quality.textContent = model.qualityLabel;
  elements.quality.dataset.tone = model.qualityTone;
  elements.point.textContent = model.point;
  elements.line.textContent = model.line;
  elements.matchLabel.textContent = model.matchLabel;
  elements.match.textContent = model.match;
  elements.residual.textContent = model.residual;
  elements.transferCard.hidden = model.transfer === null;
  elements.transfer.textContent = model.transfer ?? '';
  elements.fundamentalLabel.textContent = model.fundamentalLabel;
  elements.fundamental.textContent = model.fundamental
    ? [0, 1, 2].map((row) => model.fundamental!.slice(row * 3, row * 3 + 3).map((value) => formatValue(value, 4).padStart(10)).join(' ')).join('\n')
    : 'not estimated yet';
  elements.singular.replaceChildren();
  if (model.singularValues) {
    const [s1, s2, s3] = model.singularValues;
    const rows: [string, string][] = [['σ₁', formatValue(s1, 4)], ['σ₂', formatValue(s2, 4)], ['σ₃', s3 < 1e-6 ? '≈ 0' : formatValue(s3, 4)]];
    if (model.determinant !== null) rows.push(['det F', model.determinant.toExponential(1)]);
    rows.forEach(([label, value]) => {
      const row = document.createElement('span');
      const strong = document.createElement('b');
      strong.textContent = value;
      row.append(`${label} `, strong);
      elements.singular.append(row);
    });
  }
  elements.statistics.replaceChildren(...model.statistics.map((statistic) => {
    const item = document.createElement('div');
    item.className = 'ph-stat';
    if (statistic.tone) item.dataset.tone = statistic.tone;
    const label = document.createElement('span');
    label.textContent = statistic.label;
    const value = document.createElement('b');
    value.textContent = statistic.value;
    item.append(label, value);
    return item;
  }));
}

export interface ManualRow {
  id: number;
  label: string;
  pair: string;
  residual: number | null;
}

export interface ManualModel {
  pending: string | null;
  rows: readonly ManualRow[];
  summary: string;
  canUseManual: boolean;
  usingManual: boolean;
}

export interface ManualElements {
  summary: HTMLElement;
  pending: HTMLElement;
  list: HTMLElement;
  useManual: HTMLButtonElement;
  useAuto: HTMLButtonElement;
}

export function renderManual(elements: ManualElements, model: ManualModel, onRemove: (id: number) => void): void {
  elements.summary.textContent = model.summary;
  elements.pending.hidden = !model.pending;
  elements.pending.textContent = model.pending ?? '';
  elements.useManual.hidden = !model.canUseManual;
  elements.useManual.setAttribute('aria-pressed', String(model.usingManual));
  elements.useAuto.setAttribute('aria-pressed', String(!model.usingManual));
  elements.list.replaceChildren(...model.rows.map((row) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${row.label} · ${row.pair}`;
    const residual = document.createElement('b');
    residual.textContent = row.residual === null ? 'needs 8 matches' : `${row.residual.toFixed(2)} px off its line`;
    if (row.residual !== null) residual.dataset.tone = row.residual < 1.5 ? 'good' : row.residual < 4 ? 'warn' : 'bad';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ph-icon-button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${row.label}`);
    remove.addEventListener('click', () => onRemove(row.id));
    item.append(label, residual, remove);
    return item;
  }));
}
