import type { GeometrySnapshot, Mat3, Vec3 } from '../types';

const formatNumber = (value: number, digits = 4): string => {
  if (!Number.isFinite(value)) return 'undefined';
  if (value !== 0 && (Math.abs(value) < 1e-3 || Math.abs(value) >= 1e4)) return value.toExponential(3);
  return value.toFixed(digits);
};

const formatVec = (vector: Vec3 | null | undefined): string =>
  vector ? `[${vector.map((value) => formatNumber(value)).join(', ')}]ᵀ` : 'undefined';

const formatMat = (matrix: Mat3): string => [0, 1, 2]
  .map((row) => matrix.slice(row * 3, row * 3 + 3).map((value) => formatNumber(value)).join('  '))
  .join('\n');

export class MathPanel {
  constructor(private readonly root: HTMLElement) {}

  update(snapshot: GeometrySnapshot): void {
    const xPrime = snapshot.projection2.normalized;
    const line = snapshot.ray.line2FromF;
    const residual = snapshot.residual;
    this.root.querySelector<HTMLElement>('#math-x')!.textContent = formatVec(snapshot.x);
    this.root.querySelector<HTMLElement>('#math-xprime')!.textContent = formatVec(xPrime);
    this.root.querySelector<HTMLElement>('#math-line')!.textContent = formatVec(line);
    this.root.querySelector<HTMLElement>('#math-residual')!.textContent = residual === null ? 'undefined' : residual.toExponential(4);
    this.root.querySelector<HTMLElement>('#math-r')!.textContent = formatMat(snapshot.epipolar.relativeRotation);
    this.root.querySelector<HTMLElement>('#math-t')!.textContent = formatVec(snapshot.epipolar.relativeTranslation);
    this.root.querySelector<HTMLElement>('#math-f')!.textContent = formatMat(snapshot.epipolar.fundamental);
    this.root.querySelector<HTMLElement>('#math-singular')!.textContent = formatVec(snapshot.epipolar.singularValues);
    this.root.querySelector<HTMLElement>('#math-rank')!.textContent = String(snapshot.epipolar.rank);
    this.root.querySelector<HTMLElement>('#math-e')!.textContent = formatVec(snapshot.epipolar.epipole1?.homogeneous);
    this.root.querySelector<HTMLElement>('#math-eprime')!.textContent = formatVec(snapshot.epipolar.epipole2?.homogeneous);
    this.root.querySelector<HTMLElement>('#math-agreement')!.textContent = snapshot.ray.agreementError === null
      ? 'not finite/displayable'
      : snapshot.ray.agreementError.toExponential(4);
    this.root.querySelector<HTMLElement>('#math-baseline')!.textContent = formatNumber(snapshot.baselineLength);

    const warning = document.querySelector<HTMLElement>('#geometry-warning')!;
    warning.hidden = snapshot.warning === null;
    warning.textContent = snapshot.warning ?? '';

    const badge = document.querySelector<HTMLElement>('#consistency-badge')!;
    const consistent = snapshot.ray.agreementError !== null && snapshot.ray.agreementError < 1e-8;
    badge.textContent = consistent ? '3D ↔ F verified' : snapshot.baselineLength < 1e-8 ? 'Degenerate pose' : 'No finite intersection';
    badge.classList.toggle('is-good', consistent);
  }
}
