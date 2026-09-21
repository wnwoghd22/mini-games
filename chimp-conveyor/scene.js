// scene.js — the pixel conveyor scene drawn above the chimp cards.
// Low internal resolution, integer-scaled by CSS with image-rendering: pixelated.
import { drawSprite, spriteSize, PALETTE } from './sprites.js';

const H = 72;               // internal height
const CRATE_W = 20;
const CHIMP_W = 16;
const BELT_Y = 52;          // belt top row
const CHIMP_Y = BELT_Y - 18;
const PARCEL_Y = BELT_Y - 8;

let canvas = null;
let ctx = null;
let W = 0;
let stationX = [];          // x of each chimp station (center)
let inX = 0, outX = 0;      // crate centers
let chimps = [];            // { state, frame }
let parcel = { x: 0, visible: false, from: 0, to: 0, t0: 0, dur: 0, moving: false };
let active = -1;
let progress = { done: 0, total: 0, ok: 0 };
let running = false;
let rafId = 0;
let lastFrame = 0;
let beltOffset = 0;
let skipAnim = false;

export function mount(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    setStations(1);
}

export function setSkipAnim(v) {
    skipAnim = !!v;
}

/** Lay out n stations. Widths follow a fixed pitch so cards below can align by index. */
export function setStations(n) {
    const pitch = 64;
    W = CRATE_W + 16 + n * pitch + 16 + CRATE_W;
    canvas.width = W;
    canvas.height = H;
    canvas.style.aspectRatio = `${W} / ${H}`;
    inX = CRATE_W / 2;
    outX = W - CRATE_W / 2;
    stationX = Array.from({ length: n }, (_, k) => CRATE_W + 16 + pitch * k + pitch / 2);
    chimps = Array.from({ length: n }, () => ({ state: 'idle', frame: 0 }));
    parcel.visible = false;
    active = -1;
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

/** Move the parcel from its current place to station k (or to the out crate when k === n). */
export function parcelTo(k) {
    const from = parcel.visible ? parcel.x : inX;
    const to = k >= stationX.length ? outX : (k < 0 ? inX : stationX[k]);
    parcel.visible = true;
    if (skipAnim || !running) {
        parcel.x = to;
        draw();
        return Promise.resolve();
    }
    // Resolve on a timer, not on the animation frame: rAF pauses in background tabs and the
    // game loop must never stall because the scene is not being painted.
    return new Promise(resolve => {
        parcel.from = from;
        parcel.to = to;
        parcel.t0 = performance.now();
        parcel.dur = Math.max(250, Math.abs(to - from) * 6);
        parcel.resolve = null;
        setTimeout(() => { parcel.x = to; parcel.moving = false; draw(); resolve(); }, parcel.dur);
        parcel.moving = true;
    });
}

export function hideParcel() {
    parcel.visible = false;
    parcel.resolve = null;
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
    parcel.resolve = null;
    progress = { done: 0, total: 0, ok: 0 };
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
    draw();
    rafId = requestAnimationFrame(tick);
}

function draw() {
    if (!ctx) return;
    ctx.fillStyle = PALETTE.k;
    ctx.fillRect(0, 0, W, H);

    // floor line
    ctx.fillStyle = '#14142a';
    ctx.fillRect(0, BELT_Y + 6, W, H - BELT_Y - 6);

    // belt
    const belt = spriteSize('belt_tile');
    for (let x = -8 + (running ? -beltOffset : 0); x < W; x += belt.w) drawSprite(ctx, 'belt_tile', 0, x, BELT_Y);
    const roller = spriteSize('roller');
    for (let x = 4; x < W; x += 24) drawSprite(ctx, 'roller', 0, x, BELT_Y + belt.h);

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
        // stool / desk
        ctx.fillStyle = PALETTE.s;
        ctx.fillRect(x - 10, BELT_Y - 2, 20, 2);
        if (k === active) {
            ctx.fillStyle = PALETTE.y;
            ctx.fillRect(x - 12, CHIMP_Y - 6, 24, 1);
        }
        const name = `chimp_${c.state}`;
        drawSprite(ctx, name, c.frame, x - CHIMP_W / 2, CHIMP_Y);
        if (c.state === 'happy') drawSprite(ctx, 'banana', 0, x + 7, CHIMP_Y - 2);
        if (c.state === 'sad') drawSprite(ctx, 'cross', 0, x + 8, CHIMP_Y - 4);
        if (c.state === 'think') {
            ctx.fillStyle = PALETTE.w;
            const dots = c.frame ? 3 : 2;
            for (let d = 0; d < dots; d++) ctx.fillRect(x + 8 + d * 3, CHIMP_Y - 4, 2, 2);
        }
    });

    // parcel
    if (parcel.visible) {
        const p = spriteSize('parcel');
        drawSprite(ctx, 'parcel', 0, Math.round(parcel.x - p.w / 2), PARCEL_Y);
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
