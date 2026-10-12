import type { Mat3, Vec3 } from '../types';
import { cross3, mat3Vec3, normalize3, sub3 } from '../math/linearAlgebra';
import type { PinholeCamera } from './fundamental';

/**
 * A small ray-traced room seen by four known cameras. It is the Photo lab's starting scene and
 * its ground truth: every pixel has an exact 3D point, so estimated geometry can be checked.
 * Units are meters, y is up, and cameras look roughly along +z (so world +x appears on the left).
 */

export const SAMPLE_WIDTH = 720;
export const SAMPLE_HEIGHT = 480;

export interface SampleCamera extends PinholeCamera {
  key: string;
  width: number;
  height: number;
  grainSeed: number;
}

interface Box { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; material: 'card' | 'crate' | 'red' | 'shelf' | 'wood' }
interface Sphere { x: number; y: number; z: number; r: number; material: 'ball' | 'globe' }

const BOXES: readonly Box[] = [
  { x0: 0.9, x1: 1.7, y0: 0, y1: 0.62, z0: 3.0, z1: 3.8, material: 'card' },
  { x0: 1.05, x1: 1.55, y0: 0.62, y1: 0.98, z0: 3.15, z1: 3.65, material: 'card' },
  { x0: -1.6, x1: -0.7, y0: 0, y1: 0.72, z0: 4.3, z1: 5.1, material: 'crate' },
  { x0: -0.2, x1: 0.25, y0: 0, y1: 0.45, z0: 2.3, z1: 2.75, material: 'red' },
  { x0: 2.45, x1: 3.4, y0: 0, y1: 2.3, z0: 5.0, z1: 6.6, material: 'shelf' },
  { x0: -0.7, x1: 0.9, y0: 0.42, y1: 0.5, z0: 6.3, z1: 7.2, material: 'wood' },
  { x0: -0.7, x1: -0.62, y0: 0, y1: 0.42, z0: 6.3, z1: 7.2, material: 'wood' },
  { x0: 0.82, x1: 0.9, y0: 0, y1: 0.42, z0: 6.3, z1: 7.2, material: 'wood' },
];
const SPHERES: readonly Sphere[] = [
  { x: -0.55, y: 0.24, z: 3.05, r: 0.24, material: 'ball' },
  { x: -1.15, y: 0.92, z: 4.7, r: 0.2, material: 'globe' },
];
const ROOM = { minX: -3.4, maxX: 3.4, floor: 0, ceiling: 3.2, back: 8, front: -1.8 };
const LIGHT = normalize3([-0.55, 0.78, -0.3]) as Vec3;

/**
 * Photos as a person would take them: two eye-level shots a step apart, one held up high and one
 * from a crouch. The centers are not collinear, so three-view transfer is well defined.
 */
const CAMERA_SETUP: readonly { key: string; center: Vec3; target: Vec3; grainSeed: number }[] = [
  { key: 'A', center: [0.8, 1.55, -0.7], target: [0.1, 0.85, 5.2], grainSeed: 1.3 },
  { key: 'B', center: [-0.8, 1.62, -0.45], target: [-0.25, 0.85, 5.2], grainSeed: 7.9 },
  { key: 'C', center: [0.1, 2.05, -0.2], target: [0.0, 0.8, 5.2], grainSeed: 4.4 },
  { key: 'D', center: [-0.2, 1.15, -0.6], target: [-0.05, 0.85, 5.2], grainSeed: 2.6 },
];

/** World-to-camera rotation whose rows are the camera's right, down and forward axes. */
function lookAtRotation(center: Vec3, target: Vec3): Mat3 {
  const forward = normalize3(sub3(target, center))!;
  const right = normalize3(cross3(forward, [0, 1, 0]))!;
  const down = cross3(forward, right);
  return [...right, ...down, ...forward] as unknown as Mat3;
}

export function createSampleCameras(width = SAMPLE_WIDTH, height = SAMPLE_HEIGHT): SampleCamera[] {
  const focal = Math.round(0.86 * width);
  const intrinsics: Mat3 = [focal, 0, width / 2, 0, focal, height / 2, 0, 0, 1];
  return CAMERA_SETUP.map(({ key, center, target, grainSeed }) => ({
    key,
    width,
    height,
    grainSeed,
    intrinsics,
    pose: { center, rotation: lookAtRotation(center, target) },
  }));
}

