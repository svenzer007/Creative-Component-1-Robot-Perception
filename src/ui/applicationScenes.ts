/**
 * Interactive illustrations for the Applications section.
 * Every scene shows the same idea: two (or more) viewpoints, a target, and the
 * viewing rays that meet at it. Move the pointer (or tap / use arrow keys) to move
 * the target. Drawings are schematic, not to scale.
 */

export interface Pt { x: number; y: number }
interface Bounds { x0: number; x1: number; y0: number; y1: number }
interface SliderDef { label: string; min: number; max: number; step: number; value: number; format: (v: number) => string }

interface SceneDef {
  hint: string;
  start: Pt;
  bounds: Bounds;
  background: string;
  eyes: (slider: number) => Pt[];
  rays?: (t: Pt, slider: number) => string;
  target: (t: Pt) => string;
  readout: (t: Pt, slider: number) => string;
  slider?: SliderDef;
  /** The two cameras used for the epipolar view (default: first two eyes). */
  pair?: (slider: number) => [Pt, Pt];
  /** Viewing directions of those two cameras in the drawing (unit vectors; default: up). */
  dirs?: (slider: number) => [Pt, Pt];
  /** Height of the target above (+) or below (−) the cameras, in drawing units. */
  height?: number;
}

const W = 400;
const H = 230;

const deg = (r: number): number => (r * 180) / Math.PI;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Angle (degrees) between the rays from a and b to t. */
export function rayAngle(a: Pt, b: Pt, t: Pt): number {
  const ux = t.x - a.x; const uy = t.y - a.y;
  const vx = t.x - b.x; const vy = t.y - b.y;
  const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
  return deg(Math.acos(clamp(cos, -1, 1)));
}

/** Is point t inside the field of view of an eye at e facing `dir` (radians, 0 = up) with half-angle `half`? */
export function inView(e: Pt, dir: number, half: number, t: Pt): boolean {
  const ang = Math.atan2(t.x - e.x, -(t.y - e.y));
  let d = ang - dir;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d) <= half;
}

function ray(a: Pt, t: Pt, cls: string): string {
  return `<line class="sc-ray ${cls}" x1="${a.x}" y1="${a.y}" x2="${t.x.toFixed(1)}" y2="${t.y.toFixed(1)}"/>`;
}
function cam(p: Pt, cls: string): string {
  return `<circle class="sc-cam ${cls}" cx="${p.x}" cy="${p.y}" r="4.5"/>`;
}
function angleText(a: Pt, b: Pt, t: Pt): string {
  const ang = rayAngle(a, b, t);
  const verdict = ang < 6 ? 'rays nearly parallel → far, depth less precise' : 'wide angle → close, depth precise';
  return `Rays meet at <b>${ang.toFixed(1)}°</b> · ${verdict}`;
}
function wedge(e: Pt, dir: number, half: number, cls: string, len = 230): string {
  const p1 = { x: e.x + len * Math.sin(dir - half), y: e.y - len * Math.cos(dir - half) };
  const p2 = { x: e.x + len * Math.sin(dir + half), y: e.y - len * Math.cos(dir + half) };
  const large = half * 2 > Math.PI ? 1 : 0;
  return `<path class="sc-fov ${cls}" d="M${e.x},${e.y} L${p1.x.toFixed(1)},${p1.y.toFixed(1)} A${len},${len} 0 ${large} 1 ${p2.x.toFixed(1)},${p2.y.toFixed(1)} Z"/>`;
}
const unit = (from: Pt, to: Pt): Pt => {
  const dx = to.x - from.x; const dy = to.y - from.y; const n = Math.hypot(dx, dy) || 1;
  return { x: dx / n, y: dy / n };
};
const stereoRays = (eyes: Pt[], t: Pt): string => ray(eyes[0], t, 'r1') + ray(eyes[1], t, 'r2');

// ---------------------------------------------------------------- scenes

