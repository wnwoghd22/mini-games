// Webview entry: canvas editor for *.scene.json (cuts, children, flow, camera paths, preview).

import { type Scene, type Cut, type Vec2, type Step, type Trigger, type TriggerKind, type Keyframe, type Child, type BalloonChild, type SpriteChild, VIEW, FILL, SLIDE_SECONDS, stepKind, emptyScene } from "./model";
import { triangulate, contains, bbox, boxCenter, boxSize, segmentDistance, dist } from "./polygon";
import { formatScene } from "./format";
import { parseDialogue } from "./dialogue";
import { balloonOutline, tailTip, tailBase, thoughtBubbles, hasTail, type BalloonKind } from "./balloon";
import { ATLASES, parseFrame, frameCount } from "./atlases";
import { snapPoint, snapBox, constrainAxis } from "./snap";
import { layoutFlow, insertStep, moveStep, removeStep, type FlowNode } from "./flow";

declare function acquireVsCodeApi(): { postMessage(m: unknown): void; getState(): unknown; setState(s: unknown): void };
const vscode = acquireVsCodeApi();

// ---------- state ----------

type Tool = "select" | "draw" | "flow";
interface Camera { x: number; y: number; zoom: number }
interface Selection {
  cut: number;        // -1 none
  vertex: number;     // -1 none
  child: number;      // index into the selected cut's children, -1 none
  trigger: number;    // -1 none
  step: number;       // -1 none
  keyframe: number;   // -1 none
  entry: boolean;     // flow mode: the trigger's entry node (node 0) is selected
}

let scene: Scene = emptyScene();
let parseError: string | null = null;
let docVersion = 0;
let dialogue = new Map<string, { speaker: string; text: string }>();
let assetsBase = "";
const atlasImages = new Map<string, HTMLImageElement | null>();

let tool: Tool = "select";
const sel: Selection = { cut: -1, vertex: -1, child: -1, trigger: -1, step: -1, keyframe: -1, entry: false };
/** Flow mode: waiting for a click that places a new entry node. */
let pendingEntry = false;
/** Flow mode: a node being dragged (reorder, or re-target for the entry node). */
let flowDrag: { trigger: number; node: number; start: Vec2; current: Vec2; moved: boolean } | null = null;
const view = { x: 0, y: 200, scale: 0.45 };
let drawing: Vec2[] = [];
let mouseWorld: Vec2 = [0, 0];
let hoverEdge: { cut: number; index: number; point: Vec2 } | null = null;
/** Alignment guides shown while dragging. */
let guides: { x: number | null; y: number | null } = { x: null, y: null };
let altHeld = false;
let shiftHeld = false;

type Drag =
  | { kind: "pan"; start: Vec2; viewStart: Vec2 }
  | { kind: "vertex"; cut: number; index: number; origin: Vec2 }
  | { kind: "cut"; cut: number; start: Vec2; origin: Cut }
  | { kind: "floor"; cut: number }
  | { kind: "walk"; cut: number; end: 0 | 1 }
  | { kind: "keyframe"; index: number; mode: "move" | "zoom"; start: Vec2; zoomStart: number }
  | { kind: "child"; start: Vec2; origin: Vec2 }
  | { kind: "resize"; corner: Vec2; opposite: Vec2 }
  | { kind: "tail" }
  | null;
let drag: Drag = null;
let dirtyDuringDrag = false;

// ---------- DOM ----------

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const statusEl = document.getElementById("status")!;
const cutListEl = document.getElementById("cut-list")!;
const propsEl = document.getElementById("props")!;
const flowEl = document.getElementById("flow")!;
const playBtn = document.getElementById("btn-play") as HTMLButtonElement;
const flowBar = document.getElementById("flowbar")!;
const stopBtn = document.getElementById("btn-stop") as HTMLButtonElement;

// ---------- document sync ----------

window.addEventListener("message", (e) => {
  const m = e.data;
  if (m.type === "init" || m.type === "update") {
    docVersion = m.version;
    if (m.assetsBase) assetsBase = m.assetsBase;
    loadText(m.text);
    if (m.type === "init") fitView();
    if (scene.dialogue) vscode.postMessage({ type: "loadDialogue", path: scene.dialogue });
    render();
    renderPanels();
  } else if (m.type === "dialogue") {
    dialogue = parseDialogue(m.text).lines;
    render();
    renderProps();
  }
});

function loadText(text: string) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.cuts)) throw new Error("not a scene");
    scene = parsed;
    scene.flow ??= [];
    scene.player ??= emptyScene().player;
    for (const c of scene.cuts) c.children ??= [];
    parseError = null;
  } catch (err) {
    parseError = String(err);
  }
  clampSelection();
}

function commit() {
  if (parseError) return;
  vscode.postMessage({ type: "edit", text: formatScene(scene), version: docVersion });
  renderPanels();
  render();
}

// ---------- atlas images ----------

function atlasImage(name: string): HTMLImageElement | null {
  if (atlasImages.has(name)) return atlasImages.get(name)!;
  const atlas = ATLASES[name];
  if (!atlas?.file || !assetsBase) {
    atlasImages.set(name, null);
    return null;
  }
  const img = new Image();
  img.onload = () => render();
  img.onerror = () => atlasImages.set(name, null);
  img.src = `${assetsBase}/${atlas.file}`;
  atlasImages.set(name, img);
  return img;
}

/** Draws atlas cell `frame` into a world-space rectangle; returns false if no image is available. */
function drawFrame(frame: string, center: Vec2, size: Vec2, flip: boolean, alpha = 1): boolean {
  const parsed = parseFrame(frame);
  if (!parsed) return false;
  const atlas = ATLASES[parsed.atlas];
  const img = atlasImage(parsed.atlas);
  if (!atlas || !img || !img.complete || !img.naturalWidth) return false;
  const cw = img.naturalWidth / atlas.cols, chh = img.naturalHeight / atlas.rows;
  const sx = (parsed.index % atlas.cols) * cw, sy = Math.floor(parsed.index / atlas.cols) * chh;
  const tl = toScreen([center[0] - size[0] / 2, center[1] + size[1] / 2]);
  const w = size[0] * view.scale, h = size[1] * view.scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (flip) {
    ctx.translate(tl[0] + w, tl[1]);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, cw, chh, 0, 0, w, h);
  } else {
    ctx.drawImage(img, sx, sy, cw, chh, tl[0], tl[1], w, h);
  }
  ctx.restore();
  return true;
}

// ---------- geometry helpers ----------

function toScreen(p: Vec2): Vec2 {
  return [(p[0] - view.x) * view.scale + canvas.width / 2, (view.y - p[1]) * view.scale + canvas.height / 2];
}
function toWorld(s: Vec2): Vec2 {
  return [(s[0] - canvas.width / 2) / view.scale + view.x, view.y - (s[1] - canvas.height / 2) / view.scale];
}

function cutCamera(cut: Cut): Camera {
  const b = bbox(cut.polygon);
  const [w, h] = boxSize(b);
  const [x, y] = boxCenter(b);
  return { x, y, zoom: Math.max(w / VIEW[0], h / VIEW[1]) / FILL };
}

function cutById(id: string): Cut | undefined {
  return scene.cuts.find((c) => c.id === id);
}

function balloonIds(): { id: string; cut: string }[] {
  const out: { id: string; cut: string }[] = [];
  for (const c of scene.cuts) for (const ch of c.children ?? []) if (ch.type === "balloon") out.push({ id: ch.id, cut: c.id });
  return out;
}

