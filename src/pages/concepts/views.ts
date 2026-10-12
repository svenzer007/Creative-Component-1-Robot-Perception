import type { EpipoleResult, Mat3, Vec3 } from '../../types';
import type { CoreConceptsSnapshot } from './model';
import { IMAGE_HEIGHT, IMAGE_WIDTH } from './model';

export const formatScalar = (value: number, digits = 3): string =>
  Math.abs(value) < 1e-3 && value !== 0 ? value.toExponential(2) : value.toFixed(digits);

export const formatVector = (vector: Vec3, digits = 3): string =>
  `[${vector.map((value) => formatScalar(value, digits)).join(', ')}]ᵀ`;

export const formatMatrix = (matrix: Mat3, digits = 3): string => [0, 1, 2]
  .map((row) => matrix.slice(row * 3, row * 3 + 3).map((value) => formatScalar(value, digits)).join('  '))
  .join('\n');

const grid = (): string => {
  const vertical = [80, 160, 240, 320, 400, 480, 560]
    .map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="${IMAGE_HEIGHT}"/>`).join('');
  const horizontal = [70, 140, 210, 280, 350]
    .map((y) => `<line x1="0" y1="${y}" x2="${IMAGE_WIDTH}" y2="${y}"/>`).join('');
  return `<g class="concept-grid">${vertical}${horizontal}</g>
    <line class="concept-axis" x1="320" y1="0" x2="320" y2="420"/>
    <line class="concept-axis" x1="0" y1="210" x2="640" y2="210"/>`;
};

const segment = (
  points: readonly [Vec3, Vec3] | null,
  className: string,
  label = '',
): string => points ? `
  <line class="${className}" x1="${points[0][0]}" y1="${points[0][1]}" x2="${points[1][0]}" y2="${points[1][1]}"/>
  ${label ? `<text class="concept-line-label" x="${(points[0][0] + points[1][0]) / 2 + 7}" y="${(points[0][1] + points[1][1]) / 2 - 8}">${label}</text>` : ''}` : '';

interface EpipoleMarker {
  x: number;
  y: number;
  offscreen: boolean;
  infinite: boolean;
  angle: number;
}

export function epipoleMarker(epipole: EpipoleResult | null): EpipoleMarker | null {
  if (!epipole) return null;
  const centerX = IMAGE_WIDTH / 2;
  const centerY = IMAGE_HEIGHT / 2;
  const margin = 18;
  let x: number;
  let y: number;
  let infinite = false;
  if (epipole.finite && epipole.normalized) {
    [x, y] = epipole.normalized;
    if (x >= margin && x <= IMAGE_WIDTH - margin && y >= margin && y <= IMAGE_HEIGHT - margin) {
      return { x, y, offscreen: false, infinite: false, angle: 0 };
    }
  } else {
    infinite = true;
    x = centerX + epipole.homogeneous[0];
    y = centerY + epipole.homogeneous[1];
  }
  const dx = x - centerX;
  const dy = y - centerY;
  if (Math.hypot(dx, dy) < 1e-12) return null;
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : (dx > 0 ? IMAGE_WIDTH - margin - centerX : margin - centerX) / dx,
    dy === 0 ? Number.POSITIVE_INFINITY : (dy > 0 ? IMAGE_HEIGHT - margin - centerY : margin - centerY) / dy,
  );
  return {
    x: centerX + dx * scale,
    y: centerY + dy * scale,
    offscreen: true,
    infinite,
    angle: Math.atan2(dy, dx) * 180 / Math.PI,
  };
}

const epipoleSvg = (epipole: EpipoleResult | null, label: string): string => {
  const marker = epipoleMarker(epipole);
  if (!marker) return '';
  if (!marker.offscreen) return `
    <circle class="concept-epipole" cx="${marker.x}" cy="${marker.y}" r="7"/>
    <text class="concept-point-label epipole-label" x="${marker.x + 11}" y="${marker.y - 10}">${label}</text>`;
  const radians = marker.angle * Math.PI / 180;
  const inwardX = marker.x - Math.cos(radians) * 22;
  const inwardY = marker.y - Math.sin(radians) * 22;
  return `
    <line class="concept-epipole-arrow" x1="${inwardX}" y1="${inwardY}" x2="${marker.x}" y2="${marker.y}" marker-end="url(#epipole-arrow)"/>
    <text class="concept-point-label epipole-label" x="${Math.min(IMAGE_WIDTH - 58, Math.max(8, marker.x - 23))}" y="${Math.min(IMAGE_HEIGHT - 8, Math.max(18, marker.y - 13))}">${label}${marker.infinite ? ' ∞' : ' ↗'}</text>`;
};

const definitions = `
  <defs>
    <marker id="epipole-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z"/>
    </marker>
  </defs>`;

export function renderImagePair(
  sourceSvg: SVGSVGElement,
  targetSvg: SVGSVGElement,
  snapshot: CoreConceptsSnapshot,
): void {
  const { sourcePixel, targetPixel, showPencil } = snapshot.state;
  const sourcePencil = showPencil
    ? snapshot.pencil.map((entry, index) => `<circle class="concept-family-point family-${index}" cx="${entry.source[0]}" cy="${entry.source[1]}" r="5"/>`).join('')
    : '';
  const targetPencil = showPencil
    ? snapshot.pencil.map((entry, index) => segment(entry.clipped, `concept-family-line family-${index}`)).join('')
    : '';
  sourceSvg.innerHTML = `${definitions}${grid()}
    ${segment(snapshot.reverseLineClipped, 'concept-reverse-line', 'Fᵀx′')}
    ${sourcePencil}
    ${epipoleSvg(snapshot.epipoleSource, 'e')}
    <circle class="concept-source-point" cx="${sourcePixel[0]}" cy="${sourcePixel[1]}" r="9"/>
    <text class="concept-point-label source-label" x="${sourcePixel[0] + 13}" y="${sourcePixel[1] - 12}">x</text>`;

  const connector = snapshot.closestTarget && snapshot.fundamentalLine ? `
    <line class="concept-distance" x1="${targetPixel[0]}" y1="${targetPixel[1]}" x2="${snapshot.closestTarget[0]}" y2="${snapshot.closestTarget[1]}"/>
    <circle class="concept-foot" cx="${snapshot.closestTarget[0]}" cy="${snapshot.closestTarget[1]}" r="4"/>` : '';
  targetSvg.innerHTML = `${definitions}${grid()}
    ${targetPencil}
    ${segment(snapshot.fundamentalLineClipped, 'concept-main-line', 'l′ = Fx')}
    ${connector}
    ${epipoleSvg(snapshot.epipoleTarget, 'e′')}
    <circle class="concept-target-point" cx="${targetPixel[0]}" cy="${targetPixel[1]}" r="9"/>
    <text class="concept-point-label target-label" x="${targetPixel[0] + 13}" y="${targetPixel[1] - 12}">x′</text>
    ${snapshot.fundamentalLine ? '' : '<text class="concept-empty-message" x="320" y="210">No finite epipolar line</text>'}`;
}