/* ---------- procedural materials ---------- */

let red = 0;
let green = 0;
let blue = 0;
let emissive = false;
const setColor = (r: number, g: number, b: number): void => {
  red = r;
  green = g;
  blue = b;
};
const fract = (x: number): number => x - Math.floor(x);
const hash = (x: number, y: number): number => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function paint(r: number, g: number, b: number, p: number, q: number): void {
  const n = 0.96 + 0.04 * valueNoise(p * 10, q * 10);
  setColor(r * n, g * n, b * n);
}
function floorMaterial(x: number, z: number): void {
  const plank = 0.19;
  const column = Math.floor(x / plank);
  const fx = x / plank - column;
  const along = (z + hash(column, 7.3) * 1.4) / 1.4;
  const row = Math.floor(along);
  const fz = along - row;
  const tone = 0.8 + 0.32 * hash(column, row);
  const grain = 0.9 + 0.1 * Math.sin(x * 70 + valueNoise(x * 6, z * 1.2) * 7);
  const seam = fx < 0.04 || fx > 0.96 || fz < 0.008 ? 0.42 : 1;
  const k = tone * grain * seam;
  setColor(0.62 * k, 0.45 * k, 0.29 * k);
}
function ceilingMaterial(x: number, z: number): void {
  if (Math.abs(x - 0.1) < 0.09 && z > 1 && z < 7.2) {
    emissive = true;
    setColor(1, 0.98, 0.92);
    return;
  }
  paint(0.84, 0.84, 0.82, x, z);
}
function posterMaterial(x: number, y: number): void {
  if (x < -1.27 || x > 0.47 || y < 1.13 || y > 2.42) return setColor(0.07, 0.07, 0.08);
  const dx = x + 0.62;
  const dy = y - 1.9;
  if (dx * dx + dy * dy < 0.09) return setColor(0.86, 0.22, 0.17);
  if (y > 1.28 && y < 2.05 && Math.abs(x - 0.08) < (2.05 - y) * 0.47) return setColor(0.1, 0.55, 0.55);
  if (x > -1.18 && x < -0.18 && ((y > 1.2 && y < 1.25) || (y > 1.3 && y < 1.35))) return setColor(0.95, 0.76, 0.15);
  if (x > -1.18 && x < -0.05 && y > 2.27 && y < 2.33) return setColor(0.12, 0.12, 0.14);
  if (x > -1.18 && x < -0.5 && y > 2.19 && y < 2.22) return setColor(0.25, 0.25, 0.28);
  if (x > 0.16 && x < 0.38 && y > 2.14 && y < 2.34) return setColor(0.18, 0.3, 0.62);
  setColor(0.94, 0.9, 0.81);
}
function checkerMaterial(x: number, y: number): void {
  if (x < 0.94 || x > 1.96 || y < 1.34 || y > 2.06) return setColor(0.95, 0.95, 0.94);
  const cx = Math.floor((x - 0.94) / 0.085);
  const cy = Math.floor((y - 1.34) / 0.08);
  if ((cx + cy) % 2 === 0) return setColor(0.06, 0.06, 0.07);
  setColor(0.95, 0.95, 0.94);
}
function backWallMaterial(x: number, y: number): void {
  if (x > -1.3 && x < 0.5 && y > 1.1 && y < 2.45) return posterMaterial(x, y);
  if (x > 0.9 && x < 2.0 && y > 1.3 && y < 2.1) return checkerMaterial(x, y);
  if (y < 0.12) return setColor(0.88, 0.87, 0.84);
  paint(0.8, 0.78, 0.73, x, y);
}
function brickMaterial(z: number, y: number): void {
  const height = 0.075;
  const width = 0.23;
  const mortar = 0.011;
  const row = Math.floor(y / height);
  const fy = y - row * height;
  const along = z + (row % 2) * width * 0.5;
  const column = Math.floor(along / width);
  const fz = along - column * width;
  if (fy < mortar || fz < mortar) return setColor(0.66, 0.64, 0.6);
  const tone = 0.72 + 0.38 * hash(column, row);
  const noise = 0.9 + 0.1 * valueNoise(z * 28, y * 28);
  setColor(0.56 * tone * noise, 0.26 * tone * noise, 0.18 * tone * noise);
}
function windowWallMaterial(z: number, y: number): void {
  if (z > 4.0 && z < 7.4 && y > 0.95 && y < 2.65) {
    const frame = z < 4.07 || z > 7.33 || y < 1.02 || y > 2.58;
    const mullion = Math.abs(z - 5.7) < 0.03 || Math.abs(y - 1.8) < 0.025 || Math.abs(z - 4.85) < 0.02 || Math.abs(z - 6.55) < 0.02;
    if (frame || mullion) return setColor(0.93, 0.93, 0.91);
    emissive = true;
    const skyline = 1.25 + 0.5 * hash(Math.floor(z * 3.2), 3.1);
    if (y < skyline) {
      if ((Math.floor(z * 22) + Math.floor(y * 16)) % 4 === 0) return setColor(0.95, 0.86, 0.55);
      return setColor(0.3, 0.34, 0.44);
    }
    const t = (y - 0.95) / 1.7;
    return setColor(0.62 + 0.25 * t, 0.78 + 0.14 * t, 0.96);
  }
  if (y < 0.12) return setColor(0.88, 0.87, 0.84);
  paint(0.62, 0.7, 0.75, z, y);
}
function cardboardMaterial(box: Box, px: number, py: number, pz: number, ny: number, nz: number): void {
  const noise = 0.9 + 0.1 * valueNoise(px * 24 + pz * 13, py * 24);
  const cx = (box.x0 + box.x1) / 2;
  const cz = (box.z0 + box.z1) / 2;
  if (ny > 0.5) {
    if (Math.abs(pz - cz) < 0.045) return setColor(0.8, 0.7, 0.52);
    return setColor(0.74 * noise, 0.56 * noise, 0.35 * noise);
  }
  if (Math.abs(nz) > 0.5) {
    if (py > box.y1 - 0.07 && Math.abs(px - cx) < 0.045) return setColor(0.8, 0.7, 0.52);
    const lx0 = cx - 0.2;
    const lx1 = cx + 0.12;
    const ly0 = box.y0 + (box.y1 - box.y0) * 0.3;
    const ly1 = ly0 + Math.min(0.17, (box.y1 - box.y0) * 0.45);
    if (px > lx0 && px < lx1 && py > ly0 && py < ly1) {
      const bx0 = lx0 + 0.02;
      const bx1 = lx1 - 0.1;
      const by0 = ly0 + 0.02;
      const by1 = ly0 + (ly1 - ly0) * 0.55;
      if (px > bx0 && px < bx1 && py > by0 && py < by1) {
        return hash(Math.floor((px - bx0) * 150), 1.7) > 0.5 ? setColor(0.07, 0.07, 0.08) : setColor(0.95, 0.95, 0.93);
      }
      if (py > ly1 - (ly1 - ly0) * 0.3 && py < ly1 - (ly1 - ly0) * 0.15 && px > bx0 && px < lx1 - 0.03) return setColor(0.16, 0.16, 0.2);
      if (px > lx1 - 0.085 && px < lx1 - 0.025 && py > by0 && py < by1) return setColor(0.85, 0.2, 0.16);
      return setColor(0.95, 0.95, 0.93);
    }
    return setColor(0.72 * noise, 0.54 * noise, 0.34 * noise);
  }
  if (py > box.y1 - 0.07 && Math.abs(pz - cz) < 0.045) return setColor(0.8, 0.7, 0.52);
  const dz = pz - cz;
  const dy = py - (box.y0 + box.y1) / 2;
  if (Math.abs(dz) < 0.13 && Math.abs(dy) < 0.085 && (Math.abs(dz) > 0.105 || Math.abs(dy) > 0.06)) return setColor(0.74, 0.16, 0.13);
  setColor(0.7 * noise, 0.53 * noise, 0.33 * noise);
}
function crateMaterial(box: Box, px: number, py: number, pz: number, nx: number, ny: number): void {
  const noise = 0.88 + 0.12 * valueNoise(px * 18 + pz * 18, py * 5);
  if (ny > 0.5) {
    if (fract((pz - box.z0) / 0.16) > 0.88) return setColor(0.04, 0.13, 0.14);
    return setColor(0.17 * noise, 0.6 * noise, 0.62 * noise);
  }
  if (fract((py - box.y0) / 0.144) > 0.86) return setColor(0.04, 0.13, 0.14);
  const side = Math.abs(nx) > 0.5;
  const along = side ? pz : px;
  const low = side ? box.z0 : box.x0;
  const high = side ? box.z1 : box.x1;
  if (along - low < 0.06 || high - along < 0.06) return setColor(0.1 * noise, 0.42 * noise, 0.45 * noise);
  setColor(0.17 * noise, 0.6 * noise, 0.62 * noise);
}
function stripedMaterial(px: number, py: number, pz: number, nx: number, ny: number): void {
  const a = Math.abs(nx) > 0.5 ? pz : px;
  const c = Math.abs(ny) > 0.5 ? pz : py;
  if (fract((a + c) / 0.09) < 0.3) return setColor(0.95, 0.93, 0.9);
  setColor(0.82, 0.17, 0.18);
}
const BOOKS: readonly Vec3[] = [
  [0.62, 0.18, 0.16], [0.16, 0.32, 0.55], [0.86, 0.72, 0.34], [0.2, 0.45, 0.3],
  [0.9, 0.88, 0.82], [0.42, 0.22, 0.46], [0.14, 0.14, 0.16], [0.82, 0.46, 0.2],
];
function shelfMaterial(box: Box, px: number, py: number, pz: number, nx: number): void {
  const noise = 0.88 + 0.12 * valueNoise(px * 10 + pz * 10, py * 10);
  const wood = (): void => setColor(0.36 * noise, 0.24 * noise, 0.15 * noise);
  if (nx > -0.5) return wood();
  if (pz < box.z0 + 0.05 || pz > box.z1 - 0.05 || py < 0.08 || py > box.y1 - 0.05) return wood();
  const shelf = Math.floor((py - 0.08) / 0.46);
  const fy = py - 0.08 - shelf * 0.46;
  if (fy < 0.035) return wood();
  const position = (pz - box.z0) / 0.055 + hash(shelf, 2) * 3;
  const book = Math.floor(position);
  const edge = position - book;
  const top = 0.25 + 0.15 * hash(book, shelf + 9);
  if (fy > top) return setColor(0.09, 0.07, 0.06);
  const color = BOOKS[Math.floor(hash(book, shelf) * BOOKS.length) % BOOKS.length];
  const shade = edge < 0.09 || edge > 0.93 ? 0.55 : 1;
  const band = Math.abs(fy - top * 0.72) < 0.012 ? 1.3 : 1;
  setColor(Math.min(1, color[0] * shade * band), Math.min(1, color[1] * shade * band), Math.min(1, color[2] * shade * band));
}
function woodMaterial(px: number, pz: number): void {
  const n = 0.86 + 0.14 * Math.sin(px * 38 + valueNoise(px * 4, pz * 4) * 6);
  setColor(0.56 * n, 0.41 * n, 0.27 * n);
}
function ballMaterial(qx: number, qy: number, qz: number): void {
  const seam = Math.abs(qx) < 0.045 || Math.abs(qy * 0.8 + qz * 0.6) < 0.045 || Math.abs(Math.hypot(qx, qz) - 0.74) < 0.035;
  if (seam) return setColor(0.1, 0.07, 0.05);
  const n = 0.9 + 0.1 * hash(Math.floor(qx * 50), Math.floor(qy * 50 + qz * 50));
  setColor(0.9 * n, 0.44 * n, 0.14 * n);
}
function globeMaterial(qx: number, qy: number, qz: number): void {
  const longitude = Math.atan2(qz, qx);
  const latitude = Math.asin(Math.max(-1, Math.min(1, qy)));
  if (Math.abs(latitude) > 1.25) return setColor(0.92, 0.94, 0.96);
  if (valueNoise(longitude * 2.2 + 5, latitude * 3.3 + 1) > 0.56) return setColor(0.36, 0.58, 0.3);
  setColor(0.16, 0.36, 0.7);
}

