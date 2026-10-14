# Epipolar Geometry Lab

An interactive teaching lab for **NYU Tandon ROB-GY 6203 Robot Perception — Creative Component 1**. The application develops the core idea of epipolar geometry visually before introducing its algebra.

**Core question:** Given a point in one image, where can its correspondence be in the second image?

By Stavan Christian, Ernest Saakian, and Sai Sriya Tulluri (listed alphabetically by surname), NYU Tandon School of Engineering.

The app has six tabs, linked from the bar at the top of every page:

- **Home** (`#/home`, the landing page): what the project explains and why it matters, the authors, and a card for every other tab. A live diagram shows a point sliding along one camera's ray while its image slides along one epipolar line in the other.
- **2-minute intro** (`#/intro`): a two-minute narrated intro video with chapters.
- **3D lab** (`#/lab`): synthetic normalized cameras in a 3D scene. It builds the epipolar plane and line step by step and checks the geometry against `F`.
- **Core concepts** (`#/concepts`): manipulate `x`, `x′`, `F`, intrinsics, and baseline scale to make the Fundamental and Essential Matrices visible rather than merely symbolic.
- **Photo lab** (`#/photos`): the same constraint on real images. Upload or take 2–4 photos of one scene (or start from a built-in ray-traced room), and the app estimates `F` on your device. Point at anything and its epipolar line appears in every other photo.
- **Applications** (`#/applications`): real systems that depend on epipolar geometry, each with sources.

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

## Using the 3D lab

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

## Core concepts

Core Concepts turns the two central matrices into direct-manipulation experiments. It uses the same camera convention, presets, SVD adapter, and epipolar helpers as the other tabs, but keeps its interaction state local so unfinished work survives a tab switch without coupling the labs together.

### Fundamental Matrix playground

- The lesson opens in **Forward motion**, where the visible epipole makes the shared-line geometry easiest to recognize. General, Rectified, and Near rotation retain the Lab's exact camera poses and each includes a concise observation prompt.
- Drag `x` in Image 1 and watch `l′ = Fx` move in Image 2. Drag candidate `x′` to change both the **Constraint error** `x′ᵀFx` and its true **Distance to epipolar line**. **Snap x′ to line** makes both approach numerical zero.
- The explanation follows the geometry explicitly: `x` selects a 3D viewing ray, the ray and camera centers form an epipolar plane, and that plane cuts Image 2 in `l′`. A compact disclosure then distinguishes the algebraic residual `x′ᵀFx` from geometric pixel distance.
- **Show several epipolar lines** reveals the epipolar pencil. Every plane contains the same camera baseline, so every target-image intersection passes through `e′`; finite, off-frame, and infinite epipoles receive distinct accessible markers.
- Geometry comes before algebra. The baseline explanation stays visible, while the null-space/rank proof and the seven-degree-of-freedom count live in separate **Go deeper** disclosures.
- A live **What to notice** prompt responds to the most recent drag, preset, pencil, calibration, or scale interaction. Advanced controls edit Camera 2 while Camera 1 remains the visible reference camera.

Both SVG image points support mouse, pen, touch, and arrow-key movement; hold Shift with an arrow key for a ten-pixel step.

### Essential Matrix playground

The same interactive image pair stays visible in the calibrated lesson: `x` and `x′` remain draggable with mouse, pen, touch, or keyboard while their normalized coordinates update below.

```text
x̂  = K1⁻¹x
x̂′ = K2⁻¹x′
E   = K2ᵀ F K1
E   = [t]×R
```

The displayed normalized plane is the conventional `z = 1` ray-coordinate plane, not a claim about scene depth. A compact intrinsics key identifies `fx`/`fy` as focal pixel scaling and `cx`/`cy` as the principal point. Focal length remains the primary control, while the full zero-skew intrinsics stay collapsed. The calibration experiment holds the pose fixed and reports that changing `K` changes pixel and normalized coordinates and pixel-space `F`, while pose-derived `E = [t]×R`, `R`, and `t` remain tied to the same physical geometry. `K₂ᵀFK₁` and pose-derived `E` are compared only up to homogeneous scale and sign.

A short derivation connects `x′ᵀFx = 0` to `x̂′ᵀEx̂ = 0`, and the recovery pipeline makes the dependency explicit: `F + known K₁,K₂ → E → decompose E → R, t̂`. Raw `t` retains baseline magnitude in `E = [t]×R`; its magnitude becomes unrecoverable because image geometry determines `E` only up to homogeneous scale.

The guided baseline experiment asks whether `E` reveals camera separation, then holds rotation and translation direction fixed while scaling `t → λt`. Raw `E` and `F` norms scale with `λ`, but their canonical unit-Frobenius forms, epipolar lines, and translation direction remain unchanged. Only after that observation does the page introduce the Essential Matrix's five degrees of freedom: three for rotation and two for translation direction, with metric baseline magnitude unobservable. Zero translation is reported as a degeneracy rather than normalized into a fictitious matrix.