function uniqueId(base: string): string {
  const taken = new Set<string>();
  for (const c of scene.cuts) {
    taken.add(c.id);
    for (const ch of c.children ?? []) taken.add(ch.id);
  }
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`;
}

function clampSelection() {
  if (sel.cut >= scene.cuts.length) sel.cut = -1;
  if (sel.cut < 0) { sel.vertex = -1; sel.child = -1; }
  else {
    if (sel.vertex >= scene.cuts[sel.cut].polygon.length) sel.vertex = -1;
    if (sel.child >= (scene.cuts[sel.cut].children ?? []).length) sel.child = -1;
  }
  if (sel.trigger >= scene.flow.length) { sel.trigger = -1; sel.step = -1; sel.entry = false; }
  if (sel.trigger >= 0 && sel.step >= scene.flow[sel.trigger].steps.length) sel.step = -1;
  const kfs = selectedPath();
  if (!kfs || sel.keyframe >= kfs.length) sel.keyframe = -1;
}

function selectedPath(): Keyframe[] | null {
  if (sel.trigger < 0 || sel.step < 0) return null;
  const step = scene.flow[sel.trigger]?.steps[sel.step];
  return step && "path" in step ? step.path : null;
}

function selectedChild(): Child | null {
  if (sel.cut < 0 || sel.child < 0) return null;
  return scene.cuts[sel.cut].children?.[sel.child] ?? null;
}

/** Axis-aligned extent of a child in world space. */
function childSize(child: Child): Vec2 {
  if (child.type === "text") return child.box ?? [Math.max(40, child.text.length * (child.size ?? 22) * 0.6), (child.size ?? 22) * 1.3];
  return child.size;
}

function childContains(child: Child, p: Vec2): boolean {
  const [w, h] = childSize(child);
  const dx = p[0] - child.pos[0], dy = p[1] - child.pos[1];
  if (child.type === "balloon" || (child.type === "shape" && child.shape === "ellipse")) {
    return (dx * dx) / ((w / 2) * (w / 2)) + (dy * dy) / ((h / 2) * (h / 2)) <= 1;
  }
  return Math.abs(dx) <= w / 2 && Math.abs(dy) <= h / 2;
}

function corners(child: Child): Vec2[] {
  const [w, h] = childSize(child);
  const [x, y] = child.pos;
  return [[x - w / 2, y + h / 2], [x + w / 2, y + h / 2], [x + w / 2, y - h / 2], [x - w / 2, y - h / 2]];
}

// ---------- snapping ----------

const SNAP_PX = 8;

function snapThreshold(): number {
  return SNAP_PX / view.scale;
}

/** x/y lines offered by every cut except `skipCut` (vertices and bbox centre lines). */
function cutCandidates(skipCut: number): { xs: number[]; ys: number[] } {
  const xs: number[] = [], ys: number[] = [];
  scene.cuts.forEach((c, i) => {
    if (i === skipCut) return;
    for (const [x, y] of c.polygon) { xs.push(x); ys.push(y); }
    const [cx, cy] = boxCenter(bbox(c.polygon));
    xs.push(cx); ys.push(cy);
  });
  return { xs, ys };
}

/** Candidates for a vertex of cut `ci`: the polygon's other vertices plus every other cut. */
function vertexCandidates(ci: number, skipVertex: number): { xs: number[]; ys: number[] } {
  const c = cutCandidates(ci);
  scene.cuts[ci]?.polygon.forEach(([x, y], i) => {
    if (i === skipVertex) return;
    c.xs.push(x); c.ys.push(y);
  });
  return c;
}

/** Candidates for a child of cut `ci`: the cut's bbox/floor/centre lines, siblings' centres and edges, the player. */
function childCandidates(ci: number, skipChild: number): { xs: number[]; ys: number[] } {
  const cut = scene.cuts[ci];
  const b = bbox(cut.polygon);
  const [cx, cy] = boxCenter(b);
  const xs = [b.min[0], b.max[0], cx], ys = [b.min[1], b.max[1], cy];
  if (cut.floor_y !== undefined) ys.push(cut.floor_y);
  if (cut.walk) xs.push(cut.walk[0], cut.walk[1]);
  (cut.children ?? []).forEach((ch, i) => {
    if (i === skipChild) return;
    const [w, h] = childSize(ch);
    xs.push(ch.pos[0], ch.pos[0] - w / 2, ch.pos[0] + w / 2);
    ys.push(ch.pos[1], ch.pos[1] - h / 2, ch.pos[1] + h / 2);
  });
  if (scene.player.cut === cut.id) xs.push(scene.player.x);
  return { xs, ys };
}

function applyVertexSnap(p: Vec2, ci: number, skipVertex: number, origin?: Vec2): Vec2 {
  let q = p;
  if (shiftHeld && origin) q = constrainAxis(origin, q);
  if (altHeld) { guides = { x: null, y: null }; return snap(q); }
  const cands = vertexCandidates(ci, skipVertex);
  const r = snapPoint(q, cands.xs, cands.ys, snapThreshold());
  guides = { x: r.guideX, y: r.guideY };
  return snap(r.point);
}

function applyChildSnap(center: Vec2, size: Vec2, ci: number, skipChild: number, origin?: Vec2): Vec2 {
  let q = center;
  if (shiftHeld && origin) q = constrainAxis(origin, q);
  if (altHeld) { guides = { x: null, y: null }; return snap(q); }
  const cands = childCandidates(ci, skipChild);
  const r = snapBox(q, size, cands.xs, cands.ys, snapThreshold());
  guides = { x: r.guideX, y: r.guideY };
  return snap(r.point);
}

/** Snap for a new vertex while drawing: earlier points of this polygon plus every cut. */
function applyDrawSnap(p: Vec2): Vec2 {
  if (altHeld) return snap(p);
  const cands = cutCandidates(-1);
  for (const [x, y] of drawing) { cands.xs.push(x); cands.ys.push(y); }
  return snap(snapPoint(p, cands.xs, cands.ys, snapThreshold()).point);
}

function drawGuides() {
  if (guides.x === null && guides.y === null) return;
  ctx.save();
  ctx.strokeStyle = "#7fffd4";
  ctx.setLineDash([4 * devicePixelRatio, 4 * devicePixelRatio]);
  if (guides.x !== null) {
    const sx = toScreen([guides.x, 0])[0];
    line([sx, 0], [sx, canvas.height]);
  }
  if (guides.y !== null) {
    const sy = toScreen([0, guides.y])[1];
    line([0, sy], [canvas.width, sy]);
  }
  ctx.restore();
}

// ---------- preview ----------

interface Preview {
  trigger: number;
  step: number;
  cam: Camera;
  shown: Set<string>;
  waiting: boolean;
  anim: { from: Camera; to: Camera; t: number; dur: number; ease: "smooth" | "linear" } | null;
  path: { frames: Keyframe[]; start: Camera; t: number } | null;
  wait: number;
  playerCut: string;
  playerX: number;
  done: boolean;
  lastTime: number;
}
let preview: Preview | null = null;

function startPreview(trigger: number) {
  const home = cutById(scene.player.cut);
  preview = {
    trigger,
    step: -1,
    cam: home ? cutCamera(home) : { x: 0, y: 0, zoom: 1 },
    shown: new Set(initiallyShown()),
    waiting: false,
    anim: null,
    path: null,
    wait: 0,
    playerCut: scene.player.cut,
    playerX: scene.player.x,
    done: false,
    lastTime: performance.now(),
  };
  playBtn.disabled = true;
  stopBtn.disabled = false;
  nextStep();
  requestAnimationFrame(tickPreview);
}

function initiallyShown(): string[] {
  const ids: string[] = [];
  for (const c of scene.cuts) for (const ch of c.children ?? []) if (ch.type === "balloon" && ch.initially === "shown") ids.push(ch.id);
  return ids;
}

function stopPreview() {
  preview = null;
  playBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus("");
  render();
}

function nextStep() {
  const p = preview!;
  p.step += 1;
  p.waiting = false;
  p.anim = null;
  p.path = null;
  const steps = scene.flow[p.trigger]?.steps ?? [];
  if (p.step >= steps.length) {
    p.done = true;
    setStatus("Preview finished. Press ■ to stop.");
    return;
  }
  const step = steps[p.step];
  sel.step = p.step;
  renderFlow();
  if ("focus" in step) {
    const cut = cutById(step.focus);
    if (cut) p.anim = { from: { ...p.cam }, to: cutCamera(cut), t: 0, dur: SLIDE_SECONDS, ease: "smooth" };
    else nextStep();
  } else if ("say" in step) {
    p.shown.add(step.say);
    p.waiting = true;
    setStatus(`say ${step.say} — Space for next Z`);
  } else if ("path" in step) {
    p.path = { frames: step.path, start: { ...p.cam }, t: 0 };
  } else if ("wait" in step) {
    p.wait = step.wait;
  } else if ("player" in step) {
    p.playerCut = step.player.cut;
    p.playerX = step.player.x;
    nextStep();
  } else if ("return" in step) {
    const home = cutById(p.playerCut);
    if (home) p.anim = { from: { ...p.cam }, to: cutCamera(home), t: 0, dur: SLIDE_SECONDS, ease: "smooth" };
    else nextStep();
  }
}

function ease(t: number, kind: "smooth" | "linear"): number {
  t = Math.max(0, Math.min(1, t));
  return kind === "linear" ? t : t * t * (3 - 2 * t);
}

function lerpCam(a: Camera, b: Camera, t: number): Camera {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, zoom: a.zoom + (b.zoom - a.zoom) * t };
}

function tickPreview(now: number) {
  const p = preview;
  if (!p) return;
  const dt = Math.min(0.1, (now - p.lastTime) / 1000);
  p.lastTime = now;
  advancePreview(dt);
  render();
  if (preview) requestAnimationFrame(tickPreview);
}

/** Advances the preview simulation by `dt` seconds (also used by dev/scenarios.js). */
function advancePreview(dt: number) {
  const p = preview;
  if (!p) return;
  if (p.anim) {
    p.anim.t += dt;
    p.cam = lerpCam(p.anim.from, p.anim.to, ease(p.anim.t / p.anim.dur, p.anim.ease));
    if (p.anim.t >= p.anim.dur) nextStep();
  } else if (p.path) {
    p.path.t += dt;
    const frames = p.path.frames;
    let prev: Camera = p.path.start, prevT = 0;
    let reached = true;
    for (const f of frames) {
      const target = { x: f.x, y: f.y, zoom: f.zoom };
      if (p.path.t < f.t) {
        p.cam = lerpCam(prev, target, ease((p.path.t - prevT) / Math.max(1e-6, f.t - prevT), f.ease ?? "smooth"));
        reached = false;
        break;
      }
      prev = target;
      prevT = f.t;
    }
    if (reached) {
      p.cam = prev;
      nextStep();
    }
  } else if (p.wait > 0) {
    p.wait -= dt;
    if (p.wait <= 0) nextStep();
  }
}

// ---------- rendering ----------

const COLORS = {
  page: "rgba(232,223,204,0.08)",
  cutFill: "rgba(232,223,204,0.10)",
  cutFillSel: "rgba(232,223,204,0.16)",
  outline: "#e8dfcc",
  tri: "rgba(232,223,204,0.12)",
  vertex: "#ffd36a",
  child: "#7fc8ff",
  childNoClip: "#ff9f7f",
  childSel: "#ffffff",
  floor: "#9ad67f",
  keyframe: "#f08cff",
  camera: "#ffe36a",
  player: "#ffffff",
  paper: "#faf6ec",
  ink: "#2a2622",
  flow: "#ffb14a",
  flowDim: "rgba(255,177,74,0.3)",
};

function render() {
  const w = (canvas.width = canvas.clientWidth * devicePixelRatio);
  const h = (canvas.height = canvas.clientHeight * devicePixelRatio);
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 1 * devicePixelRatio;
  ctx.font = `${11 * devicePixelRatio}px sans-serif`;

  if (parseError) {
    ctx.fillStyle = "#ff8080";
    ctx.fillText("Invalid scene JSON: " + parseError, 20, 30);
    return;
  }

  strokeRect(toScreen([-VIEW[0] / 2, VIEW[1] / 2]), toScreen([VIEW[0] / 2, -VIEW[1] / 2]), COLORS.page, [6, 6]);

  scene.cuts.forEach((cut, i) => drawCut(cut, i === sel.cut));
  drawPlayer();
  const child = selectedChild();
  if (child && !preview && tool !== "flow") drawChildHandles(child);
  if (drawing.length) drawDrawing();
  if (!preview) drawSelectedPath();
  drawFlowGraph();
  if (preview) drawPreview();
  if (drag) drawGuides();
}

function strokeRect(a: Vec2, b: Vec2, color: string, dash: number[] = []) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.setLineDash(dash.map((d) => d * devicePixelRatio));
  ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  ctx.restore();
}

function polyPath(points: Vec2[]) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const s = toScreen(p);
    if (i === 0) ctx.moveTo(s[0], s[1]);
    else ctx.lineTo(s[0], s[1]);
  });
  ctx.closePath();
}

function drawCut(cut: Cut, selected: boolean) {
  const pts = cut.polygon;
  polyPath(pts);
  ctx.fillStyle = selected ? COLORS.cutFillSel : COLORS.cutFill;
  ctx.fill();
  ctx.strokeStyle = COLORS.tri;
  for (const [a, b, c] of triangulate(pts)) {
    polyPath([pts[a], pts[b], pts[c]]);
    ctx.stroke();
  }
  polyPath(pts);
  ctx.strokeStyle = COLORS.outline;
  ctx.lineWidth = (selected ? 2 : 1) * devicePixelRatio;
  ctx.stroke();
  ctx.lineWidth = 1 * devicePixelRatio;

  const b = bbox(pts);
  const labelAt = toScreen([b.min[0] + 8, b.max[1] - 8]);
  ctx.fillStyle = COLORS.outline;
  ctx.fillText(`${cut.id}${cut.label ? "  ·  " + cut.label : ""}`, labelAt[0], labelAt[1] + 10 * devicePixelRatio);

  // Children in z order; clipped children are drawn inside the polygon only.
  const children = [...(cut.children ?? [])].map((c, i) => ({ c, i })).sort((a, b) => (a.c.z ?? 1) - (b.c.z ?? 1));
  for (const { c, i } of children) {
    const isSel = selected && i === sel.child;
    if (c.clip !== false) {
      ctx.save();
      polyPath(pts);
      ctx.clip();
      drawChild(c, isSel);
      ctx.restore();
    } else {
      drawChild(c, isSel);
    }
  }

  if (cut.floor_y !== undefined) {
    const y = cut.floor_y;
    const [x0, x1] = cut.walk ?? [b.min[0], b.max[0]];
    ctx.strokeStyle = COLORS.floor;
    ctx.setLineDash([4 * devicePixelRatio, 3 * devicePixelRatio]);
    line(toScreen([b.min[0], y]), toScreen([b.max[0], y]));
    ctx.setLineDash([]);
    ctx.lineWidth = 3 * devicePixelRatio;
    line(toScreen([x0, y]), toScreen([x1, y]));
    ctx.lineWidth = 1 * devicePixelRatio;
    if (selected && sel.child < 0) {
      handle(toScreen([x0, y]), COLORS.floor, true);
      handle(toScreen([x1, y]), COLORS.floor, true);
      handle(toScreen([(b.min[0] + b.max[0]) / 2, y]), COLORS.floor, false);
    }
  }

  if (selected && sel.child < 0) {
    pts.forEach((p, i) => handle(toScreen(p), COLORS.vertex, i === sel.vertex));
    if (hoverEdge && hoverEdge.cut === sel.cut && tool === "select") {
      const s = toScreen(hoverEdge.point);
      ctx.strokeStyle = COLORS.vertex;
      ctx.beginPath();
      ctx.arc(s[0], s[1], 5 * devicePixelRatio, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function worldPath(points: Vec2[], origin: Vec2) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const s = toScreen([origin[0] + p[0], origin[1] + p[1]]);
    if (i === 0) ctx.moveTo(s[0], s[1]);
    else ctx.lineTo(s[0], s[1]);
  });
  ctx.closePath();
}

function drawBalloon(child: BalloonChild, color: string, filled: boolean) {
  const kind: BalloonKind = child.kind ?? "speech";
  const tail = hasTail(child.tail) ? child.tail : undefined;
  ctx.strokeStyle = color;
  if (tail && kind !== "thought") {
    const [a, b] = tailBase(child.size, tail);
    const tip = tailTip(child.size, tail);
    worldPath([a, tip, b], child.pos);
    if (filled) { ctx.fillStyle = COLORS.paper; ctx.fill(); }
    ctx.stroke();
  }
  worldPath(balloonOutline(kind, child.size), child.pos);
  if (filled) { ctx.fillStyle = COLORS.paper; ctx.fill(); }
  ctx.stroke();
  if (tail && kind === "thought") {
    for (const bubble of thoughtBubbles(child.size, tail)) {
      const s = toScreen([child.pos[0] + bubble.center[0], child.pos[1] + bubble.center[1]]);
      ctx.beginPath();
      ctx.arc(s[0], s[1], bubble.radius * view.scale, 0, Math.PI * 2);
      if (filled) { ctx.fillStyle = COLORS.paper; ctx.fill(); }
      ctx.stroke();
    }
  }
}

function drawChild(child: Child, selected: boolean) {
  const color = selected ? COLORS.childSel : child.clip === false ? COLORS.childNoClip : COLORS.child;
  const c = toScreen(child.pos);
  ctx.lineWidth = (selected ? 2 : 1) * devicePixelRatio;
  if (child.type === "balloon") {
    const shown = preview ? preview.shown.has(child.id) : true;
    if (!shown) { ctx.lineWidth = 1 * devicePixelRatio; return; }
    drawBalloon(child, color, !!preview);
    const text = dialogue.get(child.line)?.text ?? `[${child.line}]`;
    const lines = text.split("\n");
    ctx.fillStyle = preview ? COLORS.ink : color;
    ctx.font = `${Math.max(9, 16 * view.scale) * devicePixelRatio}px sans-serif`;
    ctx.textAlign = "center";
    lines.forEach((l, i) => ctx.fillText(l, c[0], c[1] - ((lines.length - 1) / 2 - i) * 17 * view.scale * devicePixelRatio + 5 * devicePixelRatio));
    ctx.textAlign = "left";
    ctx.font = `${11 * devicePixelRatio}px sans-serif`;
    if (!preview) ctx.fillText(child.id, c[0] - (child.size[0] / 2) * view.scale, c[1] - (child.size[1] / 2) * view.scale - 3 * devicePixelRatio);
  } else if (child.type === "text") {
    ctx.fillStyle = child.color === "paper" ? COLORS.paper : color;
    ctx.font = `${Math.max(9, (child.size ?? 22) * view.scale) * devicePixelRatio}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(child.text, c[0], c[1] + 4 * devicePixelRatio);
    ctx.textAlign = "left";
    ctx.font = `${11 * devicePixelRatio}px sans-serif`;
    const [w, h] = childSize(child);
    if (!preview) {
      strokeRect(toScreen([child.pos[0] - w / 2, child.pos[1] + h / 2]), toScreen([child.pos[0] + w / 2, child.pos[1] - h / 2]), color, [2, 3]);
      ctx.fillStyle = color;
      ctx.fillText(child.id, c[0] - (w / 2) * view.scale, c[1] - (h / 2) * view.scale - 3 * devicePixelRatio);
    }
  } else if (child.type === "shape") {
    const [w, h] = child.size;
    ctx.strokeStyle = color;
    ctx.setLineDash([3 * devicePixelRatio, 3 * devicePixelRatio]);
    if (child.shape === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(c[0], c[1], (w / 2) * view.scale, (h / 2) * view.scale, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(c[0] - (w / 2) * view.scale, c[1] - (h / 2) * view.scale, w * view.scale, h * view.scale);
    }
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    if (!preview) ctx.fillText(child.id, c[0] - (w / 2) * view.scale + 3 * devicePixelRatio, c[1] - (h / 2) * view.scale - 3 * devicePixelRatio);
  } else {
    const [w, h] = child.size;
    const drawn = child.frames[0] ? drawFrame(child.frames[0], child.pos, child.size, !!child.flip) : false;
    ctx.strokeStyle = color;
    if (!drawn || selected || !preview) {
      ctx.setLineDash(drawn ? [2 * devicePixelRatio, 4 * devicePixelRatio] : []);
      ctx.strokeRect(c[0] - (w / 2) * view.scale, c[1] - (h / 2) * view.scale, w * view.scale, h * view.scale);
      ctx.setLineDash([]);
    }
    ctx.fillStyle = color;
    if (!preview) ctx.fillText(child.id, c[0] - (w / 2) * view.scale + 3 * devicePixelRatio, c[1] - (h / 2) * view.scale - 3 * devicePixelRatio);
  }
  ctx.lineWidth = 1 * devicePixelRatio;
}

