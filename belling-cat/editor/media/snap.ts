// Alignment snapping (no grid): values snap to nearby candidate lines within a threshold.

import type { Vec2 } from "./model";

export interface AxisSnap {
  value: number;
  /** The candidate line that was hit, or null when nothing was within the threshold. */
  snapped: number | null;
}

export function snapAxis(value: number, candidates: Iterable<number>, threshold: number): AxisSnap {
  let best: number | null = null;
  let bestDist = threshold;
  for (const c of candidates) {
    const d = Math.abs(c - value);
    if (d <= bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return { value: best ?? value, snapped: best };
}

export interface PointSnap {
  point: Vec2;
  guideX: number | null;
  guideY: number | null;
}

export function snapPoint(p: Vec2, xs: Iterable<number>, ys: Iterable<number>, threshold: number): PointSnap {
  const sx = snapAxis(p[0], xs, threshold);
  const sy = snapAxis(p[1], ys, threshold);
  return { point: [sx.value, sy.value], guideX: sx.snapped, guideY: sy.snapped };
}

/**
 * Snaps a box by its centre, left/right and top/bottom lines (whichever is closest on each axis)
 * and returns the adjusted centre.
 */
export function snapBox(center: Vec2, size: Vec2, xs: Iterable<number>, ys: Iterable<number>, threshold: number): PointSnap {
  const xList = [...xs], yList = [...ys];
  const [hw, hh] = [size[0] / 2, size[1] / 2];
  const axis = (c: number, half: number, cands: number[]): AxisSnap => {
    let best: AxisSnap = { value: c, snapped: null };
    let bestDist = threshold;
    for (const offset of [0, -half, half]) {
      const s = snapAxis(c + offset, cands, threshold);
      if (s.snapped === null) continue;
      const d = Math.abs(s.snapped - (c + offset));
      if (d <= bestDist) {
        bestDist = d;
        best = { value: s.snapped - offset, snapped: s.snapped };
      }
    }
    return best;
  };
  const sx = axis(center[0], hw, xList);
  const sy = axis(center[1], hh, yList);
  return { point: [sx.value, sy.value], guideX: sx.snapped, guideY: sy.snapped };
}

/** Constrains `p` to a horizontal or vertical move from `origin`, whichever is larger. */
export function constrainAxis(origin: Vec2, p: Vec2): Vec2 {
  return Math.abs(p[0] - origin[0]) >= Math.abs(p[1] - origin[1]) ? [p[0], origin[1]] : [origin[0], p[1]];
}