Essential singular values and rank constraints remain available under **Go deeper** rather than interrupting the novice flow. The collapsed pose preview introduces the four `(R,t)` candidates and cheirality without implementing triangulation. **Where do F and relative pose come from?** joins the normalized eight-point pipeline to calibrated pose recovery and links to the Photo Lab's actual estimator rather than duplicating it.

## Photo lab

The Photo lab opens on a **sample room**: four views ray-traced in the browser from known cameras. Because its geometry is exact, every estimate there can be checked against the truth. Replace it with your own photos at any time; nothing is uploaded or stored, and pixels live only in memory.

### From photos to F

All processing runs in a Web Worker so the page stays responsive:

1. Photos are decoded with their EXIF orientation and scaled to at most 1280 px on the long side.
2. **AKAZE** keypoints and binary descriptors come from OpenCV.js 4.12 (WebAssembly). It is downloaded once, only when real analysis first runs.
3. Matches pass Lowe's ratio test and a mutual-best check.
4. **This project's own TypeScript** estimates `F` for every pair of views: MSAC RANSAC over minimal samples of the normalized eight-point algorithm (Hartley normalization, rank-2 enforcement), then least-squares refits on the consensus set. OpenCV.js does not export `findFundamentalMat`; writing it here keeps every step inspectable and tested.
5. A homography is fitted as well, and an ORB-SLAM-style score compares the two models. When one homography explains the matches, the photos were taken from one spot or show a flat scene, so `F` is poorly defined and the app says so. This is the photo version of the 3D lab's Near rotation preset.

Small residuals alone cannot certify `F`: inliers bunched on one wall fit a wrong model perfectly. Each pair is rated strong, fair, or unreliable from its inlier count, the share of the frame the inliers cover, and the degeneracy check. Like the 3D lab's verified badge, the math card reports honest numbers:

- the RMS Sampson error
- a **held-out error** from inliers the fit never saw
- in the sample room, the median distance from the drawn lines to the true correspondences

### Exploring