function drawChildHandles(child: Child) {
  for (const p of corners(child)) handle(toScreen(p), COLORS.childSel, false);
  if (child.type === "balloon" && hasTail(child.tail)) {
    const tip: Vec2 = [child.pos[0] + child.tail[0], child.pos[1] + child.tail[1]];
    ctx.strokeStyle = COLORS.childSel;
    ctx.setLineDash([2 * devicePixelRatio, 3 * devicePixelRatio]);
    line(toScreen(child.pos), toScreen(tip));
    ctx.setLineDash([]);
    handle(toScreen(tip), COLORS.childNoClip, true);
  }
}

function drawPlayer() {
  const cutId = preview ? preview.playerCut : scene.player.cut;
  const x = preview ? preview.playerX : scene.player.x;
  const cut = cutById(cutId);
  if (!cut || cut.floor_y === undefined) return;
  const [w, h] = scene.player.size ?? [142, 142];
  const center: Vec2 = [x, cut.floor_y + h / 2];
  const drawn = drawFrame(scene.player.frames.idle, center, [w, h], false);
  const s = toScreen(center);
  ctx.strokeStyle = COLORS.player;
  if (!drawn || !preview) {
    ctx.setLineDash(drawn ? [2 * devicePixelRatio, 4 * devicePixelRatio] : []);
    ctx.strokeRect(s[0] - (w / 2) * view.scale, s[1] - (h / 2) * view.scale, w * view.scale, h * view.scale);
    ctx.setLineDash([]);
  }
  ctx.fillStyle = COLORS.player;
  if (!preview) ctx.fillText("player", s[0] - (w / 2) * view.scale + 3 * devicePixelRatio, s[1] - (h / 2) * view.scale - 3 * devicePixelRatio);
}

function drawDrawing() {
  ctx.strokeStyle = COLORS.vertex;
  ctx.beginPath();
  drawing.forEach((p, i) => {
    const s = toScreen(p);
    if (i === 0) ctx.moveTo(s[0], s[1]);
    else ctx.lineTo(s[0], s[1]);
  });
  const m = toScreen(mouseWorld);
  ctx.lineTo(m[0], m[1]);
  ctx.stroke();
  drawing.forEach((p, i) => handle(toScreen(p), COLORS.vertex, i === 0));
}

function cameraRect(cam: Camera, color: string, label?: string, strong = false) {
  const w = VIEW[0] * cam.zoom, h = VIEW[1] * cam.zoom;
  ctx.lineWidth = (strong ? 2 : 1) * devicePixelRatio;
  strokeRect(toScreen([cam.x - w / 2, cam.y + h / 2]), toScreen([cam.x + w / 2, cam.y - h / 2]), color, strong ? [] : [5, 4]);
  ctx.lineWidth = 1 * devicePixelRatio;
  if (label) {
    const s = toScreen([cam.x - w / 2, cam.y + h / 2]);
    ctx.fillStyle = color;
    ctx.fillText(label, s[0] + 4 * devicePixelRatio, s[1] - 4 * devicePixelRatio);
  }
}