const FLOOR = 100;
const CEILING = 101;
const BACK_WALL = 102;
const BRICK_WALL = 103;
const WINDOW_WALL = 104;
const FRONT_WALL = 105;
const SPHERE_BASE = 50;

function material(id: number, px: number, py: number, pz: number, nx: number, ny: number, nz: number): void {
  if (id === FLOOR) return floorMaterial(px, pz);
  if (id === CEILING) return ceilingMaterial(px, pz);
  if (id === BACK_WALL) return backWallMaterial(px, py);
  if (id === BRICK_WALL) return brickMaterial(pz, py);
  if (id === WINDOW_WALL) return windowWallMaterial(pz, py);
  if (id === FRONT_WALL) return paint(0.7, 0.7, 0.68, px, py);
  if (id >= SPHERE_BASE) {
    const sphere = SPHERES[id - SPHERE_BASE];
    const qx = (px - sphere.x) / sphere.r;
    const qy = (py - sphere.y) / sphere.r;
    const qz = (pz - sphere.z) / sphere.r;
    return sphere.material === 'ball' ? ballMaterial(qx, qy, qz) : globeMaterial(qx, qy, qz);
  }
  const box = BOXES[id];
  if (box.material === 'card') return cardboardMaterial(box, px, py, pz, ny, nz);
  if (box.material === 'crate') return crateMaterial(box, px, py, pz, nx, ny);
  if (box.material === 'red') return stripedMaterial(px, py, pz, nx, ny);
  if (box.material === 'shelf') return shelfMaterial(box, px, py, pz, nx);
  woodMaterial(px, pz);
}