const MARS_EYES = [{ x: 186, y: 168 }, { x: 214, y: 168 }];
const mars: SceneDef = {
  hint: 'Move the target rock. Both Navcams see it; their rays meet at the rock.',
  start: { x: 250, y: 70 }, bounds: { x0: 30, x1: 370, y0: 22, y1: 135 },
  eyes: () => MARS_EYES,
  height: -18,
  background: `
    <rect class="sc-mars-ground" x="0" y="0" width="${W}" height="${H}"/>
    ${[[60, 50, 14], [330, 40, 10], [90, 120, 9], [310, 115, 16], [150, 30, 7], [40, 180, 12], [360, 190, 9]]
      .map(([x, y, r]) => `<ellipse class="sc-mars-rock" cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.7}"/>`).join('')}
    <g class="sc-rover">
      <rect x="168" y="170" width="64" height="44" rx="6"/>
      ${[176, 192, 208].map((y) => `<rect class="sc-wheel" x="156" y="${y - 6}" width="10" height="13" rx="3"/><rect class="sc-wheel" x="234" y="${y - 6}" width="10" height="13" rx="3"/>`).join('')}
      <rect class="sc-mast" x="196" y="166" width="8" height="10"/>
    </g>
    <text class="sc-label sc-label-warn" x="250" y="200">B = 42.4 cm</text>`,
  target: (t) => `<ellipse class="sc-target-rock" cx="${t.x}" cy="${t.y}" rx="13" ry="9"/>`,
  readout: (t) => angleText(MARS_EYES[0], MARS_EYES[1], t),
};

const MANTIS_EYES = [{ x: 178, y: 178 }, { x: 222, y: 178 }];
const mantis: SceneDef = {
  hint: 'Move the fly. Each eye looks through a different lens of the 3D glasses.',
  start: { x: 230, y: 70 }, bounds: { x0: 30, x1: 370, y0: 20, y1: 140 },
  eyes: () => MANTIS_EYES,
  height: 10,
  background: `
    <rect class="sc-sky" x="0" y="0" width="${W}" height="${H}"/>
    <path class="sc-leaf" d="M0,230 C80,170 140,215 200,200 C260,215 320,170 400,230 Z"/>
    <path class="sc-mantis-head" d="M160,176 L240,176 L200,226 Z"/>
    <path class="sc-mantis-ant" d="M190,170 C180,140 165,128 150,122 M210,170 C220,140 235,128 250,122"/>
    <circle class="sc-lens-red" cx="178" cy="178" r="13"/><circle class="sc-lens-cyan" cx="222" cy="178" r="13"/>
    <line class="sc-glasses" x1="191" y1="178" x2="209" y2="178"/>`,
  target: (t) => `<g class="sc-fly" transform="translate(${t.x},${t.y})"><ellipse cx="0" cy="0" rx="5" ry="7"/><ellipse class="sc-wing" cx="-6" cy="-3" rx="6" ry="3.5"/><ellipse class="sc-wing" cx="6" cy="-3" rx="6" ry="3.5"/></g>`,
  readout: (t) => angleText(MANTIS_EYES[0], MANTIS_EYES[1], t),
};

const CAT = { l: { x: 92, y: 175 }, r: { x: 128, y: 175 }, dl: -0.12, dr: 0.12, half: 1.0 };
const RABBIT = { l: { x: 270, y: 180 }, r: { x: 310, y: 180 }, dl: -1.25, dr: 1.25, half: 1.4 };
function seesBoth(a: typeof CAT, t: Pt): [boolean, boolean] {
  return [inView(a.l, a.dl, a.half, t), inView(a.r, a.dr, a.half, t)];
}
const eyes: SceneDef = {
  hint: 'Move the target. Depth needs BOTH eyes to see it (schematic fields of view).',
  start: { x: 200, y: 60 }, bounds: { x0: 15, x1: 385, y0: 15, y1: 150 },
  eyes: () => [],
  pair: () => [CAT.l, CAT.r],
  dirs: () => [{ x: Math.sin(CAT.dl), y: -Math.cos(CAT.dl) }, { x: Math.sin(CAT.dr), y: -Math.cos(CAT.dr) }],
  height: 8,
  background: `
    <rect class="sc-sky" x="0" y="0" width="${W}" height="${H}"/>
    <defs><clipPath id="sc-clip-eyes"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>
    <g clip-path="url(#sc-clip-eyes)">
      ${wedge(CAT.l, CAT.dl, CAT.half, 'fov-a')}${wedge(CAT.r, CAT.dr, CAT.half, 'fov-b')}
      ${wedge(RABBIT.l, RABBIT.dl, RABBIT.half, 'fov-a')}${wedge(RABBIT.r, RABBIT.dr, RABBIT.half, 'fov-b')}
    </g>
    <circle class="sc-head" cx="110" cy="190" r="28"/><path class="sc-head" d="M86,176 L90,150 L104,166 Z M134,176 L130,150 L116,166 Z"/>
    <ellipse class="sc-head" cx="290" cy="195" rx="26" ry="24"/><ellipse class="sc-head" cx="280" cy="160" rx="6" ry="20"/><ellipse class="sc-head" cx="300" cy="160" rx="6" ry="20"/>
    ${cam(CAT.l, 'c1')}${cam(CAT.r, 'c2')}${cam(RABBIT.l, 'c1')}${cam(RABBIT.r, 'c2')}
    <text class="sc-label" x="110" y="226" text-anchor="middle">forward eyes (cat)</text>
    <text class="sc-label" x="290" y="226" text-anchor="middle">side eyes (rabbit)</text>`,
  rays: (t) => {
    const out: string[] = [];
    for (const a of [CAT, RABBIT]) {
      const [l, r] = seesBoth(a, t);
      out.push(l ? ray(a.l, t, 'r1') : ray(a.l, t, 'r-miss'), r ? ray(a.r, t, 'r2') : ray(a.r, t, 'r-miss'));
    }
    return out.join('');
  },
  target: (t) => `<circle class="sc-target" cx="${t.x}" cy="${t.y}" r="7"/>`,
  readout: (t) => {
    const fmt = (name: string, a: typeof CAT): string => {
      const [l, r] = seesBoth(a, t);
      return `${name}: ${l && r ? '<b class="ok">both eyes → depth ✓</b>' : '<b class="no">one eye or none → no depth</b>'}`;
    };
    return `${fmt('Cat', CAT)} · ${fmt('Rabbit', RABBIT)}`;
  },
};

const COURT = { x0: 95, x1: 305, y0: 30, y1: 200 };
const HAWK_CAMS: Pt[] = [{ x: 30, y: 30 }, { x: 370, y: 30 }, { x: 30, y: 200 }, { x: 370, y: 200 }, { x: 200, y: 12 }, { x: 200, y: 220 }];
const hawkeye: SceneDef = {
  hint: 'Move the ball. Every camera that sees it adds a ray; two are enough to fix its 3D position.',
  start: { x: 285, y: 90 }, bounds: { x0: 50, x1: 350, y0: 18, y1: 212 },
  eyes: () => HAWK_CAMS,
  pair: () => [HAWK_CAMS[0], HAWK_CAMS[3]],
  dirs: () => [unit(HAWK_CAMS[0], { x: 200, y: 115 }), unit(HAWK_CAMS[3], { x: 200, y: 115 })],
  height: -40,
  background: `
    <rect class="sc-court-bg" x="0" y="0" width="${W}" height="${H}"/>
    <rect class="sc-court" x="${COURT.x0}" y="${COURT.y0}" width="${COURT.x1 - COURT.x0}" height="${COURT.y1 - COURT.y0}"/>
    <line class="sc-court-line" x1="${COURT.x0}" y1="115" x2="${COURT.x1}" y2="115"/>
    <line class="sc-court-line" x1="200" y1="${COURT.y0 + 30}" x2="200" y2="${COURT.y1 - 30}"/>
    <line class="sc-court-line" x1="${COURT.x0}" y1="${COURT.y0 + 30}" x2="${COURT.x1}" y2="${COURT.y0 + 30}"/>
    <line class="sc-court-line" x1="${COURT.x0}" y1="${COURT.y1 - 30}" x2="${COURT.x1}" y2="${COURT.y1 - 30}"/>
    ${HAWK_CAMS.map((c) => `<rect class="sc-hawkcam" x="${c.x - 6}" y="${c.y - 4}" width="12" height="8" rx="2"/>`).join('')}`,
  rays: (t) => HAWK_CAMS.map((c, i) => ray(c, t, i % 2 ? 'r2' : 'r1')).join(''),
  target: (t) => `<circle class="sc-ball" cx="${t.x}" cy="${t.y}" r="6"/>`,
  readout: (t) => {
    const inside = t.x >= COURT.x0 && t.x <= COURT.x1 && t.y >= COURT.y0 && t.y <= COURT.y1;
    return `${HAWK_CAMS.length} rays meet at the ball · call: ${inside ? '<b class="ok">IN</b>' : '<b class="no">OUT</b>'}`;
  },
};

const SCOPE_EYES = [{ x: 193, y: 160 }, { x: 207, y: 160 }];
const surgery: SceneDef = {
  hint: 'Move the point on the tissue. Two tiny cameras at the endoscope tip see it from slightly different angles.',
  start: { x: 230, y: 70 }, bounds: { x0: 70, x1: 330, y0: 35, y1: 120 },
  eyes: () => SCOPE_EYES,
  height: -10,
  background: `
    <rect class="sc-body-bg" x="0" y="0" width="${W}" height="${H}"/>
    <path class="sc-tissue" d="M0,0 L400,0 L400,95 C340,140 290,80 230,118 C170,150 120,85 60,125 C30,140 10,120 0,130 Z"/>
    <path class="sc-tissue-fold" d="M40,60 C90,40 140,75 190,50 M220,40 C260,25 300,55 350,35"/>
    <rect class="sc-scope" x="186" y="160" width="28" height="80" rx="6"/>
    <text class="sc-label sc-label-warn" x="222" y="175">tiny baseline</text>`,
  target: (t) => `<circle class="sc-target" cx="${t.x}" cy="${t.y}" r="6"/>`,
  readout: (t) => angleText(SCOPE_EYES[0], SCOPE_EYES[1], t),
};

const CAR_EYES = [{ x: 186, y: 168 }, { x: 214, y: 168 }];
const cars: SceneDef = {
  hint: 'Move the pedestrian. The closer they are, the bigger the angle (and the disparity) between the two cameras.',
  start: { x: 210, y: 60 }, bounds: { x0: 90, x1: 310, y0: 18, y1: 140 },
  eyes: () => CAR_EYES,
  height: -4,
  background: `
    <rect class="sc-road-bg" x="0" y="0" width="${W}" height="${H}"/>
    <rect class="sc-road" x="80" y="0" width="240" height="${H}"/>
    ${[10, 60, 110].map((y) => `<rect class="sc-lane" x="197" y="${y}" width="6" height="28"/>`).join('')}
    <rect class="sc-car" x="165" y="160" width="70" height="75" rx="14"/>
    <rect class="sc-windshield" x="173" y="166" width="54" height="16" rx="4"/>`,
  target: (t) => `<g class="sc-ped" transform="translate(${t.x},${t.y})"><circle cx="0" cy="-9" r="5"/><rect x="-5" y="-3" width="10" height="16" rx="4"/></g>`,
  readout: (t) => angleText(CAR_EYES[0], CAR_EYES[1], t),
};

const avatarEyes = (inches: number): Pt[] => {
  const half = 8 + inches * 26; // schematic: 1/3 in to 2 in mapped to screen pixels
  return [{ x: 200 - half, y: 190 }, { x: 200 + half, y: 190 }];
};
const avatar: SceneDef = {
  hint: 'Drag the slider to change the gap between the two film cameras, or move the actor.',
  start: { x: 200, y: 70 }, bounds: { x0: 60, x1: 340, y0: 25, y1: 140 },
  eyes: (s) => avatarEyes(s),
  height: 5,
  slider: { label: 'Camera spacing', min: 1 / 3, max: 2, step: 1 / 24, value: 1, format: (v) => `${v.toFixed(2)} in` },
  background: `
    <rect class="sc-set-bg" x="0" y="0" width="${W}" height="${H}"/>
    <path class="sc-spot" d="M120,0 L280,0 L250,150 L150,150 Z"/>
    <rect class="sc-rig" x="120" y="196" width="160" height="10" rx="4"/>`,
  rays: (t, s) => stereoRays(avatarEyes(s), t),
  target: (t) => `<g class="sc-actor" transform="translate(${t.x},${t.y})"><circle cx="0" cy="-12" r="7"/><path d="M-10,12 L-7,-3 L7,-3 L10,12 Z"/></g>`,
  readout: (t, s) => {
    const e = avatarEyes(s);
    return `Spacing ${s.toFixed(2)} in · rays meet at <b>${rayAngle(e[0], e[1], t).toFixed(1)}°</b> · wider gap → more disparity → stronger 3D`;
  },
};

const PLANE = [{ x: 110, y: 30 }, { x: 290, y: 30 }];
const maps: SceneDef = {
  hint: 'Move the point on the rooftops. Two photos taken from different positions both see it.',
  start: { x: 230, y: 140 }, bounds: { x0: 40, x1: 360, y0: 95, y1: 205 },
  eyes: () => PLANE,
  dirs: () => [{ x: 0, y: 1 }, { x: 0, y: 1 }],
  height: 12,
  background: `
    <rect class="sc-sky" x="0" y="0" width="${W}" height="${H}"/>
    <line class="sc-flight" x1="40" y1="30" x2="360" y2="30"/>
    ${[[40, 150, 50], [95, 110, 40], [140, 170, 45], [190, 95, 55], [250, 135, 40], [295, 115, 45], [345, 160, 40]]
      .map(([x, y, w]) => `<rect class="sc-building" x="${x}" y="${y}" width="${w}" height="${230 - y}"/>`).join('')}
    ${PLANE.map((p, i) => `<g class="sc-plane" transform="translate(${p.x},${p.y})"><path d="M-16,0 L16,0 L8,-4 L-12,-4 Z M-4,-4 L4,-14 L8,-14 L2,-4 Z"/><text class="sc-label" x="0" y="-18" text-anchor="middle">photo ${i + 1}</text></g>`).join('')}`,
  target: (t) => `<circle class="sc-target" cx="${t.x}" cy="${t.y}" r="6"/>`,
  readout: (t) => `${angleText(PLANE[0], PLANE[1], t)}`,
};

export const SCENES: Record<string, SceneDef> = { mars, mantis, eyes, hawkeye, surgery, cars, avatar, maps };

// ---------------------------------------------------------------- epipolar view

interface P3 { x: number; y: number; z: number }
interface UV { u: number; v: number }
const FOCAL = 44;
const IMG = { w: 170, h: 92 };
const BOX = [{ x: 12, y: 18 }, { x: 218, y: 18 }];
const DEPTHS = [0.45, 0.65, 0.85, 1, 1.25, 1.6, 2.1];

/** Pinhole projection for a camera at C (height 0) looking along d in the drawing plane; z is up. */
export function project(c: Pt, d: Pt, p: P3): UV | null {
  const rx = p.x - c.x; const ry = p.y - c.y;
  const right = { x: -d.y, y: d.x };
  const zc = rx * d.x + ry * d.y;
  if (zc <= 1e-6) return null;
  return { u: (FOCAL * (rx * right.x + ry * right.y)) / zc, v: (FOCAL * -p.z) / zc };
}

function insideBox(i: number, p: Pt): boolean {
  return p.x >= BOX[i].x && p.x <= BOX[i].x + IMG.w && p.y >= BOX[i].y && p.y <= BOX[i].y + IMG.h;
}

/** The part of the infinite line through a and b that lies inside image box i (Liang–Barsky). */
export function clipLine(a: Pt, b: Pt, i: number): [Pt, Pt] | null {
  const dx = b.x - a.x; const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 1e-9) return null;
  let t0 = -Infinity; let t1 = Infinity;
  const xmin = BOX[i].x; const xmax = xmin + IMG.w; const ymin = BOX[i].y; const ymax = ymin + IMG.h;
  const edges: [number, number][] = [[-dx, a.x - xmin], [dx, xmax - a.x], [-dy, a.y - ymin], [dy, ymax - a.y]];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
  }
  if (t0 > t1) return null;
  return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
}

function epiView(c1: Pt, c2: Pt, d1: Pt, d2: Pt, t: Pt, h: number): string {
  const T: P3 = { x: t.x, y: t.y, z: h };
  const along = (k: number): P3 => ({ x: c1.x + k * (T.x - c1.x), y: c1.y + k * (T.y - c1.y), z: k * T.z });
  const toBox = (i: number, q: UV): Pt => ({ x: BOX[i].x + IMG.w / 2 + q.u, y: BOX[i].y + IMG.h / 2 + q.v });
  const parts: string[] = [];
  for (let i = 0; i < 2; i++) {
    parts.push(`<rect class="ep-img" x="${BOX[i].x}" y="${BOX[i].y}" width="${IMG.w}" height="${IMG.h}" rx="5"/>`,
      `<text class="ep-title ${i ? 'c2' : 'c1'}" x="${BOX[i].x}" y="${BOX[i].y - 6}">${i ? 'Camera 2 image' : 'Camera 1 image'}</text>`);
  }
  const g1: string[] = []; const g2: string[] = [];
  // Camera 1: the point x (every candidate depth projects here).
  const x1 = project(c1, d1, T);
  if (x1 && insideBox(0, toBox(0, x1))) { const p = toBox(0, x1); g1.push(`<circle class="ep-x" cx="${p.x}" cy="${p.y}" r="4.5"/><text class="ep-lbl" x="${p.x + 7}" y="${p.y - 6}">x</text>`); }
  // Camera 2: epipolar line l' through the projections of the camera-1 ray.
  const pts = [0.3, 0.6, 1, 2, 4, 9].map((k) => project(c2, d2, along(k))).filter((q): q is UV => q !== null);
  if (pts.length >= 2) {
    const seg = clipLine(toBox(1, pts[0]), toBox(1, pts[pts.length - 1]), 1);
    if (seg) g2.push(`<line class="ep-line" x1="${seg[0].x.toFixed(1)}" y1="${seg[0].y.toFixed(1)}" x2="${seg[1].x.toFixed(1)}" y2="${seg[1].y.toFixed(1)}"/>`);
  }
  DEPTHS.forEach((k) => {
    const q = project(c2, d2, along(k));
    if (!q) return;
    const p = toBox(1, q);
    if (!insideBox(1, p)) return;
    g2.push(k === 1
      ? `<circle class="ep-x" cx="${p.x}" cy="${p.y}" r="4.5"/><text class="ep-lbl" x="${p.x + 7}" y="${p.y - 6}">x′</text>`
      : `<circle class="ep-cand" cx="${p.x}" cy="${p.y}" r="2.6"/>`);
  });
  // Epipoles: each camera's image of the other camera's center.
  const e1 = project(c1, d1, { ...c2, z: 0 });
  const e2 = project(c2, d2, { ...c1, z: 0 });
  const epi = (i: number, q: UV | null, name: string, g: string[]): string => {
    if (q && Math.abs(q.u) < IMG.w / 2 && Math.abs(q.v) < IMG.h / 2) {
      const p = toBox(i, q);
      g.push(`<circle class="ep-e" cx="${p.x}" cy="${p.y}" r="4"/><text class="ep-lbl warn" x="${p.x + 6}" y="${p.y + 12}">${name}</text>`);
      return `${name} visible`;
    }
    if (q) return Math.abs(q.u) < 1e4 ? `${name} off-image` : `${name} at infinity`;
    // No projection: the other camera is either exactly level with this one (epipole at
    // infinity) or behind it (epipole exists but is not in front of the camera).
    const other = i ? c1 : c2; const self = i ? c2 : c1; const dir = i ? d2 : d1;
    const zc = (other.x - self.x) * dir.x + (other.y - self.y) * dir.y;
    return Math.abs(zc) < 1e-6 ? `${name} at infinity` : `${name} off-image`;
  };
  const s1 = epi(0, e1, 'e', g1); const s2 = epi(1, e2, 'e′', g2);
  parts.push(`<g>${g1.join('')}</g>`, `<g>${g2.join('')}</g>`);
  const note = s1.includes('infinity') && s2.includes('infinity')
    ? 'Side-by-side cameras: lines are horizontal, epipoles at ∞'
    : `Epipoles: ${s1}, ${s2}`;
  const y0 = BOX[0].y + IMG.h;
  parts.push(`<text class="ep-note strong" x="200" y="${y0 + 16}" text-anchor="middle">Every depth along camera 1’s ray lands on the green line l′</text>`,
    `<text class="ep-note" x="200" y="${y0 + 29}" text-anchor="middle">${note}</text>`);
  return parts.join('');
}

function epiPlane(c1: Pt, c2: Pt, t: Pt): string {
  const ext = { x: c1.x + 2.1 * (t.x - c1.x), y: c1.y + 2.1 * (t.y - c1.y) };
  const cands = DEPTHS.filter((k) => k !== 1).map((k) => `<circle class="sc-cand" cx="${(c1.x + k * (t.x - c1.x)).toFixed(1)}" cy="${(c1.y + k * (t.y - c1.y)).toFixed(1)}" r="2.4"/>`).join('');
  const cx = (c1.x + c2.x + t.x) / 3; const cy = (c1.y + c2.y + t.y) / 3;
  return `<polygon class="sc-plane" points="${c1.x},${c1.y} ${c2.x},${c2.y} ${t.x.toFixed(1)},${t.y.toFixed(1)}"/>
    <line class="sc-ray-ext" x1="${t.x.toFixed(1)}" y1="${t.y.toFixed(1)}" x2="${ext.x.toFixed(1)}" y2="${ext.y.toFixed(1)}"/>
    <line class="sc-base" x1="${c1.x}" y1="${c1.y}" x2="${c2.x}" y2="${c2.y}"/>${cands}
    <text class="sc-label sc-label-plane" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle">epipolar plane</text>`;
}