function drawSelectedPath() {
  const frames = selectedPath();
  if (!frames) return;
  ctx.strokeStyle = COLORS.keyframe;
  ctx.beginPath();
  frames.forEach((f, i) => {
    const s = toScreen([f.x, f.y]);
    if (i === 0) ctx.moveTo(s[0], s[1]);
    else ctx.lineTo(s[0], s[1]);
  });
  ctx.stroke();
  frames.forEach((f, i) => {
    cameraRect({ x: f.x, y: f.y, zoom: f.zoom }, COLORS.keyframe, `${i + 1}  t=${f.t}s  zoom=${f.zoom}`, i === sel.keyframe);
    handle(toScreen([f.x, f.y]), COLORS.keyframe, i === sel.keyframe);
    const corner = toScreen([f.x + (VIEW[0] * f.zoom) / 2, f.y - (VIEW[1] * f.zoom) / 2]);
    handle(corner, COLORS.keyframe, false);
  });
}

function drawPreview() {
  cameraRect(preview!.cam, COLORS.camera, undefined, true);
}

function handle(s: Vec2, color: string, filled: boolean) {
  const r = 5 * devicePixelRatio;
  ctx.beginPath();
  ctx.rect(s[0] - r, s[1] - r, r * 2, r * 2);
  ctx.fillStyle = filled ? color : "#2a2622";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.stroke();
}

function line(a: Vec2, b: Vec2) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

// ---------- input ----------

function screenFromEvent(e: MouseEvent): Vec2 {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio];
}

const HIT = 8; // css px

function hitHandle(s: Vec2, p: Vec2): boolean {
  return dist(s, toScreen(p)) <= HIT * devicePixelRatio;
}

function selectCut(i: number) {
  if (sel.cut !== i) sel.child = -1;
  sel.cut = i;
  sel.vertex = -1;
}

canvas.addEventListener("mousedown", (e) => {
  canvas.focus();
  const s = screenFromEvent(e);
  const w = toWorld(s);
  if (e.button === 1 || (e.button === 0 && e.getModifierState("Space"))) {
    drag = { kind: "pan", start: s, viewStart: [view.x, view.y] };
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;

  if (tool === "flow") {
    // Keyframe handles of the selected path step still drag in flow mode.
    const kfs = selectedPath();
    if (kfs && !preview) {
      for (let i = kfs.length - 1; i >= 0; i--) {
        const f = kfs[i];
        const corner: Vec2 = [f.x + (VIEW[0] * f.zoom) / 2, f.y - (VIEW[1] * f.zoom) / 2];
        if (hitHandle(s, corner)) { sel.keyframe = i; drag = { kind: "keyframe", index: i, mode: "zoom", start: w, zoomStart: f.zoom }; return; }
      }
    }
    flowMouseDown(s, w, e);
    return;
  }

  if (tool === "draw") {
    if (drawing.length >= 3 && hitHandle(s, drawing[0])) finishDrawing();
    else drawing.push(applyDrawSnap(w));
    guides = { x: null, y: null };
    render();
    return;
  }

  // Keyframe handles of the selected path step.
  const frames = selectedPath();
  if (frames && !preview) {
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i];
      const corner: Vec2 = [f.x + (VIEW[0] * f.zoom) / 2, f.y - (VIEW[1] * f.zoom) / 2];
      if (hitHandle(s, corner)) {
        sel.keyframe = i;
        drag = { kind: "keyframe", index: i, mode: "zoom", start: w, zoomStart: f.zoom };
        renderFlow();
        return;
      }
      if (hitHandle(s, [f.x, f.y])) {
        sel.keyframe = i;
        drag = { kind: "keyframe", index: i, mode: "move", start: w, zoomStart: f.zoom };
        renderFlow();
        return;
      }
    }
  }

  // Selected child's handles: tail tip, then resize corners.
  const child = selectedChild();
  if (child) {
    if (child.type === "balloon" && hasTail(child.tail) && hitHandle(s, [child.pos[0] + child.tail[0], child.pos[1] + child.tail[1]])) {
      drag = { kind: "tail" };
      return;
    }
    const cs = corners(child);
    for (let i = 0; i < 4; i++) {
      if (hitHandle(s, cs[i])) {
        drag = { kind: "resize", corner: cs[i], opposite: cs[(i + 2) % 4] };
        return;
      }
    }
  }

  // Selected cut's handles (only when no child is selected, to keep clicks unambiguous).
  if (sel.cut >= 0 && sel.child < 0) {
    const cut = scene.cuts[sel.cut];
    for (let i = 0; i < cut.polygon.length; i++) {
      if (hitHandle(s, cut.polygon[i])) {
        sel.vertex = i;
        drag = { kind: "vertex", cut: sel.cut, index: i, origin: [...cut.polygon[i]] as Vec2 };
        render();
        return;
      }
    }
    if (cut.floor_y !== undefined) {
      const b = bbox(cut.polygon);
      const [x0, x1] = cut.walk ?? [b.min[0], b.max[0]];
      if (hitHandle(s, [x0, cut.floor_y])) { drag = { kind: "walk", cut: sel.cut, end: 0 }; return; }
      if (hitHandle(s, [x1, cut.floor_y])) { drag = { kind: "walk", cut: sel.cut, end: 1 }; return; }
      if (hitHandle(s, [(b.min[0] + b.max[0]) / 2, cut.floor_y])) { drag = { kind: "floor", cut: sel.cut }; return; }
    }
    if (hoverEdge && hoverEdge.cut === sel.cut) {
      cut.polygon.splice(hoverEdge.index + 1, 0, snap(hoverEdge.point));
      sel.vertex = hoverEdge.index + 1;
      drag = { kind: "vertex", cut: sel.cut, index: sel.vertex, origin: snap(hoverEdge.point) };
      hoverEdge = null;
      render();
      return;
    }
  }

  // Children (topmost z first, across all cuts, topmost cut first).
  for (let ci = scene.cuts.length - 1; ci >= 0; ci--) {
    const cut = scene.cuts[ci];
    const order = (cut.children ?? []).map((c, i) => ({ c, i })).sort((a, b) => (b.c.z ?? 1) - (a.c.z ?? 1));
    for (const { c, i } of order) {
      if (c.clip !== false && !contains(cut.polygon, w)) continue;
      if (childContains(c, w)) {
        selectCut(ci);
        sel.child = i;
        drag = { kind: "child", start: w, origin: [...c.pos] as Vec2 };
        renderPanels();
        render();
        return;
      }
    }
  }

  // Cut interior: select and drag the whole cut.
  for (let i = scene.cuts.length - 1; i >= 0; i--) {
    if (contains(scene.cuts[i].polygon, w)) {
      selectCut(i);
      sel.child = -1;
      drag = { kind: "cut", cut: i, start: w, origin: structuredClone(scene.cuts[i]) };
      renderPanels();
      render();
      return;
    }
  }
  sel.cut = -1;
  sel.vertex = -1;
  sel.child = -1;
  drag = { kind: "pan", start: s, viewStart: [view.x, view.y] };
  renderPanels();
  render();
});

canvas.addEventListener("mousemove", (e) => {
  altHeld = e.altKey;
  shiftHeld = e.shiftKey;
  const s = screenFromEvent(e);
  const w = toWorld(s);
  mouseWorld = w;
  setStatus(`${Math.round(w[0])}, ${Math.round(w[1])}${preview ? "   (preview)" : ""}`);

  if (flowDrag) {
    flowDrag.current = w;
    if (dist(toScreen(flowDrag.start), s) > 6 * devicePixelRatio) flowDrag.moved = true;
    render();
    return;
  }
  if (drag) {
    dirtyDuringDrag = true;
    switch (drag.kind) {
      case "pan":
        view.x = drag.viewStart[0] - (s[0] - drag.start[0]) / view.scale;
        view.y = drag.viewStart[1] + (s[1] - drag.start[1]) / view.scale;
        dirtyDuringDrag = false;
        break;
      case "vertex":
        scene.cuts[drag.cut].polygon[drag.index] = applyVertexSnap(w, drag.cut, drag.index, drag.origin);
        break;
      case "cut": {
        let target: Vec2 = w;
        if (shiftHeld) target = constrainAxis(drag.start, target);
        let dx = Math.round(target[0] - drag.start[0]), dy = Math.round(target[1] - drag.start[1]);
        if (!altHeld) {
          // Snap the moved bbox (edges/centre) to other cuts' vertices and centre lines.
          const b = bbox(drag.origin.polygon);
          const center = boxCenter(b);
          const cands = cutCandidates(drag.cut);
          const r = snapBox([center[0] + dx, center[1] + dy], boxSize(b), cands.xs, cands.ys, snapThreshold());
          guides = { x: r.guideX, y: r.guideY };
          dx = Math.round(r.point[0] - center[0]);
          dy = Math.round(r.point[1] - center[1]);
        } else guides = { x: null, y: null };
        scene.cuts[drag.cut] = moveCut(structuredClone(drag.origin), dx, dy);
        break;
      }
      case "floor":
        scene.cuts[drag.cut].floor_y = snap1(w[1]);
        break;
      case "walk": {
        const cut = scene.cuts[drag.cut];
        const b = bbox(cut.polygon);
        cut.walk ??= [b.min[0], b.max[0]];
        cut.walk[drag.end] = snap1(w[0]);
        if (cut.walk[0] > cut.walk[1]) cut.walk = [cut.walk[1], cut.walk[0]];
        break;
      }
      case "keyframe": {
        const f = selectedPath()![drag.index];
        if (drag.mode === "move") {
          f.x = snap1(w[0]);
          f.y = snap1(w[1]);
        } else {
          const half = Math.max(20, Math.abs(w[0] - f.x), (Math.abs(w[1] - f.y) * VIEW[0]) / VIEW[1]);
          f.zoom = Math.round(((half * 2) / VIEW[0]) * 100) / 100;
        }
        break;
      }
      case "child": {
        const child = selectedChild()!;
        const raw: Vec2 = [drag.origin[0] + w[0] - drag.start[0], drag.origin[1] + w[1] - drag.start[1]];
        child.pos = applyChildSnap(raw, childSize(child), sel.cut, sel.child, drag.origin);
        break;
      }
      case "resize": {
        const child = selectedChild()!;
        const o = drag.opposite;
        let cornerAt: Vec2 = w;
        if (!altHeld) {
          const cands = childCandidates(sel.cut, sel.child);
          const r = snapPoint(w, cands.xs, cands.ys, snapThreshold());
          guides = { x: r.guideX, y: r.guideY };
          cornerAt = r.point;
        } else guides = { x: null, y: null };
        const nw = Math.max(8, Math.abs(cornerAt[0] - o[0])), nh = Math.max(8, Math.abs(cornerAt[1] - o[1]));
        const size: Vec2 = [snap1(nw), snap1(nh)];
        child.pos = [snap1((cornerAt[0] + o[0]) / 2), snap1((cornerAt[1] + o[1]) / 2)];
        if (child.type === "text") child.box = size;
        else child.size = size;
        break;
      }
      case "tail": {
        const child = selectedChild()!;
        if (child.type === "balloon") child.tail = [snap1(w[0] - child.pos[0]), snap1(w[1] - child.pos[1])];
        break;
      }
    }
    render();
    return;
  }

  hoverEdge = null;
  if (tool === "select" && sel.cut >= 0 && sel.child < 0) {
    const cut = scene.cuts[sel.cut];
    const n = cut.polygon.length;
    let best = HIT * devicePixelRatio;
    for (let i = 0; i < n; i++) {
      const a = cut.polygon[i], b = cut.polygon[(i + 1) % n];
      const r = segmentDistance(s, toScreen(a), toScreen(b));
      if (r.d < best && !hitHandle(s, a) && !hitHandle(s, b)) {
        best = r.d;
        hoverEdge = { cut: sel.cut, index: i, point: [a[0] + (b[0] - a[0]) * r.t, a[1] + (b[1] - a[1]) * r.t] };
      }
    }
  }
  if (drawing.length || hoverEdge || tool === "select") render();
});