/* ---------- ray tracing ---------- */

let hitDistance = 0;
let hitId = -1;
let hitNx = 0;
let hitNy = 0;
let hitNz = 0;

/** Nearest hit along a unit ray. With `shadow`, returns early on any occluder and skips the room. */
function trace(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, shadow: boolean): boolean {
  let best = Number.POSITIVE_INFINITY;
  let id = -1;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < BOXES.length; i += 1) {
    const box = BOXES[i];
    let near = Number.NEGATIVE_INFINITY;
    let far = Number.POSITIVE_INFINITY;
    let axis = 0;
    let sign = 0;
    let t0: number;
    let t1: number;
    let swap: number;
    let s: number;
    // Slab test, unrolled per axis because this runs millions of times per render.
    if (dx !== 0) {
      t0 = (box.x0 - ox) / dx; t1 = (box.x1 - ox) / dx; s = -1;
      if (t0 > t1) { swap = t0; t0 = t1; t1 = swap; s = 1; }
      if (t0 > near) { near = t0; axis = 0; sign = s; }
      if (t1 < far) far = t1;
    } else if (ox < box.x0 || ox > box.x1) continue;
    if (dy !== 0) {
      t0 = (box.y0 - oy) / dy; t1 = (box.y1 - oy) / dy; s = -1;
      if (t0 > t1) { swap = t0; t0 = t1; t1 = swap; s = 1; }
      if (t0 > near) { near = t0; axis = 1; sign = s; }
      if (t1 < far) far = t1;
    } else if (oy < box.y0 || oy > box.y1) continue;
    if (dz !== 0) {
      t0 = (box.z0 - oz) / dz; t1 = (box.z1 - oz) / dz; s = -1;
      if (t0 > t1) { swap = t0; t0 = t1; t1 = swap; s = 1; }
      if (t0 > near) { near = t0; axis = 2; sign = s; }
      if (t1 < far) far = t1;
    } else if (oz < box.z0 || oz > box.z1) continue;
    if (near > far || near <= 1e-4 || near >= best) continue;
    if (shadow) return true;
    best = near;
    id = i;
    nx = axis === 0 ? sign : 0;
    ny = axis === 1 ? sign : 0;
    nz = axis === 2 ? sign : 0;
  }
  for (let i = 0; i < SPHERES.length; i += 1) {
    const sphere = SPHERES[i];
    const qx = ox - sphere.x;
    const qy = oy - sphere.y;
    const qz = oz - sphere.z;
    const b = qx * dx + qy * dy + qz * dz;
    const discriminant = b * b - (qx * qx + qy * qy + qz * qz - sphere.r * sphere.r);
    if (discriminant < 0) continue;
    const t = -b - Math.sqrt(discriminant);
    if (t <= 1e-4 || t >= best) continue;
    if (shadow) return true;
    best = t;
    id = SPHERE_BASE + i;
    nx = (qx + t * dx) / sphere.r;
    ny = (qy + t * dy) / sphere.r;
    nz = (qz + t * dz) / sphere.r;
  }
  if (shadow) return false;
  // The room is convex and contains every camera, so the nearest wall plane is the wall hit.
  const floorT = dy < 0 ? (ROOM.floor - oy) / dy : Number.POSITIVE_INFINITY;
  const ceilingT = dy > 0 ? (ROOM.ceiling - oy) / dy : Number.POSITIVE_INFINITY;
  const backT = dz > 0 ? (ROOM.back - oz) / dz : Number.POSITIVE_INFINITY;
  const frontT = dz < 0 ? (ROOM.front - oz) / dz : Number.POSITIVE_INFINITY;
  const brickT = dx > 0 ? (ROOM.maxX - ox) / dx : Number.POSITIVE_INFINITY;
  const windowT = dx < 0 ? (ROOM.minX - ox) / dx : Number.POSITIVE_INFINITY;
  if (floorT < best) { best = floorT; id = FLOOR; nx = 0; ny = 1; nz = 0; }
  if (ceilingT < best) { best = ceilingT; id = CEILING; nx = 0; ny = -1; nz = 0; }
  if (backT < best) { best = backT; id = BACK_WALL; nx = 0; ny = 0; nz = -1; }
  if (frontT < best) { best = frontT; id = FRONT_WALL; nx = 0; ny = 0; nz = 1; }
  if (brickT < best) { best = brickT; id = BRICK_WALL; nx = -1; ny = 0; nz = 0; }
  if (windowT < best) { best = windowT; id = WINDOW_WALL; nx = 1; ny = 0; nz = 0; }
  hitDistance = best;
  hitId = id;
  hitNx = nx;
  hitNy = ny;
  hitNz = nz;
  return id >= 0;
}