// ---------------------------------------------------------------- runtime

interface Live { def: SceneDef; svg: SVGSVGElement; dyn: SVGGElement; epi: SVGSVGElement | null; out: HTMLElement; t: Pt; s: number; manual: boolean; phase: number }
const live: Live[] = [];
let running = false;
let reducedMotion = false;

function draw(l: Live): void {
  const e = l.def.eyes(l.s);
  const rays = l.def.rays ? l.def.rays(l.t, l.s) : stereoRays(e, l.t);
  const cams = l.def.rays && l.def.eyes(l.s).length > 2 ? '' : e.map((p, i) => cam(p, i ? 'c2' : 'c1')).join('');
  const [c1, c2] = l.def.pair ? l.def.pair(l.s) : [e[0], e[1]];
  const up = { x: 0, y: -1 };
  const [d1, d2] = l.def.dirs ? l.def.dirs(l.s) : [up, up];
  l.dyn.innerHTML = epiPlane(c1, c2, l.t) + rays + cams + l.def.target(l.t);
  if (l.epi) l.epi.innerHTML = epiView(c1, c2, d1, d2, l.t, l.def.height ?? 0);
  l.out.innerHTML = l.def.readout(l.t, l.s);
}

function tick(time: number): void {
  if (!running) return;
  for (const l of live) {
    if (l.manual) continue;
    const b = l.def.bounds;
    const k = time / 2600 + l.phase;
    l.t = { x: (b.x0 + b.x1) / 2 + ((b.x1 - b.x0) / 2.6) * Math.sin(k), y: (b.y0 + b.y1) / 2 + ((b.y1 - b.y0) / 2.6) * Math.sin(k * 1.37) };
    draw(l);
  }
  if (running) requestAnimationFrame(tick);
}