window.addEventListener("mouseup", () => {
  guides = { x: null, y: null };
  if (flowDrag) { flowMouseUp(); return; }
  if (!drag) return;
  const wasEdit = drag.kind !== "pan" && dirtyDuringDrag;
  drag = null;
  dirtyDuringDrag = false;
  if (wasEdit) commit();
  else render();
});

canvas.addEventListener("dblclick", () => {
  if (tool === "draw" && drawing.length >= 3) finishDrawing();
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const s = screenFromEvent(e);
  const before = toWorld(s);
  view.scale *= Math.exp(-e.deltaY * 0.0015);
  view.scale = Math.max(0.05, Math.min(8, view.scale));
  const after = toWorld(s);
  view.x += before[0] - after[0];
  view.y += before[1] - after[1];
  render();
}, { passive: false });

window.addEventListener("keydown", (e) => { altHeld = e.altKey; shiftHeld = e.shiftKey; if (e.key === "Alt") e.preventDefault(); });
window.addEventListener("keyup", (e) => { altHeld = e.altKey; shiftHeld = e.shiftKey; });
window.addEventListener("blur", () => { altHeld = false; shiftHeld = false; });

window.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if (preview) {
    if (e.code === "Space") {
      e.preventDefault();
      if (preview.waiting) nextStep();
    } else if (e.key === "Escape") stopPreview();
    return;
  }
  const child = selectedChild();
  if (child && e.key.startsWith("Arrow")) {
    const step = e.shiftKey ? 10 : 1;
    const d: Record<string, Vec2> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    child.pos = [child.pos[0] + d[e.key][0], child.pos[1] + d[e.key][1]];
    e.preventDefault();
    commit();
    return;
  }
  if (tool === "flow") {
    if (e.key === "Delete" || e.key === "Backspace") { deleteFlowNode(); return; }
    if (e.key === "Escape") {
      if (pendingEntry) pendingEntry = false;
      else { sel.entry = false; sel.step = -1; sel.keyframe = -1; }
      renderFlow(); renderFlowBar(); render();
      return;
    }
  }
  switch (e.key) {
    case "v": case "V": setTool("select"); break;
    case "p": case "P": setTool("draw"); break;
    case "f": case "F": setTool(tool === "flow" ? "select" : "flow"); break;
    case "Enter": if (tool === "draw" && drawing.length >= 3) finishDrawing(); break;
    case "Escape":
      if (drawing.length) { drawing = []; render(); }
      else if (sel.child >= 0) { sel.child = -1; renderPanels(); render(); }
      else { sel.vertex = -1; sel.keyframe = -1; render(); renderFlow(); }
      break;
    case "Delete": case "Backspace":
      if (child) {
        deleteChild();
      } else if (sel.cut >= 0 && sel.vertex >= 0) {
        const cut = scene.cuts[sel.cut];
        if (cut.polygon.length > 3) { cut.polygon.splice(sel.vertex, 1); sel.vertex = -1; commit(); }
      } else if (selectedPath() && sel.keyframe >= 0) {
        selectedPath()!.splice(sel.keyframe, 1);
        sel.keyframe = -1;
        commit();
      } else if (drawing.length) {
        drawing.pop();
        render();
      }
      break;
    case "d": case "D":
      if ((e.ctrlKey || e.metaKey) && child) { e.preventDefault(); duplicateChild(); }
      break;
  }
});

window.addEventListener("resize", render);

function snap1(v: number): number {
  return Math.round(v);
}
function snap(p: Vec2): Vec2 {
  return [snap1(p[0]), snap1(p[1])];
}

function moveCut(cut: Cut, dx: number, dy: number): Cut {
  cut.polygon = cut.polygon.map(([x, y]) => [x + dx, y + dy]);
  if (cut.floor_y !== undefined) cut.floor_y += dy;
  if (cut.walk) cut.walk = [cut.walk[0] + dx, cut.walk[1] + dx];
  for (const ch of cut.children ?? []) ch.pos = [ch.pos[0] + dx, ch.pos[1] + dy];
  return cut;
}

function finishDrawing() {
  const id = uniqueId(`cut_${scene.cuts.length + 1}`);
  scene.cuts.push({ id, polygon: drawing.map(snap), fill: "dark", children: [] });
  drawing = [];
  selectCut(scene.cuts.length - 1);
  setTool("select");
  commit();
}

function setTool(t: Tool) {
  tool = t;
  drawing = [];
  pendingEntry = false;
  flowDrag = null;
  if (t === "flow" && sel.trigger < 0 && scene.flow.length) sel.trigger = 0;
  renderFlowBar();
  document.querySelectorAll<HTMLButtonElement>("button.tool").forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
  canvas.style.cursor = t === "draw" ? "crosshair" : "default";
  render();
}

function setStatus(text: string) {
  statusEl.textContent = text;
}

function fitView() {
  const all = scene.cuts.flatMap((c) => c.polygon);
  if (!all.length) { view.x = 0; view.y = 0; view.scale = 0.5; return; }
  const b = bbox(all);
  const [w, h] = boxSize(b);
  [view.x, view.y] = boxCenter(b);
  const cw = canvas.clientWidth * devicePixelRatio || 800;
  const ch = canvas.clientHeight * devicePixelRatio || 600;
  view.scale = Math.min(cw / (w + 200), ch / (h + 200));
}

// ---------- children: add / delete / duplicate ----------

function addChild(type: Child["type"]) {
  if (sel.cut < 0) return;
  const cut = scene.cuts[sel.cut];
  const center = boxCenter(bbox(cut.polygon)).map(Math.round) as Vec2;
  let child: Child;
  switch (type) {
    case "sprite":
      child = { type, id: uniqueId("sprite"), pos: center, z: 2, size: [142, 142], frames: ["mouse:0"], mode: "cycle" };
      break;
    case "balloon":
      child = { type, id: uniqueId("balloon"), pos: [center[0], center[1] + 150], z: 5, size: [320, 130], tail: [60, -170], kind: "speech", line: "", clip: false };
      break;
    case "text":
      child = { type, id: uniqueId("text"), pos: center, z: 3, text: "TEXT", size: 22, color: "paper" };
      break;
    default:
      child = { type: "shape", id: uniqueId("shape"), pos: center, z: 0, shape: "ellipse", size: [200, 120], color: "#f2b859", alpha: 0.25 };
  }
  cut.children ??= [];
  cut.children.push(child);
  sel.child = cut.children.length - 1;
  commit();
}

function deleteChild() {
  const cut = scene.cuts[sel.cut];
  const child = cut.children![sel.child];
  cut.children!.splice(sel.child, 1);
  // Drop flow steps that referred to a removed balloon.
  for (const t of scene.flow) t.steps = t.steps.filter((s) => !("say" in s && s.say === child.id));
  sel.child = -1;
  commit();
}

function duplicateChild() {
  const cut = scene.cuts[sel.cut];
  const copy = structuredClone(cut.children![sel.child]);
  copy.id = uniqueId(copy.id);
  copy.pos = [copy.pos[0] + 20, copy.pos[1] - 20];
  cut.children!.splice(sel.child + 1, 0, copy);
  sel.child += 1;
  commit();
}

function renameChild(child: Child, newId: string) {
  const old = child.id;
  if (!newId || newId === old) return;
  child.id = newId;
  for (const t of scene.flow) for (const s of t.steps) if ("say" in s && s.say === old) s.say = newId;
}

// ---------- flow mode ----------

const FLOW_R = 13; // css px

function flowNodes(ti: number): FlowNode[] {
  return layoutFlow(scene, scene.flow[ti]);
}

/** 1-based step index of the selected node, 0 for the entry, -1 for none. */
function selectedNodeIndex(): number {
  if (sel.trigger < 0) return -1;
  if (sel.entry) return 0;
  return sel.step >= 0 ? sel.step + 1 : -1;
}

function selectNode(ti: number, node: number, keyframe = -1) {
  sel.trigger = ti;
  sel.entry = node === 0;
  sel.step = node > 0 ? node - 1 : -1;
  sel.keyframe = keyframe;
  renderFlow();
  renderFlowBar();
  render();
}

/** Where new steps go: right after the selected node, else at the end. */
function insertionIndex(): number {
  const n = selectedNodeIndex();
  if (sel.trigger < 0) return 0;
  return n < 0 ? scene.flow[sel.trigger].steps.length : n;
}

function addFlowStep(step: Step) {
  if (sel.trigger < 0) {
    if (!scene.flow.length) return;
    sel.trigger = 0;
  }
  const idx = insertStep(scene.flow[sel.trigger], step, insertionIndex());
  sel.entry = false;
  sel.step = idx - 1;
  sel.keyframe = "path" in step ? step.path.length - 1 : -1;
  commit();
  renderFlowBar();
}

