// Sprite atlases known to the game (mirror of the table in bevy/src/art.rs).
// `file` is relative to bevy/assets; atlases without a file are generated in code at runtime,
// so the editor shows them as labelled boxes.

export interface Atlas {
  file?: string;
  cols: number;
  rows: number;
}

export const ATLASES: Record<string, Atlas> = {
  mouse: { file: "art/mouse-poses.png", cols: 2, rows: 2 },
  walk: { file: "art/mouse-walk-poses.png", cols: 2, rows: 1 },
  candle: { cols: 3, rows: 1 },
  table: { cols: 1, rows: 1 },
};

/** "mouse:3" → { atlas: "mouse", index: 3 } */
export function parseFrame(frame: string): { atlas: string; index: number } | null {
  const m = /^([A-Za-z0-9_]+):(\d+)$/.exec(frame);
  return m ? { atlas: m[1], index: Number(m[2]) } : null;
}

export function frameCount(name: string): number {
  const a = ATLASES[name];
  return a ? a.cols * a.rows : 0;
}