/** Stop the idle animation (call when the page is hidden). */
export function pauseScenes(): void {
  running = false;
}

/** Restart the idle animation (call when the page is shown again). */
export function resumeScenes(): void {
  if (running || reducedMotion || !live.length) return;
  running = true;
  requestAnimationFrame(tick);
}

export function sceneHtml(id: string): string {
  const def = SCENES[id];
  if (!def) return '';
  const slider = def.slider
    ? `<label class="sc-slider"><span>${def.slider.label}</span><input type="range" min="${def.slider.min}" max="${def.slider.max}" step="${def.slider.step}" value="${def.slider.value}"><output>${def.slider.format(def.slider.value)}</output></label>`
    : '';
  return `
    <figure class="sc" data-scene="${id}">
      <svg viewBox="0 0 ${W} ${H}" tabindex="0" role="img" aria-label="Interactive diagram. ${def.hint} Use arrow keys to move the target.">
        ${def.background}<g class="sc-dyn"></g>
      </svg>
      ${slider}
      <svg class="sc-epi" viewBox="0 0 400 ${IMG.h + 52}" role="img" aria-label="What each camera sees: the point x in camera 1 must lie on the epipolar line in camera 2."></svg>
      <figcaption><span class="sc-hint">${def.hint}</span><span class="sc-out" aria-live="polite"></span></figcaption>
    </figure>`;
}