function childAt(w: Vec2): { cutIndex: number; childIndex: number; child: Child } | null {
  for (let ci = scene.cuts.length - 1; ci >= 0; ci--) {
    const cut = scene.cuts[ci];
    const order = (cut.children ?? []).map((c, i) => ({ c, i })).sort((a, b) => (b.c.z ?? 1) - (a.c.z ?? 1));
    for (const { c, i } of order) {
      if (c.clip !== false && !contains(cut.polygon, w)) continue;
      if (childContains(c, w)) return { cutIndex: ci, childIndex: i, child: c };
    }
  }
  return null;
}

function cutIndexAt(w: Vec2): number {
  for (let i = scene.cuts.length - 1; i >= 0; i--) if (contains(scene.cuts[i].polygon, w)) return i;
  return -1;
}

function hitFlowNode(s: Vec2): { trigger: number; node: FlowNode } | null {
  const order = [...scene.flow.keys()];
  if (sel.trigger >= 0) order.sort((a, b) => (a === sel.trigger ? -1 : b === sel.trigger ? 1 : 0));
  for (const ti of order) {
    const nodes = flowNodes(ti);
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (dist(s, toScreen(nodes[i].pos)) <= (FLOW_R + 3) * devicePixelRatio) return { trigger: ti, node: nodes[i] };
    }
  }
  return null;
}

function flowMouseDown(s: Vec2, w: Vec2, e: MouseEvent) {
  if (preview) return;
  if (pendingEntry) {
    const hit = childAt(w);
    const trigger: Trigger = hit ? { on: "z", target: hit.child.id, range: 80, steps: [] } : { on: "z", steps: [] };
    scene.flow.push(trigger);
    pendingEntry = false;
    sel.trigger = scene.flow.length - 1;
    sel.entry = true;
    sel.step = -1;
    commit();
    renderFlowBar();
    return;
  }
  const node = hitFlowNode(s);
  if (node) {
    selectNode(node.trigger, node.node.index, node.node.keyframe ?? -1);
    flowDrag = { trigger: node.trigger, node: node.node.index, start: w, current: w, moved: false };
    return;
  }
  if (!scene.flow.length) {
    setStatus("No flow yet: use + entry, then click an object.");
    return;
  }
  if (sel.trigger < 0) sel.trigger = 0;
  const ci = cutIndexAt(w);
  if (e.shiftKey) {
    const zoom = ci >= 0 ? cutCamera(scene.cuts[ci]).zoom : 1;
    const current = sel.step >= 0 ? scene.flow[sel.trigger].steps[sel.step] : undefined;
    if (current && "path" in current) {
      const last = current.path[current.path.length - 1];
      current.path.push({ x: snap1(w[0]), y: snap1(w[1]), zoom: last ? last.zoom : Math.round(zoom * 100) / 100, t: last ? Math.round((last.t + 1) * 10) / 10 : 1 });
      sel.keyframe = current.path.length - 1;
      commit();
    } else {
      addFlowStep({ path: [{ x: snap1(w[0]), y: snap1(w[1]), zoom: Math.round(zoom * 100) / 100, t: 1 }] });
    }
    return;
  }
  if (e.altKey) {
    if (ci >= 0 && scene.cuts[ci].floor_y !== undefined) addFlowStep({ player: { cut: scene.cuts[ci].id, x: snap1(w[0]) } });
    else setStatus("Alt+click a cut with a floor to add a player move.");
    return;
  }
  const hit = childAt(w);
  if (hit && hit.child.type === "balloon") {
    addFlowStep({ say: hit.child.id });
    return;
  }
  if (ci >= 0) addFlowStep({ focus: scene.cuts[ci].id });
}

function flowMouseUp() {
  if (!flowDrag) return;
  const d = flowDrag;
  flowDrag = null;
  if (!d.moved) { render(); return; }
  const s = toScreen(d.current);
  const trigger = scene.flow[d.trigger];
  if (d.node === 0) {
    // Entry node dropped on an object: re-target it.
    const hit = childAt(d.current);
    if (hit) { trigger.target = hit.child.id; trigger.range ??= 80; commit(); }
    else { delete trigger.target; commit(); }
    renderFlowBar();
    return;
  }
  const over = hitFlowNode(s);
  if (over && over.trigger === d.trigger && over.node.index !== d.node) {
    const before = over.node.index === 0 ? 1 : over.node.index;
    const idx = moveStep(trigger, d.node, before);
    sel.step = idx - 1;
    sel.entry = false;
    commit();
  } else if (!over) {
    // Dropped past the end of the chain: move to the end.
    const nodes = flowNodes(d.trigger);
    const last = nodes[nodes.length - 1];
    if (last && dist(s, toScreen(last.pos)) > FLOW_R * 4 * devicePixelRatio && d.node !== trigger.steps.length) {
      // Only when dropped near the last node's far side; otherwise ignore the drop.
      const lastScreen = toScreen(last.pos);
      if (dist(s, lastScreen) < 80 * devicePixelRatio) {
        const idx = moveStep(trigger, d.node, trigger.steps.length + 1);
        sel.step = idx - 1;
        commit();
      }
    }
  }
  render();
}

function deleteFlowNode() {
  if (sel.trigger < 0) return;
  if (sel.entry) {
    scene.flow.splice(sel.trigger, 1);
    sel.trigger = scene.flow.length ? Math.min(sel.trigger, scene.flow.length - 1) : -1;
    sel.entry = false;
    sel.step = -1;
  } else if (sel.step >= 0) {
    const step = scene.flow[sel.trigger].steps[sel.step];
    if ("path" in step && sel.keyframe >= 0 && step.path.length > 1) {
      step.path.splice(sel.keyframe, 1);
      sel.keyframe = Math.min(sel.keyframe, step.path.length - 1);
    } else {
      removeStep(scene.flow[sel.trigger], sel.step + 1);
      sel.step = -1;
      sel.keyframe = -1;
    }
  }
  commit();
  renderFlowBar();
}

function shiftFlowNode(delta: number) {
  if (sel.trigger < 0 || sel.step < 0) return;
  const trigger = scene.flow[sel.trigger];
  const from = sel.step + 1;
  const to = from + delta;
  if (to < 1 || to > trigger.steps.length) return;
  const idx = moveStep(trigger, from, delta > 0 ? to + 1 : to);
  sel.step = idx - 1;
  commit();
}

function drawArrow(a: Vec2, b: Vec2, color: string) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len;
  const r = FLOW_R * devicePixelRatio;
  const start: Vec2 = [a[0] + ux * r, a[1] + uy * r];
  const end: Vec2 = [b[0] - ux * (r + 2 * devicePixelRatio), b[1] - uy * (r + 2 * devicePixelRatio)];
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  line(start, end);
  const h = 7 * devicePixelRatio;
  ctx.beginPath();
  ctx.moveTo(end[0], end[1]);
  ctx.lineTo(end[0] - ux * h - uy * h * 0.5, end[1] - uy * h + ux * h * 0.5);
  ctx.lineTo(end[0] - ux * h + uy * h * 0.5, end[1] - uy * h - ux * h * 0.5);
  ctx.closePath();
  ctx.fill();
}