- **Live scan:** move the pointer over any photo and its epipolar line follows in every other photo.
- **Pins:** click or tap to pin up to four points; drag a pin to move it. On touch screens a magnifier shows the pixels under your finger. Arrow keys nudge the active pin.
- **Search along the line:** an 11 × 11 patch slides along `l′` with normalized cross-correlation. The profile shows the 2D search becoming a 1D search, and the card says when texture is flat, repetitive, or hidden. *Use as match* accepts the best peak.
- **Choosing x′:** click near a pin's line in another photo to place its match exactly on that line.
- **Three or four photos:** once a match is chosen, each remaining photo shows two epipolar lines, one from each view. They cross at the predicted point `x″ = (F₃₁x) × (F₃₂x′)`. The crossing angle is shown, because transfer fails near the trifocal plane through the three camera centers.
- **Layers:** epipoles, with edge chips when they fall off the frame or near infinity; the pencil of corresponding lines through both epipoles (the 3D lab's book of planes on images); and inlier and outlier matches.
- **Mark matches:** click a point in one photo, then the same point in another. With 8 or more pairs, `F` comes from a least-squares eight-point fit through your clicks alone, and each click shows its own residual. This is the fallback when automatic matching fails.

### Taking photos

*Take photos* opens a guided camera:

- **Ghost overlay:** the previous shot is overlaid on the viewfinder, so the scene stays framed while you move.
- **Live parallax meter:** about once a second it matches the live view against that shot. It reports one of three states: not enough overlap, *you turned in place*, or *good baseline*. With a good baseline the shutter turns green.
- **After-shot check:** each new photo gets an inlier count.

The camera needs HTTPS (GitHub Pages provides it) or localhost. Where live capture is unavailable, the dialog falls back to the device's own camera app. Photos can also be uploaded, dropped onto the page, or pasted. HEIC files open in Safari; other browsers ask for a JPEG.

### Good photos

Step sideways between shots rather than turning, choose a textured static scene (shelves, posters, plants), and keep people out of it. Low texture, repeated patterns, moving objects, very wide viewpoint changes, and strong lens distortion all weaken or break the estimate. The quality checks above are there to say so.

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

Requires Node.js 22.12 or newer (Vite 8's native bundler binding is skipped on older releases, which breaks `npm test`, `npm run dev`, and `npm run build`).

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
  main.ts                  starts the router and the app shell
  styles.css               shared tokens and the 3D lab's interface
  types.ts                 shared state and geometry contracts
  app/
    router.ts              hash routes (#/home, #/lab, #/photos, …) with fallback to Home
    routes.ts              the tab list; one entry per lab
    shell.ts, shell.css    route bar, lazy page mounting, keep-alive, transitions
    page.ts                mount / activate / deactivate contract for tabs
  pages/
    home/
      homePage.ts          landing page: intro, authors, a card for every tab
      heroFigure.ts        live two-camera diagram built on the lab's camera model
    intro/introPage.ts     narrated intro video with chapters
    applications/          the Applications tab (content in ui/applications*.ts)
    lab/labPage.ts         the 3D lab, mounted as a tab
    concepts/
      conceptsPage.ts      Fundamental/Essential interaction controller
      model.ts             page-local state and one derived math snapshot
      views.ts             SVG image, normalized-plane, and baseline views
      coordinates.ts       tested pointer-to-pixel mapping
    photos/
      photoPage.ts         the Photo lab tab
      photoLab.ts          controller: loading, analysis, gestures, rendering
      photoFrame.ts        one camera frame: photo, overlay, markers, loupe
      panels.ts            pipeline rail, search, math, and manual-match cards
      cameraDialog.ts      guided capture with ghost overlay and parallax meter
      imageSources.ts      decoding uploads, drops, pastes, and camera frames
      sampleTruth.ts       exact correspondences in the sample room
      model.ts             pure helpers: F lookup, coordinates, manual fits
  math/
    calibratedEpipolar.ts  raw/canonical E and F for arbitrary calibrated poses
    linearAlgebra.ts       local vector/matrix operations and SVD adapter
    camera.ts              world/camera transforms and projection
    epipolar.ts            F, epipoles, planes, intersection, clipping
  vision/
    fundamental.ts         normalized eight-point, rank 2, Sampson, exact F
    ransac.ts              MSAC for F and H, model selection, held-out error
    homography.ts          normalized DLT
    geometry2d.ts          image lines, epipoles, three-view transfer
    ncc.ts                 correlation search along an epipolar line
    features.ts            OpenCV.js adapter: AKAZE/ORB and matching only
    opencvLoader.ts        on-demand download of opencv.js as a static asset
    pipeline.ts            features → matches → F for every view pair
    worker.ts, protocol.ts, visionClient.ts   off-main-thread processing
    syntheticScene.ts      ray-traced four-camera sample room
  state/appState.ts        presets, single source of truth, derived snapshot
  scene/createScene.ts     Three.js visualization and labels
  ui/
    controls.ts            sliders, presets, and depth animation
    coordinates.ts         tested pointer-to-normalized mapping
    imagePlanes.ts         linked SVG camera panels and direct manipulation
    mathPanel.ts           live values and diagnostic reporting
    presentation.ts        eight-stage Explain mode
```

Tests live beside the modules they verify. Adding a tab means one entry in `src/app/routes.ts` plus a module under `src/pages` that exports `createPage()`.

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
- Pixel-space `l′ = Fx`, reverse lines, snapping, line-pencil convergence, and finite/infinite epipoles in Core Concepts.
- `E = [t]×R`, `F = K2⁻ᵀEK1⁻¹`, and `E ≈ K2ᵀFK1` for arbitrary source and target poses.
- Pixel/normalized constraint agreement, Essential singular structure `(σ, σ, 0)`, and raw-versus-canonical baseline scaling.
- Core Concepts pointer/keyboard interaction, intrinsic controls, route registration, and page-local persistence.

For the Photo lab, it also checks:

- The eight-point algorithm against `K₂⁻ᵀ[t]×RK₁⁻¹` from known cameras: exact without noise, rank 2, and sub-pixel under noise.
- RANSAC on data with a third outliers: inlier recovery, reproducibility for a fixed seed, and the held-out error.
- Rotation-only pairs flagged as degenerate; translated pairs accepted.
- Epipoles equal to the projected camera centers; three-view transfer landing on the true projection; collapse on the trifocal plane.
- Correlation search recovering a known shift, and flat patches flagged.
- The full OpenCV pipeline on the sample room. All six view pairs are rated strong, with median line error under 1 px against ground truth.
- Hash routing, fallback, and deep links.

## GitHub Pages deployment

The workflow at `.github/workflows/deploy-pages.yml` runs tests, type-checking, linting, and the production build before deploying `dist`. Vite's base path is configured for:

<https://svenzer007.github.io/Creative-Component-1-Robot-Perception/>

In the repository's **Settings → Pages**, select **GitHub Actions** as the source if it is not already enabled. Every push to `main` then triggers deployment; it can also be started manually from the Actions tab.

Routes live after `#` (`…/#/lab`, `…/#/concepts`, `…/#/photos`) because GitHub Pages has no single-page-app fallback; hash routes survive refreshes and deep links. The 3D lab, Core Concepts, the Photo lab, and the vision worker are separate chunks. `opencv.js` (about 11 MB with its WebAssembly embedded, served compressed) is fetched only when the Photo lab first analyzes images.

## Scope and future work

The 3D lab teaches the constraint with synthetic normalized cameras (`K = I`). Core Concepts explains `F`, calibrated `E`, rank, null spaces, and scale ambiguity. The Photo lab applies `F` to real images with automatic and manual correspondences and two- to four-view transfer.

Ideas not yet implemented:

- A rectification view that warps photos so epipolar lines become scanlines.
- A staged Explain mode for the Photo lab.
- A reconstruction tab: estimate `E` with an assumed focal length, recover the camera poses, triangulate, and show your photos in the 3D lab's scene.
- Interactive Essential-Matrix decomposition into four pose candidates and cheirality selection.
- An explicit Lab/Photo-to-Core-Concepts state handoff; the current tabs intentionally retain independent local state.
- A correspondence-learning game.
- Learned matchers (for example SuperPoint and LightGlue on WebGPU) behind the same feature interface.
