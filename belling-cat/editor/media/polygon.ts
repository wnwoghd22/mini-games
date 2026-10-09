// Polygon helpers shared in spirit with bevy/src/polygon.rs: ear clipping, hit tests, bbox.

import type { Vec2 } from "./model";

export interface Box {
  min: Vec2;
  max: Vec2;
}

export function bbox(points: Vec2[]): Box {
  const min: Vec2 = [Infinity, Infinity];
  const max: Vec2 = [-Infinity, -Infinity];
  for (const [x, y] of points) {
    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
  }
  return { min, max };
}

export function boxCenter(b: Box): Vec2 {
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
}

export function boxSize(b: Box): Vec2 {
  return [b.max[0] - b.min[0], b.max[1] - b.min[1]];
}

/** Twice the signed area; positive when counter-clockwise (y up). */
export function signedArea2(points: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return a;
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/**
 * Ear-clipping triangulation of a simple polygon (any winding).
 * Returns index triples into `points`. Degenerate input yields as many ears as possible.
 */
export function triangulate(points: Vec2[]): [number, number, number][] {
  const n = points.length;
  if (n < 3) return [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i);
  if (signedArea2(points) < 0) idx.reverse();
  const out: [number, number, number][] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length];
      const ib = idx[i];
      const ic = idx[(i + 1) % idx.length];
      const a = points[ia], b = points[ib], c = points[ic];
      if (cross(a, b, c) <= 1e-9) continue; // reflex or collinear
      let inside = false;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (pointInTriangle(points[j], a, b, c)) {
          inside = true;
          break;
        }
      }
      if (inside) continue;
      out.push([ia, ib, ic]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

/** Even-odd point-in-polygon. */
export function contains(points: Vec2[], p: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const hit = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/** Distance from `p` to segment ab and the parameter along it. */
export function segmentDistance(p: Vec2, a: Vec2, b: Vec2): { d: number; t: number } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const qx = a[0] + t * dx, qy = a[1] + t * dy;
  return { d: Math.hypot(p[0] - qx, p[1] - qy), t };
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