function shade(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): void {
  if (!trace(ox, oy, oz, dx, dy, dz, false)) return setColor(0, 0, 0);
  const distance = hitDistance;
  const id = hitId;
  const nx = hitNx;
  const ny = hitNy;
  const nz = hitNz;
  const px = ox + dx * distance;
  const py = oy + dy * distance;
  const pz = oz + dz * distance;
  emissive = false;
  material(id, px, py, pz, nx, ny, nz);
  let r = red;
  let g = green;
  let b = blue;
  if (!emissive) {
    const facing = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
    let light = 0.42 + 0.12 * Math.max(0, -(nx * dx + ny * dy + nz * dz));
    if (facing > 0) {
      const occluded = trace(px + nx * 1e-3, py + ny * 1e-3, pz + nz * 1e-3, LIGHT[0], LIGHT[1], LIGHT[2], true);
      light += 0.72 * facing * (occluded ? 0.22 : 1);
    }
    r *= light;
    g *= light;
    b *= light;
    if (id >= SPHERE_BASE && id < FLOOR) {
      const along = dx * nx + dy * ny + dz * nz;
      const reflected = (dx - 2 * along * nx) * LIGHT[0] + (dy - 2 * along * ny) * LIGHT[1] + (dz - 2 * along * nz) * LIGHT[2];
      const highlight = Math.max(0, reflected) ** 28 * 0.45;
      r += highlight;
      g += highlight;
      b += highlight;
    }
  }
  const fog = 1 - Math.min(0.2, distance * 0.013);
  setColor(r * fog, g * fog, b * fog);
}

