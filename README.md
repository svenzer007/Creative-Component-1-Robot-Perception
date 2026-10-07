# Epipolar Geometry Lab

An interactive 3D teaching lab for **NYU Tandon ROB-GY 6203 Robot Perception — Creative Component 1**. The application develops the core idea of epipolar geometry visually before introducing its algebra.

**Core question:** Given a point in one image, where can its correspondence be in the second image?

Phase 1 uses synthetic normalized cameras. It contains no uploaded photographs and does not estimate a fundamental matrix from image data.

## Conceptual walkthrough

1. A normalized Camera-1 image point `x = [u, v, 1]ᵀ` identifies a direction, not a depth.
2. Every positive depth on the ray `X(λ) = λx` projects to the same Camera-1 point.
3. Camera 2 sees those possible 3D points at different positions `x′`.
4. The baseline, Camera-1 ray, and both camera centers define an epipolar plane.
5. That plane intersects Camera 2's image plane in one epipolar line `l′`.
6. The fundamental matrix expresses the same construction algebraically: `l′ = Fx`.
7. A true correspondence lies on that line, so `x′ᵀFx ≈ 0` numerically.
8. A family of epipolar planes shares the baseline. Its image lines meet at the epipoles.

The app deliberately computes the physical line and the algebraic line independently. The 3D scene intersects two world-space planes; a separate calculation evaluates `Fx`. The live **3D ↔ F verified** badge reports their agreement.

## Mathematical model and conventions

The implementation uses **world-to-camera extrinsics** everywhere:

```text
Xc = R (Xw - C)
P  = K [R | -RC]
```

The virtual image plane lies at local camera coordinate `z = 1`. A finite local point `[Xc, Yc, Zc]ᵀ` projects to normalized coordinates `[Xc/Zc, Yc/Zc, 1]ᵀ`.

For Phase 1:

```text
K1 = K2 = I
C1 = [0, 0, 0]ᵀ
R1 = I

Rrel = R2 R1ᵀ
trel = R2 (C1 - C2)
E    = [trel]× Rrel
F    = E
```

For general intrinsics, `F = K2⁻ᵀ E K1⁻¹`.

The selected point and its constraint are:

```text
x  = [u, v, 1]ᵀ
l′ = Fx
x′ᵀFx ≈ 0
```

The code computes epipoles numerically with an SVD:

```text
Fe = 0       (right null space; epipole in image 1)
Fᵀe′ = 0    (left null space; epipole in image 2)
```

For a valid translated two-camera configuration, `F` has numerical rank 2. A zero baseline gives `t = 0`, so `E = F = 0`; the app explains this degeneracy instead of displaying undefined geometry.

### Independent 3D construction

For the Camera-1 point `x`, the world-space ray direction is:

```text
dworld = R1ᵀx
```

With baseline `b = C2 - C1`, the epipolar plane normal is:

```text
nepi = b × dworld
nepi · (X - C1) = 0
```

Camera 2's physical virtual image plane is built from:

```text
p2 = C2 + R2ᵀ[0, 0, 1]ᵀ
n2 = R2ᵀ[0, 0, 1]ᵀ
n2 · (X - p2) = 0
```

The Three.js epipolar line is the actual intersection of these two world planes. Its endpoints are transformed back to Camera-2 coordinates and verified to have `z = 1`. Only then are they clipped to the visible plane. Separately, `l′ = Fx` is computed and compared up to homogeneous scale and sign.

`ml-matrix` supplies the SVD used for rank and null spaces. It is isolated in a small adapter; the rest of the 3-vector and 3×3 operations are local and explicit.

## Using the interactive lab

### 3D navigation

- Drag to orbit around the construction.
- Shift-drag to pan and scroll to zoom.
- **Reset view** restores the presentation-friendly camera angle.
- Labels and the legend distinguish cameras, rays, points, planes, and lines by both text and visual style.

### Image point and depth

- Drag **x** directly in the Camera-1 image panel. This rotates the ray and epipolar plane live.
- Use the `u` and `v` sliders as precise and keyboard-accessible alternatives.
- Change `λ` to move the selected `X` along its ray. Camera-1 `x` remains fixed while Camera-2 `x′` moves along `l′`.
- **Play / Pause / Reset λ** animates depth ambiguity. Automatic animation is disabled when the operating system requests reduced motion.

### Camera 2

Adjust Camera 2's center, yaw, and pitch, or use these presets:

- **General:** translated and modestly rotated two-view geometry.
- **Rectified:** equal orientations and a horizontal baseline; epipolar lines become horizontal.
- **Forward:** translation mainly along the optical direction; the epipole moves near the image center.
- **Near rotation:** a tiny baseline demonstrates why pure rotation is epipolarly degenerate.

The allowed controls can place a point behind Camera 2 or on its `z = 0` plane. The app reports this explicitly and suppresses invalid visible markers rather than producing NaNs.

### Book of planes

Enable **Show family of epipolar planes** to reveal four additional rays and translucent “pages” hinged around the baseline. Their lines converge at `e` and `e′` when those epipoles are finite; edge or infinity indicators handle off-screen cases.

### Live math

The primary cards keep `x`, `x′`, `l′ = Fx`, and the actual `x′ᵀFx` residual visible. Expand **Advanced matrices and verification** for `Rrel`, `trel`, `F`, singular values, numerical rank, epipoles, baseline length, and the independent 3D/F line-agreement error.

## Recommended 2–4 minute narration

1. Start **Explain mode**. On Stage 1, drag `x` and emphasize that one pixel defines a ray.
2. Advance to Stage 2 and animate depth: many `X` values still produce one `x`.
3. Reveal Camera 2. Point out that the candidates now project to different places.
4. Reveal the baseline and epipolar plane: `C1`, `C2`, and the Camera-1 ray are coplanar.
5. Reveal the line where that plane physically cuts Camera 2's image plane.
6. Introduce `l′ = Fx` only after the geometry is visible. Mention the green verification badge.
7. Reveal the true `x′` and its small, non-faked residual `x′ᵀFx`.
8. Finish with the book of planes and null-space equations. Optionally exit, select **Rectified**, and show the horizontal same-row search geometry.

Explain mode changes visibility layers in the live scene; it does not replace the scene with prerecorded slides.

## Development setup

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
npm run preview
```

The development server normally appears at `http://localhost:5173/Creative-Component-1-Robot-Perception/`. The production preview normally uses port 4173 with the same repository subpath.

## Project structure

```text
src/
  main.ts                  application layout and composition root
  styles.css               responsive scientific interface
  types.ts                 shared state and geometry contracts
  math/
    linearAlgebra.ts       local vector/matrix operations and SVD adapter
    camera.ts              world/camera transforms and projection
    epipolar.ts            F, epipoles, planes, intersection, clipping
  state/appState.ts        presets, single source of truth, derived snapshot
  scene/createScene.ts     Three.js visualization and labels
  ui/
    controls.ts            sliders, presets, and depth animation
    coordinates.ts         tested pointer-to-normalized mapping
    imagePlanes.ts         linked SVG camera panels and direct manipulation
    mathPanel.ts           live values and diagnostic reporting
    presentation.ts        eight-stage Explain mode
```

Tests live beside the modules they verify.

## Mathematical verification

The Vitest suite checks:

- `|x′ᵀFx|` for representative camera poses.
- `Fe ≈ 0` and `Fᵀe′ ≈ 0` from numerical null spaces.
- Numerical rank 2 for non-degenerate configurations.
- Depth invariance of `x` and movement of `x′` along one `l′`.
- Horizontal lines in rectified stereo.
- Camera-local/world-coordinate round trips.
- The world epipolar plane and Camera-2 image-plane intersection.
- Agreement between the independent 3D intersection and `Fx` up to scale/sign.
- Safe behavior for zero baselines, behind-camera points, and `z = 0` projections.
- Direct-drag coordinate conversion, bounds, Y-axis inversion, and shared-state updates.

## GitHub Pages deployment

The workflow at `.github/workflows/deploy-pages.yml` runs tests, type-checking, linting, and the production build before deploying `dist`. Vite's base path is configured for:

<https://svenzer007.github.io/Creative-Component-1-Robot-Perception/>

In the repository's **Settings → Pages**, select **GitHub Actions** as the source if it is not already enabled. Every push to `main` then triggers deployment; it can also be started manually from the Actions tab.

## Current scope

Phase 1 uses generated geometry and normalized cameras with `K = I`. It is designed to teach the constraint itself, not to process real imagery.

## Future Phase 2 — not implemented

- Upload two real photographs.
- Enter manual point correspondences.
- Implement the normalized eight-point algorithm.
- Estimate and inspect `F` from data.
- Draw epipolar lines over photographs.
- Add a correspondence-learning game.
- Optionally add automatic feature matching.
- Explore calibrated essential matrices and triangulation.