/** Wire up every `.sc` figure inside `root`. */
export function mountScenes(root: HTMLElement): void {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  reducedMotion = reduce;
  root.querySelectorAll<HTMLElement>('figure.sc').forEach((fig, i) => {
    const def = SCENES[fig.dataset.scene ?? ''];
    if (!def) return;
    const svg = fig.querySelector<SVGSVGElement>('svg')!;
    const l: Live = { def, svg, dyn: fig.querySelector<SVGGElement>('.sc-dyn')!, epi: fig.querySelector<SVGSVGElement>('svg.sc-epi'), out: fig.querySelector<HTMLElement>('.sc-out')!, t: { ...def.start }, s: def.slider?.value ?? 0, manual: reduce, phase: i * 1.7 };
    live.push(l);

    const moveTo = (clientX: number, clientY: number): void => {
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      const b = def.bounds;
      l.t = { x: clamp(p.x, b.x0, b.x1), y: clamp(p.y, b.y0, b.y1) };
      l.manual = true;
      draw(l);
    };
    svg.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse' || ev.buttons) moveTo(ev.clientX, ev.clientY); });
    svg.addEventListener('pointerdown', (ev) => moveTo(ev.clientX, ev.clientY));
    svg.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse' && !reduce) l.manual = false; });
    svg.addEventListener('keydown', (ev) => {
      const step = 8; const b = def.bounds;
      const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const m = d[ev.key];
      if (!m) return;
      ev.preventDefault();
      l.manual = true;
      l.t = { x: clamp(l.t.x + m[0], b.x0, b.x1), y: clamp(l.t.y + m[1], b.y0, b.y1) };
      draw(l);
    });
    const input = fig.querySelector<HTMLInputElement>('.sc-slider input');
    const output = fig.querySelector<HTMLOutputElement>('.sc-slider output');
    input?.addEventListener('input', () => {
      l.s = Number(input.value);
      if (output && def.slider) output.textContent = def.slider.format(l.s);
      draw(l);
    });
    draw(l);
  });
  resumeScenes();
}