/** Unit world-space direction of the ray through continuous pixel coordinates (u, v). */
export function rayDirection(camera: SampleCamera, u: number, v: number): Vec3 {
  const [fx, , cx, , fy, cy] = camera.intrinsics;
  const local: Vec3 = [(u - cx) / fx, (v - cy) / fy, 1];
  const r = camera.pose.rotation;
  const world: Vec3 = [
    r[0] * local[0] + r[3] * local[1] + r[6] * local[2],
    r[1] * local[0] + r[4] * local[1] + r[7] * local[2],
    r[2] * local[0] + r[5] * local[1] + r[8] * local[2],
  ];
  return normalize3(world)!;
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Renders rows [startRow, endRow) into an RGBA buffer of camera.width × camera.height. */
export function renderSampleRows(camera: SampleCamera, rgba: Uint8ClampedArray, startRow: number, endRow: number): void {
  const { width, height, grainSeed } = camera;
  const [ox, oy, oz] = camera.pose.center;
  const [fx, , cx, , fy, cy] = camera.intrinsics;
  const r = camera.pose.rotation;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  for (let y = startRow; y < endRow; y += 1) {
    const ly = (y + 0.5 - cy) / fy;
    for (let x = 0; x < width; x += 1) {
      const lx = (x + 0.5 - cx) / fx;
      let dx = r[0] * lx + r[3] * ly + r[6];
      let dy = r[1] * lx + r[4] * ly + r[7];
      let dz = r[2] * lx + r[5] * ly + r[8];
      const length = Math.hypot(dx, dy, dz);
      dx /= length;
      dy /= length;
      dz /= length;
      shade(ox, oy, oz, dx, dy, dz);
      const rx = (x - halfWidth) / halfWidth;
      const ry = (y - halfHeight) / halfHeight;
      const vignette = 1 - 0.11 * (rx * rx + ry * ry);
      const grain = (hash(x + grainSeed * 13.1, y * 1.7 + grainSeed) - 0.5) * 0.035;
      const index = (y * width + x) * 4;
      rgba[index] = clamp01(red * vignette + grain) * 255;
      rgba[index + 1] = clamp01(green * vignette + grain) * 255;
      rgba[index + 2] = clamp01(blue * vignette + grain) * 255;
      rgba[index + 3] = 255;
    }
  }
}

/** The exact 3D point seen at continuous pixel coordinates (u, v), or null if the ray escapes. */
export function castRay(camera: SampleCamera, u: number, v: number): Vec3 | null {
  const [dx, dy, dz] = rayDirection(camera, u, v);
  const [ox, oy, oz] = camera.pose.center;
  if (!trace(ox, oy, oz, dx, dy, dz, false)) return null;
  return [ox + dx * hitDistance, oy + dy * hitDistance, oz + dz * hitDistance];
}

/** Continuous pixel coordinates of a world point, or null when it is not in front of the camera. */
export function projectToPixel(camera: SampleCamera, point: Vec3): readonly [number, number] | null {
  const local = mat3Vec3(camera.pose.rotation, sub3(point, camera.pose.center));
  if (local[2] <= 1e-6) return null;
  const [fx, , cx, , fy, cy] = camera.intrinsics;
  return [fx * local[0] / local[2] + cx, fy * local[1] / local[2] + cy];
}

/** True when the point projects inside the image and nothing nearer blocks it. */
export function visibleFrom(camera: SampleCamera, point: Vec3): boolean {
  const pixel = projectToPixel(camera, point);
  if (!pixel || pixel[0] < 0 || pixel[0] > camera.width || pixel[1] < 0 || pixel[1] > camera.height) return false;
  const toPoint = sub3(point, camera.pose.center);
  const distance = Math.hypot(toPoint[0], toPoint[1], toPoint[2]);
  const [ox, oy, oz] = camera.pose.center;
  trace(ox, oy, oz, toPoint[0] / distance, toPoint[1] / distance, toPoint[2] / distance, false);
  return hitDistance > distance - 0.01;
}
