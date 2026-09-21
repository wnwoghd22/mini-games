// scene.js — the pixel conveyor scene drawn directly above the cards, inside the same
// horizontally scrolling container, so stations line up with their cards.
// Layout comes from the DOM (card centers in CSS px); the canvas renders at 1/SCALE resolution
// and is stretched back with image-rendering: pixelated.
import { drawSprite, spriteSize, PALETTE } from './sprites.js';

export const SCALE = 3;
export const CHIMP_HEAD_CSS = () => (52 - 18) * SCALE;   // CSS px from canvas top to the chimp's head
const H = 72;               // internal height
const CRATE_W = 20;
const CHIMP_W = 16;
const BELT_Y = 52;          // belt top row
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
    const to = k >= stationX.length ? outX : (k < 0 ? inX : stationX[k]);
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
        drawSprite(ctx, `chimp_${c.state}`, c.frame, x - CHIMP_W / 2, CHIMP_Y);
        // instruction sheet on the desk
        drawSprite(ctx, c.written ? 'paper_written' : 'paper_blank', 0, x + 10, BELT_Y - 12);
        if (c.state === 'happy') drawSprite(ctx, 'banana', 0, x + 7, CHIMP_Y - 2);
        if (c.state === 'sad') drawSprite(ctx, 'cross', 0, x + 8, CHIMP_Y - 4);
    });

    // parcel
    if (parcel.visible) {
        const p = spriteSize('parcel');
        drawSprite(ctx, 'parcel', 0, Math.round(parcel.x - p.w / 2), PARCEL_Y + (parcel.dropY || 0));
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
