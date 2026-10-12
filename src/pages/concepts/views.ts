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
  const side = label === 'e' ? 'source' : 'target';
  const location = marker.infinite ? 'at infinity' : marker.offscreen ? 'outside the visible image' : 'inside the visible image';
  const description = `${side} epipole ${label}, where the camera baseline meets the ${side} image plane; ${location}`;
  if (!marker.offscreen) return `<g role="img" aria-label="${description}"><title>${description}</title>
    <circle class="concept-epipole" cx="${marker.x}" cy="${marker.y}" r="7"/>
    <text class="concept-point-label epipole-label" x="${marker.x + 11}" y="${marker.y - 10}">${label}</text></g>`;
  const radians = marker.angle * Math.PI / 180;
  const inwardX = marker.x - Math.cos(radians) * 22;
  const inwardY = marker.y - Math.sin(radians) * 22;
  return `<g role="img" aria-label="${description}"><title>${description}</title>
    <line class="concept-epipole-arrow" x1="${inwardX}" y1="${inwardY}" x2="${marker.x}" y2="${marker.y}" marker-end="url(#epipole-arrow)"/>
    <text class="concept-point-label epipole-label" x="${Math.min(IMAGE_WIDTH - 58, Math.max(8, marker.x - 23))}" y="${Math.min(IMAGE_HEIGHT - 8, Math.max(18, marker.y - 13))}">${label}${marker.infinite ? ' ∞' : ' ↗'}</text></g>`;
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
  showPencil = snapshot.state.showPencil,
): void {
  const { sourcePixel, targetPixel } = snapshot.state;
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

export function renderNormalizedPlanes(
  sourceSvg: SVGSVGElement,
  targetSvg: SVGSVGElement,
  snapshot: CoreConceptsSnapshot,
): void {
  const render = (point: Vec3, role: 'source' | 'target'): string => {
    const x = 160 + point[0] * 180;
    const y = 105 + point[1] * 180;
    const roleLabel = role === 'source' ? 'x̂' : 'x̂′';
    return `
      <rect x="1" y="1" width="318" height="208" rx="9" class="normalized-frame"/>
      <g class="normalized-grid"><line x1="160" y1="14" x2="160" y2="196"/><line x1="18" y1="105" x2="302" y2="105"/></g>
      <line class="normalized-ray" x1="160" y1="105" x2="${x}" y2="${y}"/>
      <circle class="normalized-point ${role}" cx="${x}" cy="${y}" r="7"/>
      <text class="normalized-label" x="${x + 11}" y="${y - 9}">${roleLabel}</text>
      <text class="normalized-direction" x="12" y="18">ray direction [u, v, 1]ᵀ</text>
      <text class="normalized-z" x="12" y="194">normalized plane · z = 1</text>`;
  };
  sourceSvg.innerHTML = render(snapshot.sourceNormalized, 'source');
  targetSvg.innerHTML = render(snapshot.targetNormalized, 'target');
}

export function renderBaselineDiagram(svg: SVGSVGElement, snapshot: CoreConceptsSnapshot): void {
  const centerX = 120;
  const centerY = 120;
  const base = snapshot.state.camera2.center;
  const planarLength = Math.hypot(base[0], base[2]);
  const directionX = planarLength > 1e-10 ? base[0] / planarLength : 1;
  const directionY = planarLength > 1e-10 ? -base[2] / planarLength : 0;
  const visibleLength = Math.min(235, 58 + snapshot.state.baselineScale * 58);
  const targetX = centerX + directionX * visibleLength;
  const targetY = centerY + directionY * visibleLength;
  const yaw = snapshot.state.camera2.yawDegrees * Math.PI / 180;
  const headingX = Math.sin(yaw) * 25;
  const headingY = -Math.cos(yaw) * 25;
  const perpendicularX = -directionY * 11;
  const perpendicularY = directionX * 11;
  const translationEndX = targetX - directionX * Math.min(72, visibleLength * 0.55);
  const translationEndY = targetY - directionY * Math.min(72, visibleLength * 0.55);
  svg.innerHTML = `
    <defs>
      <marker id="baseline-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z"/></marker>
      <marker id="translation-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 10 5 0 10z"/></marker>
    </defs>
    <g class="pose-orbits"><circle cx="${centerX}" cy="${centerY}" r="58"/><circle cx="${centerX}" cy="${centerY}" r="116"/><circle cx="${centerX}" cy="${centerY}" r="174"/></g>
    <line class="baseline-line" x1="${centerX}" y1="${centerY}" x2="${targetX}" y2="${targetY}" marker-end="url(#baseline-arrow)"/>
    <circle class="pose-camera source" cx="${centerX}" cy="${centerY}" r="10"/>
    <text class="pose-label source" x="${centerX - 27}" y="${centerY + 30}">C₁</text>
    <circle class="pose-camera target" cx="${targetX}" cy="${targetY}" r="10"/>
    <line class="camera-heading" x1="${targetX}" y1="${targetY}" x2="${targetX + headingX}" y2="${targetY + headingY}"/>
    <text class="rotation-label" x="${targetX + headingX + 7}" y="${targetY + headingY}">R</text>
    <line class="translation-direction" x1="${targetX + perpendicularX}" y1="${targetY + perpendicularY}" x2="${translationEndX + perpendicularX}" y2="${translationEndY + perpendicularY}" marker-end="url(#translation-arrow)"/>
    <text class="translation-label" x="${(targetX + translationEndX) / 2 + perpendicularX}" y="${(targetY + translationEndY) / 2 + perpendicularY - 7}">t̂ · C₂ frame</text>
    <text class="pose-label target" x="${targetX + 13}" y="${targetY + 5}">C₂</text>
    <text class="baseline-label" x="${(centerX + targetX) / 2}" y="${(centerY + targetY) / 2 - 10}">λ = ${snapshot.state.baselineScale.toFixed(2)}×</text>`;
}
