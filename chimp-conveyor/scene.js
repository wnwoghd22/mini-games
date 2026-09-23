// scene.js — the pixel conveyor scene drawn directly above the cards, inside the same
// horizontally scrolling container, so stations line up with their cards.
// Layout comes from the DOM (card centers in CSS px); the canvas renders at 1/SCALE resolution
// and is stretched back with image-rendering: pixelated.
import { drawSprite, spriteSize, PALETTE } from './sprites.js';
import { drawWorkpiece, drawFixtures, drawAssembly, CLIPS, CLIP_ALIAS, faceFor, WP } from './bench.js';

export const SCALE = 4;
const H = 72;               // internal height (everything scales with SCALE)
const BELT_Y_CONST = 52;    // belt top row
export const CHIMP_HEAD_CSS = () => (BELT_Y_CONST - 18) * SCALE;   // CSS px from canvas top to the chimp's head
const CRATE_W = 20;
const CHIMP_W = 16;
const BELT_Y = BELT_Y_CONST;
const CHIMP_Y = BELT_Y - 18;
const PARCEL_Y = BELT_Y - 8;

let canvas = null;
let ctx = null;
let W = 160;
let stationX = [];          // internal x of each chimp station (center)
let inX = 10, outX = 150;   // crate centers
let chimps = [];            // { state, frame, written }
let parcel = { x: 0, visible: false, from: 0, to: 0, t0: 0, dur: 0, moving: false, dropY: 0, dropT0: 0, dropDur: 0 };
let active = -1;
let progress = { done: 0, total: 0, ok: 0 };
let running = false;
let rafId = 0;
let lastFrame = 0;
let beltOffset = 0;
let skipAnim = false;
const BENCH_DX = 22;        // workpiece centre offset from the chimp (right side)
let workMode = null;        // station name when the parcel is a workpiece
let workers = new Set();    // station indices that act on the workpiece
let work = null;            // current world snapshot (drawn as the parcel)
let clip = null;            // { ev, k, t0, dur } while an event micro-clip plays
let verdict = null;         // { ok, snap, t0 } while the 2x verdict shows
let seenBig = new Set();
let faceTimers = new Map();

export function mount(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    layout({ cssWidth: 320, stations: [160], inX: 40, outX: 280 });
}

export function setSkipAnim(v) {
    skipAnim = !!v;
}

/**
 * Position everything from CSS-pixel measurements of the card row.
 * stations: center x of each chimp card; inX/outX: centers of the sample and inspection cards.
 */