function drawFlowGraph() {
  if (tool !== "flow") return;
  const dpr = devicePixelRatio;
  scene.flow.forEach((trigger, ti) => {
    const active = ti === sel.trigger || sel.trigger < 0;
    const color = active ? COLORS.flow : COLORS.flowDim;
    const nodes = flowNodes(ti);
    ctx.lineWidth = (active ? 1.5 : 1) * dpr;
    for (let i = 1; i < nodes.length; i++) drawArrow(toScreen(nodes[i - 1].pos), toScreen(nodes[i].pos), color);
    for (const n of nodes) {
      const s = toScreen(n.pos);
      const selected = ti === sel.trigger && ((n.index === 0 && sel.entry) || (n.index > 0 && sel.step === n.index - 1 && (n.keyframe === undefined || n.keyframe === sel.keyframe)));
      const r = FLOW_R * dpr;
      ctx.beginPath();
      if (n.index === 0) {
        ctx.moveTo(s[0], s[1] - r * 1.3);
        ctx.lineTo(s[0] + r * 1.3, s[1]);
        ctx.lineTo(s[0], s[1] + r * 1.3);
        ctx.lineTo(s[0] - r * 1.3, s[1]);
        ctx.closePath();
      } else {
        ctx.arc(s[0], s[1], r, 0, Math.PI * 2);
      }
      ctx.fillStyle = selected ? COLORS.flow : "#2a2622";
      ctx.fill();
      ctx.strokeStyle = selected ? "#ffffff" : color;
      ctx.lineWidth = (selected ? 2.5 : 1.5) * dpr;
      ctx.stroke();
      ctx.fillStyle = selected ? "#1a1714" : color;
      ctx.font = `bold ${11 * dpr}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(n.keyframe !== undefined && n.keyframe > 0 ? `${n.index}.${n.keyframe + 1}` : String(n.index), s[0], s[1] + 4 * dpr);
      ctx.textAlign = "left";
      ctx.font = `${11 * dpr}px sans-serif`;
      if (n.label && (active || n.index === 0)) {
        ctx.fillStyle = color;
        ctx.fillText(n.label, s[0] + r + 4 * dpr, s[1] - r);
      }
    }
    ctx.lineWidth = 1 * dpr;
  });
  if (flowDrag && flowDrag.moved) {
    const nodes = flowNodes(flowDrag.trigger);
    const from = nodes.find((n) => n.index === flowDrag!.node);
    if (from) {
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.strokeStyle = "#ffffff";
      line(toScreen(from.pos), toScreen(flowDrag.current));
      ctx.setLineDash([]);
      const s = toScreen(flowDrag.current);
      ctx.beginPath();
      ctx.arc(s[0], s[1], FLOW_R * dpr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (pendingEntry) {
    ctx.fillStyle = COLORS.flow;
    ctx.font = `${13 * dpr}px sans-serif`;
    ctx.fillText("Click an object (or empty space) to place the new entry point…", 12 * dpr, canvas.height - 12 * dpr);
    ctx.font = `${11 * dpr}px sans-serif`;
  }
}

function renderFlowBar() {
  flowBar.style.display = tool === "flow" ? "flex" : "none";
  if (tool !== "flow") return;
  const trigger = sel.trigger >= 0 ? scene.flow[sel.trigger] : undefined;
  const items: Node[] = [];
  items.push(button(pendingEntry ? "click a target…" : "+ entry", () => { pendingEntry = !pendingEntry; renderFlowBar(); render(); }, pendingEntry ? "small active" : "small"));
  if (trigger) {
    items.push(el("span", { class: "muted" }, ` flow ${sel.trigger + 1}/${scene.flow.length}: `));
    items.push(button("+ wait", () => addFlowStep({ wait: 0.5 })));
    items.push(button("+ return", () => addFlowStep({ return: true })));
    items.push(button("◀", () => shiftFlowNode(-1)));
    items.push(button("▶", () => shiftFlowNode(1)));
    items.push(button("delete", deleteFlowNode));
    if (sel.entry) {
      items.push(el("span", { class: "muted" }, " entry:"));
      items.push(selectInput(trigger.on, ["z", "near", "right_edge", "left_edge", "enter"].map((v) => ({ value: v })), (v) => { trigger.on = v as TriggerKind; commit(); renderFlowBar(); }));
      if (trigger.on === "z" || trigger.on === "near") {
        items.push(el("span", { class: "muted" }, trigger.target ? ` @${trigger.target}` : " (anywhere — drag onto an object)"));
        if (trigger.target) {
          items.push(el("span", { class: "muted" }, " range"));
          items.push(numInline(trigger.range ?? 80, (v) => { trigger.range = v; commit(); }, 10));
          items.push(button("detach", () => { delete trigger.target; delete trigger.range; commit(); renderFlowBar(); }));
        }
      }
    }
  } else {
    items.push(el("span", { class: "muted" }, " click a node to select a flow, or + entry to start one"));
  }
  items.push(el("span", { class: "muted hint" }, "  click balloon = say · click cut = focus · Shift+click = camera path · Alt+click floor = player · drag node onto node = reorder"));
  flowBar.replaceChildren(...items);
}

// ---------- panels ----------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

function row(label: string, ...inputs: Node[]): HTMLElement {
  return el("div", { class: "row" }, el("label", {}, label), ...inputs);
}

function numberInput(value: number | undefined, onChange: (v: number) => void, step = 1): HTMLInputElement {
  const i = el("input", { type: "number", step: String(step), value: value === undefined ? "" : String(value) });
  i.addEventListener("change", () => onChange(Number(i.value)));
  return i;
}

function textInput(value: string | undefined, onChange: (v: string) => void): HTMLInputElement {
  const i = el("input", { type: "text", value: value ?? "" });
  i.addEventListener("change", () => onChange(i.value));
  return i;
}

function checkbox(value: boolean, onChange: (v: boolean) => void): HTMLInputElement {
  const i = el("input", { type: "checkbox" });
  i.checked = value;
  i.addEventListener("change", () => onChange(i.checked));
  return i;
}

function selectInput(value: string | undefined, options: { value: string; label?: string }[], onChange: (v: string) => void): HTMLSelectElement {
  const s = el("select");
  for (const o of options) {
    const opt = el("option", { value: o.value }, o.label ?? o.value);
    if (o.value === value) opt.selected = true;
    s.append(opt);
  }
  if (value !== undefined && !options.some((o) => o.value === value)) {
    const opt = el("option", { value }, value + " (missing)");
    opt.selected = true;
    s.append(opt);
  }
  s.addEventListener("change", () => onChange(s.value));
  return s;
}

function button(label: string, onClick: () => void, cls = "small"): HTMLButtonElement {
  const b = el("button", { class: cls }, label);
  b.addEventListener("click", onClick);
  return b;
}

function renderPanels() {
  renderCutList();
  renderProps();
  renderFlow();
  renderFlowBar();
}

function renderCutList() {
  cutListEl.replaceChildren(
    ...scene.cuts.map((c, i) => {
      const li = el("li", { class: i === sel.cut ? "selected" : "" }, el("span", {}, c.id), el("span", { class: "muted" }, `${c.polygon.length} pts · ${(c.children ?? []).length} ch`));
      li.addEventListener("click", () => {
        selectCut(i);
        sel.child = -1;
        renderPanels();
        render();
      });
      return li;
    })
  );
}

function renderProps() {
  if (sel.cut < 0) {
    propsEl.replaceChildren(el("div", { class: "muted" }, "Select a cut, or press P to draw one."));
    return;
  }
  const child = selectedChild();
  if (child) {
    renderChildProps(child);
    return;
  }
  const cut = scene.cuts[sel.cut];
  const b = bbox(cut.polygon);
  const hasFloor = cut.floor_y !== undefined;
  const floorToggle = checkbox(hasFloor, (on) => {
    if (on) {
      cut.floor_y = Math.round(b.min[1] + boxSize(b)[1] * 0.16);
      cut.walk = [Math.round(b.min[0] + boxSize(b)[0] * 0.13), Math.round(b.max[0] - boxSize(b)[0] * 0.13)];
    } else {
      delete cut.floor_y;
      delete cut.walk;
    }
    commit();
  });
  const children = el("ul", { class: "children" }, ...(cut.children ?? []).map((ch, i) => {
    const li = el("li", {}, `${ch.type}: ${ch.id}${ch.clip === false ? " (overflow)" : ""}`);
    li.addEventListener("click", () => { sel.child = i; renderProps(); render(); });
    return li;
  }));
  propsEl.replaceChildren(
    row("id", textInput(cut.id, (v) => { renameCut(cut, v); commit(); })),
    row("label", textInput(cut.label, (v) => { if (v) cut.label = v; else delete cut.label; commit(); })),
    row("fill", selectInput(cut.fill ?? "dark", [{ value: "dark" }, { value: "paper" }], (v) => { cut.fill = v; commit(); })),
    row("floor", floorToggle, hasFloor ? numberInput(cut.floor_y, (v) => { cut.floor_y = v; commit(); }) : el("span", { class: "muted" }, "player cannot enter")),
    ...(hasFloor
      ? [row("walk", numberInput(cut.walk?.[0] ?? b.min[0], (v) => { cut.walk = [v, cut.walk?.[1] ?? b.max[0]]; commit(); }), numberInput(cut.walk?.[1] ?? b.max[0], (v) => { cut.walk = [cut.walk?.[0] ?? b.min[0], v]; commit(); }))]
      : []),
    row("bbox", el("span", { class: "muted" }, `${Math.round(boxSize(b)[0])} × ${Math.round(boxSize(b)[1])}  zoom ${cutCamera(cut).zoom.toFixed(2)}`)),
    el("div", { class: "row" }, button("Delete cut", () => { scene.cuts.splice(sel.cut, 1); sel.cut = -1; sel.child = -1; commit(); })),
    el("div", { class: "row" }, el("label", {}, "add"), button("sprite", () => addChild("sprite")), button("balloon", () => addChild("balloon")), button("text", () => addChild("text")), button("shape", () => addChild("shape"))),
    el("div", { class: "muted" }, `children (${(cut.children ?? []).length}) — click to select`),
    children
  );
}

function renderChildProps(child: Child) {
  const cut = scene.cuts[sel.cut];
  const back = button(`← ${cut.id}`, () => { sel.child = -1; renderProps(); render(); });
  const rows: Node[] = [
    el("div", { class: "row" }, back, el("span", { class: "muted" }, ` ${child.type}`)),
    row("id", textInput(child.id, (v) => { renameChild(child, v); commit(); })),
    row("pos", numberInput(child.pos[0], (v) => { child.pos = [v, child.pos[1]]; commit(); }), numberInput(child.pos[1], (v) => { child.pos = [child.pos[0], v]; commit(); })),
    row("z", numberInput(child.z ?? 1, (v) => { child.z = v; commit(); }, 0.5), el("label", {}, "clip"), checkbox(child.clip !== false, (v) => { if (v) delete child.clip; else child.clip = false; commit(); })),
  ];
  if (child.type !== "text") {
    rows.push(row("size", numberInput(child.size[0], (v) => { child.size = [v, child.size[1]]; commit(); }), numberInput(child.size[1], (v) => { child.size = [child.size[0], v]; commit(); })));
  }
  if (child.type === "sprite") rows.push(...spriteRows(child));
  else if (child.type === "balloon") rows.push(...balloonRows(child));
  else if (child.type === "text") {
    rows.push(
      row("text", textInput(child.text, (v) => { child.text = v; commit(); })),
      row("font px", numberInput(child.size ?? 22, (v) => { child.size = v; commit(); })),
      row("color", textInput(child.color ?? "ink", (v) => { child.color = v; commit(); })),
      row("box", numberInput(child.box?.[0], (v) => { child.box = [v, child.box?.[1] ?? 40]; commit(); }), numberInput(child.box?.[1], (v) => { child.box = [child.box?.[0] ?? 200, v]; commit(); }),
        button("none", () => { delete child.box; commit(); }))
    );
  } else {
    rows.push(
      row("shape", selectInput(child.shape, [{ value: "ellipse" }, { value: "rect" }], (v) => { child.shape = v as "ellipse" | "rect"; commit(); })),
      row("color", textInput(child.color ?? "ink", (v) => { child.color = v; commit(); })),
      row("alpha", numberInput(child.alpha ?? 1, (v) => { child.alpha = v; commit(); }, 0.05))
    );
  }
  rows.push(el("div", { class: "row" }, button("Duplicate (Ctrl+D)", duplicateChild), button("Delete", deleteChild)));
  rows.push(el("div", { class: "muted" }, "Drag to move, corner handles to resize, arrows to nudge (Shift = 10)."));
  propsEl.replaceChildren(...rows);
}

function spriteRows(child: SpriteChild): Node[] {
  const atlasNames = Object.keys(ATLASES);
  const current = parseFrame(child.frames[0] ?? "")?.atlas ?? atlasNames[0];
  const strip = el("div", { class: "frames" });
  for (let i = 0; i < frameCount(current); i++) {
    const frame = `${current}:${i}`;
    const used = child.frames.indexOf(frame);
    const cell = el("button", { class: "frame" + (used >= 0 ? " used" : ""), title: frame }, used >= 0 ? `${frame} #${used + 1}` : frame);
    const thumb = document.createElement("canvas");
    thumb.width = 44; thumb.height = 44;
    cell.prepend(thumb);
    drawThumb(thumb, frame);
    cell.addEventListener("click", () => {
      if (used >= 0) child.frames.splice(used, 1);
      else child.frames.push(frame);
      if (!child.frames.length) child.frames.push(frame);
      commit();
    });
    strip.append(cell);
  }
  return [
    row("atlas", selectInput(current, atlasNames.map((v) => ({ value: v })), (v) => { child.frames = [`${v}:0`]; commit(); })),
    row("frames", textInput(child.frames.join(", "), (v) => { const f = v.split(",").map((s) => s.trim()).filter(Boolean); if (f.length) child.frames = f; commit(); })),
    el("div", { class: "muted" }, "click cells to add/remove frames (order = beat order)"),
    strip,
    row("mode", selectInput(child.mode ?? "cycle", [{ value: "cycle" }, { value: "hold" }], (v) => { if (v === "cycle") delete child.mode; else child.mode = "hold"; commit(); })),
    row("flip", checkbox(!!child.flip, (v) => { if (v) child.flip = true; else delete child.flip; commit(); })),
    row("tint", textInput(child.tint ?? "", (v) => { if (v) child.tint = v; else delete child.tint; commit(); })),
  ];
}

function drawThumb(thumb: HTMLCanvasElement, frame: string) {
  const parsed = parseFrame(frame);
  const atlas = parsed && ATLASES[parsed.atlas];
  const img = parsed ? atlasImage(parsed.atlas) : null;
  const paint = () => {
    const g = thumb.getContext("2d")!;
    g.clearRect(0, 0, thumb.width, thumb.height);
    if (!atlas || !img || !img.naturalWidth || !parsed) {
      g.strokeStyle = "#888";
      g.strokeRect(2, 2, thumb.width - 4, thumb.height - 4);
      return;
    }
    const cw = img.naturalWidth / atlas.cols, chh = img.naturalHeight / atlas.rows;
    g.drawImage(img, (parsed.index % atlas.cols) * cw, Math.floor(parsed.index / atlas.cols) * chh, cw, chh, 0, 0, thumb.width, thumb.height);
  };
  if (img && !img.complete) img.addEventListener("load", paint, { once: true });
  paint();
}

function balloonRows(child: BalloonChild): Node[] {
  const lineIds = [...dialogue.keys()].map((id) => ({ value: id, label: `${id} — ${(dialogue.get(id)?.text ?? "").split("\n")[0].slice(0, 28)}` }));
  const tailOn = hasTail(child.tail);
  const text = dialogue.get(child.line)?.text;
  return [
    row("kind", selectInput(child.kind ?? "speech", [{ value: "speech", label: "speech (oval)" }, { value: "shout", label: "shout (jagged)" }, { value: "thought", label: "thought (cloud)" }], (v) => { child.kind = v as BalloonKind; commit(); })),
    row("line", lineIds.length ? selectInput(child.line, lineIds, (v) => { child.line = v; commit(); }) : textInput(child.line, (v) => { child.line = v; commit(); })),
    el("div", { class: "muted dialogue" }, text ?? (child.line ? "(line not found in dialogue file)" : "(no line)")),
    row("tail", checkbox(tailOn, (v) => { if (v) child.tail = [60, -(child.size[1] / 2 + 80)]; else delete child.tail; commit(); }),
      ...(tailOn ? [numberInput(child.tail![0], (v) => { child.tail = [v, child.tail![1]]; commit(); }), numberInput(child.tail![1], (v) => { child.tail = [child.tail![0], v]; commit(); })] : [el("span", { class: "muted" }, "none")])),
    el("div", { class: "muted" }, tailOn ? "drag the orange handle to aim the tail" : ""),
    row("initially", selectInput(child.initially ?? "hidden", [{ value: "hidden" }, { value: "shown" }], (v) => { if (v === "hidden") delete child.initially; else child.initially = "shown"; commit(); })),
  ];
}

function renameCut(cut: Cut, newId: string) {
  const old = cut.id;
  if (!newId || newId === old) return;
  cut.id = newId;
  if (scene.player.cut === old) scene.player.cut = newId;
  for (const t of scene.flow) for (const s of t.steps) {
    if ("focus" in s && s.focus === old) s.focus = newId;
    if ("player" in s && s.player.cut === old) s.player.cut = newId;
  }
}

const STEP_KINDS = ["focus", "say", "path", "wait", "player", "return"] as const;

function defaultStep(kind: string): Step {
  switch (kind) {
    case "focus": return { focus: scene.cuts[0]?.id ?? "" };
    case "say": return { say: balloonIds()[0]?.id ?? "" };
    case "path": return { path: [{ x: Math.round(view.x), y: Math.round(view.y), zoom: 1, t: 1 }] };
    case "wait": return { wait: 0.5 };
    case "player": return { player: { cut: scene.player.cut, x: scene.player.x } };
    default: return { return: true };
  }
}

function renderFlow() {
  const cutOptions = scene.cuts.map((c) => ({ value: c.id }));
  const balloonOptions = balloonIds().map((b) => ({ value: b.id, label: `${b.id} (${b.cut})` }));
  const triggers = scene.flow.map((trigger, ti) => {
    const header = el("header", { class: ti === sel.trigger && sel.entry ? "selected" : "" },
      selectInput(trigger.on, ["z", "near", "right_edge", "left_edge", "enter"].map((v) => ({ value: v })), (v) => { trigger.on = v as TriggerKind; commit(); }),
      el("span", { class: "muted" }, trigger.target ? `@${trigger.target}` : ""),
      selectInput(trigger.when ?? "always", [{ value: "always" }, { value: "flow_done" }], (v) => { if (v === "always") delete trigger.when; else trigger.when = "flow_done"; commit(); }),
      button("▶", () => { sel.trigger = ti; startPreview(ti); }),
      button("×", () => { scene.flow.splice(ti, 1); if (sel.trigger === ti) { sel.trigger = -1; sel.step = -1; } commit(); })
    );
    const steps = trigger.steps.map((step, si) => renderStep(trigger, step, ti, si, cutOptions, balloonOptions));
    const add = button("+ step", () => { trigger.steps.push(defaultStep("say")); sel.trigger = ti; sel.step = trigger.steps.length - 1; commit(); });
    const box = el("div", { class: "trigger" + (ti === sel.trigger ? " selected" : "") }, header, ...steps, el("div", { class: "step" }, add));
    box.addEventListener("click", () => { if (sel.trigger !== ti) { sel.trigger = ti; sel.step = -1; sel.keyframe = -1; sel.entry = false; renderFlow(); renderFlowBar(); render(); } });
    return box;
  });
  flowEl.replaceChildren(...triggers, button("+ trigger", () => { scene.flow.push({ on: "z", steps: [] }); sel.trigger = scene.flow.length - 1; commit(); }));
}

function renderStep(trigger: Trigger, step: Step, ti: number, si: number, cutOptions: { value: string }[], balloonOptions: { value: string; label: string }[]): HTMLElement {
  const kind = stepKind(step);
  const params: Node[] = [];
  if ("focus" in step) params.push(selectInput(step.focus, cutOptions, (v) => { step.focus = v; commit(); }));
  else if ("say" in step) params.push(selectInput(step.say, balloonOptions, (v) => { step.say = v; commit(); }));
  else if ("path" in step) {
    params.push(el("span", { class: "muted" }, `${step.path.length} kf`));
    params.push(button("+ kf", () => {
      const last = step.path[step.path.length - 1];
      step.path.push(last ? { x: last.x + 100, y: last.y, zoom: last.zoom, t: Math.round((last.t + 1) * 10) / 10 } : { x: Math.round(view.x), y: Math.round(view.y), zoom: 1, t: 1 });
      sel.trigger = ti; sel.step = si; sel.keyframe = step.path.length - 1;
      commit();
    }));
    if (sel.trigger === ti && sel.step === si && sel.keyframe >= 0) {
      const f = step.path[sel.keyframe];
      params.push(el("span", { class: "muted" }, `#${sel.keyframe + 1} t`), numInline(f.t, (v) => { f.t = v; commit(); }, 0.1), el("span", { class: "muted" }, "zoom"), numInline(f.zoom, (v) => { f.zoom = v; commit(); }, 0.05),
        selectInput(f.ease ?? "smooth", [{ value: "smooth" }, { value: "linear" }], (v) => { if (v === "smooth") delete f.ease; else f.ease = "linear"; commit(); }));
    }
  } else if ("wait" in step) params.push(numInline(step.wait, (v) => { step.wait = v; commit(); }, 0.1));
  else if ("player" in step) {
    params.push(selectInput(step.player.cut, cutOptions, (v) => { step.player.cut = v; commit(); }), numInline(step.player.x, (v) => { step.player.x = v; commit(); }));
  }
  const kindSel = selectInput(kind, STEP_KINDS.map((v) => ({ value: v })), (v) => { trigger.steps[si] = defaultStep(v); commit(); });
  const rowEl = el("div", { class: "step" + (ti === sel.trigger && si === sel.step ? " selected" : "") },
    el("span", { class: "idx" }, String(si + 1)), kindSel, ...params,
    button("↑", () => { if (si > 0) { [trigger.steps[si - 1], trigger.steps[si]] = [trigger.steps[si], trigger.steps[si - 1]]; sel.step = si - 1; commit(); } }),
    button("↓", () => { if (si < trigger.steps.length - 1) { [trigger.steps[si + 1], trigger.steps[si]] = [trigger.steps[si], trigger.steps[si + 1]]; sel.step = si + 1; commit(); } }),
    button("×", () => { trigger.steps.splice(si, 1); sel.step = -1; commit(); })
  );
  rowEl.addEventListener("click", (e) => {
    e.stopPropagation();
    if (sel.trigger !== ti || sel.step !== si || sel.entry) { sel.trigger = ti; sel.step = si; sel.keyframe = -1; sel.entry = false; renderFlow(); renderFlowBar(); render(); }
  });
  return rowEl;
}

function numInline(value: number, onChange: (v: number) => void, step = 1): HTMLInputElement {
  const i = numberInput(value, onChange, step);
  i.classList.add("num");
  return i;
}

// ---------- toolbar ----------

document.querySelectorAll<HTMLButtonElement>("button.tool").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool as Tool)));
playBtn.addEventListener("click", () => {
  if (!scene.flow.length) return;
  startPreview(sel.trigger >= 0 ? sel.trigger : 0);
});
stopBtn.addEventListener("click", stopPreview);
document.getElementById("btn-fit")!.addEventListener("click", () => { fitView(); render(); });
document.getElementById("btn-text")!.addEventListener("click", () => vscode.postMessage({ type: "openText" }));

// Exposed for dev/scenarios.js (headless checks); harmless inside VS Code.
(window as unknown as { __editor: unknown }).__editor = {
  toScreen: (p: Vec2) => toScreen(p).map((v) => v / devicePixelRatio),
  advancePreview: (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) advancePreview(1 / 60);
    render();
  },
  select: (cutIndex: number, childIndex: number) => { selectCut(cutIndex); sel.child = childIndex; renderPanels(); render(); },
  setTool,
  selectNode,
  flowNodePos: (ti: number, node: number) => flowNodes(ti).find((n) => n.index === node)?.pos,
};

vscode.postMessage({ type: "ready" });
