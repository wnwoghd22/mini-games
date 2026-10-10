// Balloon outlines shared by the editor canvas and (later) mirrored by the runtime.
// All shapes are returned in balloon-local space, centre at the origin, y up.

import type { Vec2 } from "./model";

export type BalloonKind = "speech" | "shout" | "thought";

/** How far a tail may extend past the rim (same as the runtime). */
export const TAIL_LENGTH = 90;

/** Outline polyline for the body of a balloon of `size`. */
export function balloonOutline(kind: BalloonKind, size: Vec2): Vec2[] {
  const [rx, ry] = [size[0] / 2, size[1] / 2];
  const pts: Vec2[] = [];
  if (kind === "shout") {
    const spikes = Math.max(10, Math.round((rx + ry) / 14));
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? 1 : 0.78;
      pts.push([Math.cos(a) * rx * r, Math.sin(a) * ry * r]);
    }
    return pts;
  }
  const n = 96;
  const bumps = Math.max(6, Math.round((rx + ry) / 28));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let r = 1;
    if (kind === "thought") {
      // Scalloped rim: each bump is an arc that dips at the seams.
      const phase = ((a * bumps) / (Math.PI * 2)) % 1;
      r = 0.9 + 0.1 * Math.sqrt(1 - Math.pow(phase * 2 - 1, 2));
    }
    pts.push([Math.cos(a) * rx * r, Math.sin(a) * ry * r]);
  }
  return pts;
}

/** Tail tip: points toward `towards` but reaches at most TAIL_LENGTH past the rim. */
export function tailTip(size: Vec2, towards: Vec2): Vec2 {
  const len = Math.hypot(towards[0], towards[1]);
  const dir: Vec2 = len > 0 ? [towards[0] / len, towards[1] / len] : [0, -1];
  const angle = Math.atan2(dir[1], dir[0]);
  const rim: Vec2 = [Math.cos(angle) * size[0] * 0.5, Math.sin(angle) * size[1] * 0.5];
  const reach = Math.min(TAIL_LENGTH, Math.max(20, len - Math.hypot(rim[0], rim[1])));
  return [rim[0] + dir[0] * reach, rim[1] + dir[1] * reach];
}

/** Two rim points either side of the tail direction (the pointer's base). */
export function tailBase(size: Vec2, towards: Vec2): [Vec2, Vec2] {
  const len = Math.hypot(towards[0], towards[1]);
  const dir: Vec2 = len > 0 ? [towards[0] / len, towards[1] / len] : [0, -1];
  const angle = Math.atan2(dir[1], dir[0]);
  const spread = 0.28;
  const rim = (a: number): Vec2 => [Math.cos(a) * size[0] * 0.46, Math.sin(a) * size[1] * 0.46];
  return [rim(angle - spread), rim(angle + spread)];
}

/** Thought balloons trail three shrinking bubbles toward the tail tip. */
export function thoughtBubbles(size: Vec2, towards: Vec2): { center: Vec2; radius: number }[] {
  const tip = tailTip(size, towards);
  const len = Math.hypot(towards[0], towards[1]);
  const dir: Vec2 = len > 0 ? [towards[0] / len, towards[1] / len] : [0, -1];
  const angle = Math.atan2(dir[1], dir[0]);
  const rim: Vec2 = [Math.cos(angle) * size[0] * 0.5, Math.sin(angle) * size[1] * 0.5];
  const out: { center: Vec2; radius: number }[] = [];
  const base = Math.min(size[0], size[1]) * 0.09;
  for (let i = 0; i < 3; i++) {
    const t = (i + 1) / 3.5;
    out.push({ center: [rim[0] + (tip[0] - rim[0]) * t, rim[1] + (tip[1] - rim[1]) * t], radius: base * (1 - i * 0.28) });
  }
  return out;
}

export const DEFAULT_FONT = 13;
export const MIN_FONT = 8;
export const TEXT_AREA = 0.7;
const GLYPH_W = 0.62;
const LINE_H = 1.3;

export function textBox(size: Vec2): Vec2 {
  return [size[0] * TEXT_AREA, size[1] * TEXT_AREA];
}

/** Largest font (<= preferred, >= MIN_FONT) at which `text` fits the box when word-wrapped. */
export function fitFont(text: string, preferred: number, box: Vec2): number {
  let font = Math.max(preferred, MIN_FONT);
  while (!fits(text, font, box) && font > MIN_FONT) font = Math.max(MIN_FONT, font - 0.5);
  return font;
}

/** Word-wrapped lines at `font`, for the canvas preview. */
export function wrapLines(text: string, font: number, box: Vec2): string[] {
  const maxChars = Math.max(1, Math.floor(box[0] / (font * GLYPH_W)));
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

function fits(text: string, font: number, box: Vec2): boolean {
  const maxChars = Math.max(1, Math.floor(box[0] / (font * GLYPH_W)));
  for (const paragraph of text.split("\n")) for (const w of paragraph.split(/\s+/)) if (w.length > maxChars) return false;
  return wrapLines(text, font, box).length * font * LINE_H <= box[1];
}

export function hasTail(tail: Vec2 | undefined): tail is Vec2 {
  return !!tail && (tail[0] !== 0 || tail[1] !== 0);
}