export function layout({ cssWidth, stations, inX: inCss, outX: outCss }) {
    const n = stations.length;
    W = Math.max(64, Math.round(cssWidth / SCALE));
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${W * SCALE}px`;
    canvas.style.height = `${H * SCALE}px`;
    stationX = stations.map(x => Math.round(x / SCALE));
    inX = Math.round(inCss / SCALE);
    outX = Math.round(outCss / SCALE);
    if (chimps.length !== n) {
        const prev = chimps;
        chimps = Array.from({ length: n }, (_, k) => prev[k] ?? { state: 'idle', frame: 0, written: false });
    }
    ctx.imageSmoothingEnabled = false;
    draw();
}

export function stationCount() {
    return stationX.length;
}

export function setActive(k) {
    active = k;
    draw();
}

/** state: idle | think | write | happy | sad | dead */
export function chimpState(k, state) {
    if (chimps[k]) { chimps[k].state = state; chimps[k].frame = 0; }
    draw();
}

export function allChimps(state) {
    for (const c of chimps) { c.state = state; c.frame = 0; }
    draw();
}

/** Whether chimp k has an instruction sheet written (drives the paper icon). */
export function setInstruction(k, written) {
    if (chimps[k]) chimps[k].written = !!written;
    draw();
}

/** Move the parcel to station k (k === n → out crate, k < 0 → in crate). Resolves on a timer. */
export function parcelTo(k) {
    const from = parcel.visible ? parcel.x : inX;
    const to = k >= stationX.length ? outX : (k < 0 ? inX : stationX[k] + (workMode && workers.has(k) ? BENCH_DX : 0));
    parcel.visible = true;
    if (skipAnim || !running) {
        parcel.x = to;
        draw();
        return Promise.resolve();
    }
    return new Promise(resolve => {
        parcel.from = from;
        parcel.to = to;
        parcel.t0 = performance.now();
        parcel.dur = Math.max(250, Math.min(900, Math.abs(to - from) * 5));
        parcel.moving = true;
        setTimeout(() => { parcel.x = to; parcel.moving = false; draw(); resolve(); }, parcel.dur);
    });
}

/** Drop a fresh parcel from above the in-crate onto the belt (the item leaving the queue). */
export function spawnParcel() {
    parcel.visible = true;
    parcel.moving = false;
    if (skipAnim || !running) {
        parcel.x = inX;
        parcel.dropY = 0;
        draw();
        return Promise.resolve();
    }
    return new Promise(resolve => {
        parcel.x = inX;
        parcel.dropY = -(PARCEL_Y + 12);
        parcel.dropT0 = performance.now();
        parcel.dropDur = 350;
        setTimeout(() => { parcel.dropY = 0; draw(); resolve(); }, parcel.dropDur + 120);
    });
}

export function hideParcel() {
    parcel.visible = false;
    parcel.moving = false;
    draw();
}

export function itemProgress(done, total, ok) {
    progress = { done, total, ok };
    draw();
}

export function reset() {
    for (const c of chimps) { c.state = 'idle'; c.frame = 0; }
    active = -1;
    parcel.visible = false;
    parcel.moving = false;
    progress = { done: 0, total: 0, ok: 0 };
    work = null;
    clip = null;
    verdict = null;
    seenBig = new Set();
    draw();
}

/* ---------- workpiece / action levels ---------- */

/** station = machine station name (or null for plain parcels); workerIdx = stations that act. */
export function setWorkMode(station, workerIdx = []) {
    workMode = station;
    workers = new Set(workerIdx);
    draw();
}

export function setWorkpiece(snapshot) {
    work = snapshot;
    draw();
}

/** Show a face for a while, then back to idle. */
export function react(k, face, ms) {
    if (!chimps[k]) return;
    clearTimeout(faceTimers.get(k));
    chimps[k].state = face;
    chimps[k].frame = 0;
    draw();
    if (ms) faceTimers.set(k, setTimeout(() => { if (chimps[k]?.state === face) { chimps[k].state = 'idle'; draw(); } }, ms));
}

const timer = (ms, signal) => new Promise(resolve => {
    if (signal?.aborted) return resolve();
    const id = setTimeout(done, ms);
    function done() { clearTimeout(id); signal?.removeEventListener('abort', done); resolve(); }
    signal?.addEventListener('abort', done, { once: true });
});

function fastPath() {
    return skipAnim || !running || (typeof document !== 'undefined' && document.hidden);
}

/**
 * Play machine events at station k, one after another (timer based). Each event carries `after`,
 * the world snapshot to show from its impact frame on. onEvent(ev, i) fires when a clip starts.
 */
export async function playEvents(k, events, { tempo = 1, signal, onEvent, onBig } = {}) {
    if (!events.length) return;
    if (fastPath()) {
        work = events.at(-1).after ?? work;
        const [face] = faceFor(events.at(-1).type);
        react(k, face, 0);
        draw();
        return;
    }
    for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        if (signal?.aborted) break;
        const c = clipFor(ev);
        const firstBig = ev.big && !seenBig.has(ev.type);
        const s = firstBig ? 1 : tempo;
        clip = { ev, k, t0: performance.now(), dur: c.dur * s };
        onEvent?.(ev, i);
        chimps[k].state = 'write';
        await timer(c.impact * s, signal);
        work = ev.after ?? work;
        const [face, ms] = faceFor(ev.type);
        react(k, face, ms * s + (c.dur - c.impact) * s);
        if (ev.big) {
            seenBig.add(ev.type);
            onBig?.(ev, firstBig);
            for (let j = 0; j < chimps.length; j++) if (j !== k) react(j, 'sad', 400);
            shake();
        }
        await timer((c.dur - c.impact) * s + 80, signal);
    }
    clip = null;
    draw();
}

function clipFor(ev) {
    if (work?.station === 'press' && (ev.type === 'hit' || ev.type === 'occupied')) return CLIPS.hit_press;
    if (work?.station === 'line') {
        if (ev.k === 7 && (ev.type === 'hit' || ev.type === 'half' || ev.type === 'occupied')) return CLIPS.hit_press;
        if (ev.type === 'hit' && ev.verb === 'DRILL') return CLIPS.hole;
        const alias = CLIP_ALIAS[ev.type];
        if (alias) return CLIPS[alias] ?? CLIPS.noop;
    }
    return CLIPS[ev.type] ?? CLIPS.noop;
}

function shake() {
    const host = canvas?.parentElement;
    if (!host) return;
    host.classList.remove('shake');
    void host.offsetWidth;
    host.classList.add('shake');
    setTimeout(() => host.classList.remove('shake'), 260);
}

/** Draw a world snapshot into any 2D context (used by the big workpiece panel). */
export function drawWorkpieceAt(ctx2, snapshot, x, y) {
    if (snapshot?.station === 'line') drawAssembly(ctx2, snapshot, x, y, { big: true });
    else drawWorkpiece(ctx2, snapshot, x, y);
}

/** Lift the finished workpiece above the out crate at 2x with a stamp, then drop it in. */
export async function showVerdict(ok, snapshot) {
    if (fastPath()) return;
    verdict = { ok, snap: snapshot, t0: performance.now() };
    draw();
    await timer(650);
    verdict = null;
    draw();
}

export function start() {
    if (running) return;
    running = true;
    lastFrame = performance.now();
    rafId = requestAnimationFrame(tick);
}

export function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    parcel.moving = false;
    draw();
}

function tick(now) {
    if (!running) return;
    const dt = now - lastFrame;
    if (dt >= 120) {
        lastFrame = now;
        beltOffset = (beltOffset + 2) % 8;
        for (const c of chimps) c.frame = (c.frame + 1) % 2;
    }
    if (parcel.moving) {
        const t = Math.min(1, (now - parcel.t0) / parcel.dur);
        parcel.x = parcel.from + (parcel.to - parcel.from) * t;
    }
    if (parcel.dropY !== 0) {
        const t = Math.min(1, (now - parcel.dropT0) / parcel.dropDur);
        const fall = -(PARCEL_Y + 12) * (1 - t * t);           // ease-in fall
        const bounce = t >= 1 ? -Math.round(2 * Math.sin(Math.min(1, (now - parcel.dropT0 - parcel.dropDur) / 120) * Math.PI)) : 0;
        parcel.dropY = Math.round(fall) + bounce;
        if (parcel.dropY === 0 && t >= 1) parcel.dropY = 0;
    }
    draw();
    rafId = requestAnimationFrame(tick);
}

function draw() {
    if (!ctx) return;
    ctx.fillStyle = PALETTE.k;
    ctx.fillRect(0, 0, W, H);

    // floor
    ctx.fillStyle = '#14142a';
    ctx.fillRect(0, BELT_Y + 6, W, H - BELT_Y - 6);

    // belt from in crate to out crate
    const belt = spriteSize('belt_tile');
    const beltStart = Math.min(inX, outX) - CRATE_W / 2;
    const beltEnd = Math.max(inX, outX) + CRATE_W / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(beltStart, BELT_Y, beltEnd - beltStart, belt.h + 6);
    ctx.clip();
    for (let x = beltStart - 8 + (running ? -beltOffset : 0); x < beltEnd; x += belt.w) drawSprite(ctx, 'belt_tile', 0, x, BELT_Y);
    for (let x = beltStart + 4; x < beltEnd; x += 24) drawSprite(ctx, 'roller', 0, x, BELT_Y + belt.h);
    ctx.restore();

    // crates
    drawSprite(ctx, 'crate_in', 0, inX - CRATE_W / 2, BELT_Y - 10);
    drawSprite(ctx, 'crate_out', 0, outX - CRATE_W / 2, BELT_Y - 10);
    if (progress.total) {
        drawText(`${progress.done}/${progress.total}`, inX - CRATE_W / 2 + 1, BELT_Y - 20, PALETTE.w);
        drawText(`${progress.ok}`, outX - CRATE_W / 2 + 1, BELT_Y - 20, PALETTE.y);
        drawSprite(ctx, 'check', 0, outX - CRATE_W / 2 + 12, BELT_Y - 20);
    }

    // stations
    stationX.forEach((x, k) => {
        const c = chimps[k];
        // connector down to the card below
        ctx.fillStyle = k === active ? PALETTE.y : PALETTE.s;
        for (let y = BELT_Y + 8; y < H; y += 4) ctx.fillRect(x - 1, y, 2, 2);
        // desk
        ctx.fillStyle = PALETTE.s;
        ctx.fillRect(x - 10, BELT_Y - 2, 20, 2);
        if (k === active) {
            ctx.fillStyle = PALETTE.y;
            ctx.fillRect(x - 12, CHIMP_Y - 6, 24, 1);
        }
        if (workMode && workers.has(k)) drawFixtures(ctx, work, x, BELT_Y, drawText, { k, hideTruck: !!clip && ['ship', 'wrong_ship', 'lost', 'unsealed'].includes(clip.ev.type) });
    });

    // workpiece (action levels) or plain parcel; drawn before the chimps so it passes behind them
    if (parcel.visible) {
        if (workMode && work) {
            drawWorkpiece(ctx, work, Math.round(parcel.x - WP / 2), BELT_Y - WP + (parcel.dropY || 0));
        } else {
            const p = spriteSize('parcel');
            drawSprite(ctx, 'parcel', 0, Math.round(parcel.x - p.w / 2), PARCEL_Y + (parcel.dropY || 0));
        }
    }

    stationX.forEach((x, k) => {
        const c = chimps[k];
        drawSprite(ctx, `chimp_${c.state}`, c.frame, x - CHIMP_W / 2, CHIMP_Y);
        // instruction sheet on the desk (left side; the bench is on the right)
        drawSprite(ctx, c.written ? 'paper_written' : 'paper_blank', 0, x - 19, BELT_Y - 12);
        if (c.state === 'happy') drawSprite(ctx, 'banana', 0, x - 16, CHIMP_Y - 2);
        if (c.state === 'sad') drawSprite(ctx, 'cross', 0, x - 14, CHIMP_Y - 4);
    });

    // event micro-clip on top
    if (clip) {
        const t = Math.min(1, (performance.now() - clip.t0) / clip.dur);
        const c = clipFor(clip.ev);
        const bx = Math.round(parcel.x - WP / 2), by = BELT_Y - WP;
        c.draw(ctx, t, { ev: clip.ev, bx, by, x: stationX[clip.k], beltY: BELT_Y, text: drawText });
    }

    // verdict: the workpiece at 2x above the out crate with a stamp
    if (verdict) {
        const t = Math.min(1, (performance.now() - verdict.t0) / 650);
        const vx = outX - WP, vy = Math.max(0, BELT_Y - 10 - WP * 2 - 4 + Math.round(t > 0.8 ? (t - 0.8) * 5 * 30 : 0));
        ctx.save();
        ctx.translate(vx, vy);
        ctx.scale(2, 2);
        drawWorkpiece(ctx, verdict.snap, 0, 0);
        ctx.restore();
        if (t > 0.3) {
            const size = t < 0.4 ? 13 : 11;
            ctx.fillStyle = verdict.ok ? PALETTE.g : PALETTE.r;
            ctx.fillRect(vx + WP - size / 2, vy + WP - size / 2, size, 2);
            ctx.fillRect(vx + WP - size / 2, vy + WP + size / 2 - 2, size, 2);
            ctx.fillRect(vx + WP - size / 2, vy + WP - size / 2, 2, size);
            ctx.fillRect(vx + WP + size / 2 - 2, vy + WP - size / 2, 2, size);
            drawSprite(ctx, verdict.ok ? 'check' : 'cross', 0, vx + WP - 3, vy + WP - 2);
        }
    }
}

// Tiny 3×5 digit font for counters (0-9 and '/').
const DIGITS = {
    '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
    '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'],
    '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
    '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '001', '001', '001'],
    '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
    '/': ['001', '001', '010', '100', '100'],
    '?': ['111', '001', '011', '000', '010'],
    A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'],
    D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
    G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'], I: ['111', '010', '010', '010', '111'],
    J: ['011', '001', '001', '101', '010'], K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
    M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'], O: ['010', '101', '101', '101', '010'],
    P: ['110', '101', '110', '100', '100'], Q: ['010', '101', '101', '011', '001'], R: ['110', '101', '110', '101', '101'],
    S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'], U: ['101', '101', '101', '101', '111'],
    V: ['101', '101', '101', '101', '010'], W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
    Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
};
function drawText(text, x, y, color) {
    ctx.fillStyle = color;
    let cx = x;
    for (const ch of text) {
        const g = DIGITS[ch];
        if (g) {
            for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '1') ctx.fillRect(cx + i, y + j, 1, 1);
        }
        cx += 4;
    }
}
