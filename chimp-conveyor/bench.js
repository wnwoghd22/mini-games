// bench.js — draws a world snapshot (the workpiece) and the per-event micro-clips on the canvas.
// Pure drawing: no timers, no state. scene.js decides where and when; machine.js decides what.
//
// Coordinates: (bx, by) is the top-left of the 20×20 workpiece area sitting on the belt.
// Cells A1–D4: row A–D top→bottom, column 1–4 left→right, 5 px pitch.
import { drawSprite, PALETTE } from './sprites.js';

export const WP = 20;                       // workpiece size (px)
const ROWS = 'ABCD';
const MAT = { wood: ['o', 'O'], glass: ['q', 'Q'], steel: ['S', 's'], rubber: ['p', 'P'] };
const TAG = { red: 'r', blue: 'u', green: 'g', orange: 'y', yellow: 'y', none: 'c' };
const ITEM_COLOR = { OIL: 'r', GLUE: 'w', TAPE: 'y', GLOVES: 'u' };
const BIN_LABEL = { LEFT: 'L', RIGHT: 'R', BOX: 'BOX', REWORK: 'FIX', TRASH: 'BIN' };

export function cellPos(cell, bx, by) {
    const r = ROWS.indexOf(cell[0]);
    const c = +cell[1] - 1;
    return { x: bx + c * 5, y: by + r * 5 };
}

const px = (ctx, color, x, y, w = 1, h = 1) => { ctx.fillStyle = PALETTE[color] ?? color; ctx.fillRect(x, y, w, h); };

/* ---------------- workpiece ---------------- */

/** Draw the world snapshot with its workpiece top-left at (bx, by). `scale` only affects text. */
export function drawWorkpiece(ctx, w, bx, by) {
    if (!w) return;
    switch (w.station) {
        case 'jig': case 'drill': return drawPlank(ctx, w, bx, by);
        case 'press': return drawPress(ctx, w, bx, by);
        case 'stock': return drawCart(ctx, w, bx, by);
        case 'chute': return drawBox(ctx, w, bx, by);
        case 'pack': return drawPack(ctx, w, bx, by);
        case 'shelf': return drawCrateStack(ctx, w, bx, by);
        case 'dock': return drawPallet(ctx, w, bx, by);
        case 'line': return drawAssembly(ctx, w, bx, by);
        default: drawSprite(ctx, 'parcel', 0, bx + 3, by + 12);
    }
}

/* ---------------- the lamp (v7 assembly line) ---------------- */
const BASE_COLOR = { pine: ['o', 'O'], oak: ['O', 'k'], walnut: ['O', 'k'], wood: ['o', 'O'], glass: ['q', 'Q'], steel: ['S', 's'] };
const PAINT_COLOR = { RED: '#e04848', BLUE: '#5bb7ff', BLACK: '#2a2a3a', WHITE: '#ffffff', GREEN: '#41c46b', MUD: '#6b5a3a' };
const BULB_COLOR = { LED: '#ffffff', NEON: '#ff5bd6', EDISON: '#ff8c3a' };

/** Draw the shared assembly state. `big` (the 8× panel) shows what is under the lid. */
export function drawAssembly(ctx, w, bx, by, { big = false } = {}) {
    const [c, C] = BASE_COLOR[w.base] ?? BASE_COLOR.pine;
    if (w.fatal === 'shatter' && w.base === 'glass') { for (let i = 0; i < 8; i++) px(ctx, i % 2 ? c : C, bx + (i * 3) % 20, by + WP - 3 + (i % 3), 2, 1); return; }
    px(ctx, 'k', bx - 1, by - 1, WP + 2, WP + 2);
    px(ctx, c, bx, by, WP, WP);
    for (let r = 0; r < 4; r++) for (let col = 0; col < 4; col++) px(ctx, C, bx + col * 5 + 2, by + r * 5 + 2, 1, 1);
    if (w.fatal === 'jig_crack' || w.fatal === 'housing_crack') for (let i = 0; i < WP; i += 2) px(ctx, 'k', bx + i, by + 6 + ((i >> 1) % 3), 2, 1);
    // cells: holes, dents, washers, screws, nails
    for (const [cell, s] of Object.entries(w.cells ?? {})) {
        const { x, y } = cellPos(cell, bx, by);
        if (s.dent) px(ctx, 'k', x + 2, y + 2, 1, 1);
        if (s.hole) { px(ctx, 'k', x + 1, y + 1, 3, 3); px(ctx, '#333', x + 2, y + 2, 1, 1); }
        if (s.washer) { px(ctx, 'S', x + 1, y + 1, 3, 3); px(ctx, s.washer > 1 ? 'w' : c, x + 2, y + 2, 1, 1); if (s.washer > 1) px(ctx, 'S', x + 1, y, 3, 1); }
        if (s.screw) { px(ctx, 'k', x + 1, y + 2, 3, 1); px(ctx, 'k', x + 2, y + 1, 1, 3); px(ctx, s.screw === 'stripped' ? 'r' : 'S', x + 2, y + 2, 1, 1); if (s.screw === 'stripped') px(ctx, 'k', x + 3, y, 1, 1); }
        if (s.nail === 'standing') { px(ctx, 'k', x + 3, y + 2, 1, 2); px(ctx, 'S', x + 1, y, 2, 2); px(ctx, 'w', x + 1, y, 1, 1); }
        if (s.nail === 'flush') { px(ctx, 'k', x + 1, y + 1, 2, 2); px(ctx, 'S', x + 1, y + 1, 1, 1); }
        if (s.nail === 'bent') { px(ctx, 'k', x + 1, y + 2, 3, 1); px(ctx, 'S', x + 3, y + 1, 1, 2); px(ctx, 'S', x + 1, y + 3, 1, 1); }
    }
    if (w.fatal === 'wire_spark' && w.wire) { const { x, y } = cellPos(w.wire, bx, by); for (let i = 0; i < 5; i++) px(ctx, 'y', x + 2 + (i % 3) * 2 - 2, y - 2 - i * 2, 1, 1); px(ctx, 'y', x + 1, y + 1, 3, 3); }
    // pane (2×2 cells, translucent)
    if (w.pane) {
        const { x, y } = cellPos(w.pane.at, bx, by);
        const dy = w.pane.seated ? 0 : -1;
        ctx.save(); ctx.globalAlpha = 0.8;
        px(ctx, w.glassPainted ? PAINT_COLOR[w.paint] ?? 'q' : 'q', x, y + dy, 10, 10);
        px(ctx, 'Q', x + 1, y + dy + 1, 6, 1); px(ctx, 'Q', x + 1, y + dy + 2, 1, 4);
        ctx.restore();
        if (!w.pane.seated) px(ctx, 'k', x, y + 10, 10, 1);
    }
    // lid: frame with a window; translucent in the big panel so the inside stays visible
    if (w.lid) {
        const col = PAINT_COLOR[w.paint] ?? PALETTE.S;
        const dx = w.lid.wobble ? 1 : 0;
        ctx.save(); if (big) ctx.globalAlpha = 0.6;
        px(ctx, 'k', bx - 1 + dx, by - 1, WP + 2, WP + 2);
        px(ctx, col, bx + dx, by, WP, WP);
        ctx.restore();
        ctx.save();
        if (big) ctx.globalAlpha = 0.0; else ctx.globalAlpha = 1;
        ctx.restore();
        // window
        ctx.clearRect(bx + 3 + dx, by + 3, 14, 14);
        px(ctx, big ? 'rgba(20,20,42,0.35)' : '#14142a', bx + 3 + dx, by + 3, 14, 14);
        if (w.lid.type === 'DOME') { px(ctx, 'w', bx + 6 + dx, by + 4, 8, 1); px(ctx, 'w', bx + 5 + dx, by + 5, 1, 2); }
        if (w.lid.type === 'MESH') for (let i = 0; i < 4; i++) px(ctx, col, bx + 3 + dx, by + 5 + i * 3, 14, 1);
        if (w.lid.layers > 1) px(ctx, 'k', bx + 1 + dx, by + 1, WP - 2, 1);
    }
    // socket + bulb at the hole
    if (w.socket !== 'none' && w.socket !== 'crushed' && w.socketAt) {
        const { x, y } = cellPos(w.socketAt, bx, by);
        const up = w.socket === 'half' ? -2 : 0;
        px(ctx, 'y', x, y + up, 5, 5); px(ctx, 'k', x + 1, y + up + 1, 3, 3);
        if (w.bulb && w.bulb.state !== 'dropped' && w.bulb.state !== 'popped') {
            const tilt = w.bulb.state === 'tilt' ? 1 : 0;
            px(ctx, BULB_COLOR[w.bulb.type] ?? 'w', x + 1 + tilt, y + up - 3, 3, 4);
            px(ctx, 'w', x + 2 + tilt, y + up - 3, 1, 1);
        }
    }
    if (w.socket === 'crushed') { px(ctx, 'y', bx + 7, by + 9, 6, 2); px(ctx, 'k', bx + 8, by + 10, 4, 1); }
    if (w.bulb?.state === 'dropped') { px(ctx, 'w', bx + 2, by + WP + 1, 2, 1); px(ctx, 'w', bx + 6, by + WP + 2, 1, 1); px(ctx, 'w', bx + 9, by + WP + 1, 2, 1); }
    if (w.bulb?.state === 'popped') { drawSprite(ctx, 'cross', 0, bx + 4, by + 2); drawSprite(ctx, 'cross', 0, bx + 11, by + 2); }
    // wrap
    const layers = Math.min(w.pack?.layers ?? 0, 3);
    if (w.fatal === 'bulge') { ctx.save(); ctx.globalAlpha = 0.85; px(ctx, 'Q', bx - 6, by - 8, WP + 12, WP + 12); ctx.restore(); return; }
    for (let i = 0; i < layers; i++) {
        ctx.save(); ctx.globalAlpha = 0.5;
        px(ctx, i % 2 ? 'q' : 'Q', bx - 2 - i, by - 2 - i, WP + 4 + i * 2, 1); px(ctx, i % 2 ? 'q' : 'Q', bx - 2 - i, by + WP + 1 + i, WP + 4 + i * 2, 1);
        px(ctx, i % 2 ? 'q' : 'Q', bx - 2 - i, by - 2 - i, 1, WP + 4 + i * 2); px(ctx, i % 2 ? 'q' : 'Q', bx + WP + 1 + i, by - 2 - i, 1, WP + 4 + i * 2);
        ctx.restore();
    }
    if (w.pack?.sealed && layers) px(ctx, 'y', bx + 9, by - 2 - layers + 1, 2, WP + 2 * layers + 2);
}

function drawPlank(ctx, w, bx, by) {
    const [c, C] = MAT[w.material] ?? MAT.wood;
    if (w.fatal === 'shatter') {
        // shards on the belt
        for (let i = 0; i < 8; i++) px(ctx, i % 2 ? c : C, bx + (i * 3) % 20, by + WP - 3 + (i % 3), 2, 1);
        return;
    }
    px(ctx, 'k', bx - 1, by - 1, WP + 2, WP + 2);
    px(ctx, c, bx, by, WP, WP);
    for (let i = 0; i < 4; i++) px(ctx, C, bx, by + i * 5 + 4, WP, 1);       // grain
    // cell marks
    for (let r = 0; r < 4; r++) for (let col = 0; col < 4; col++) px(ctx, C, bx + col * 5 + 2, by + r * 5 + 2, 1, 1);
    for (const [cell, st] of Object.entries(w.grid ?? {})) {
        const { x, y } = cellPos(cell, bx, by);
        if (st === 'hole' || st === 'nail_in_hole') { px(ctx, 'k', x + 1, y + 1, 3, 3); px(ctx, 's', x + 2, y + 2, 1, 1); }
        if (st === 'nail' || st === 'nail_in_hole') { px(ctx, 'k', x + 1, y + 1, 3, 3); px(ctx, 'S', x + 2, y + 1, 1, 1); px(ctx, 'w', x + 2, y + 2, 1, 1); }
        if (st === 'bent') { px(ctx, 'k', x + 1, y + 2, 3, 2); px(ctx, 'S', x + 3, y + 1, 1, 2); px(ctx, 'S', x + 1, y + 3, 2, 1); }
    }
    if (w.fatal === 'jig_crack') { for (let i = 0; i < WP; i += 2) px(ctx, 'k', bx + i, by + 6 + ((i >> 1) % 3), 2, 1); }
    if (w.fatal === 'table_hole' || w.fatal === 'bit_snap') { px(ctx, 'k', bx + 6, by + WP + 1, 8, 2); }
    if (w.fatal === 'pipe_burst' && w.pipe) {
        const { x, y } = cellPos(w.pipe, bx, by);
        px(ctx, 'k', x + 1, y + 1, 3, 3);
        px(ctx, 'u', x + 2, y - 8, 1, 9); px(ctx, 'u', x + 1, y - 6, 1, 2); px(ctx, 'u', x + 3, y - 5, 1, 2);
        px(ctx, 'w', x + 2, y - 9, 1, 1);
    }
}

function drawPress(ctx, w, bx, by) {
    const [c, C] = MAT[w.material] ?? MAT.steel;
    px(ctx, 'k', bx - 1, by + 5, WP + 2, 16);
    px(ctx, c, bx, by + 6, WP, 14);
    px(ctx, 'k', bx + 6, by + 6, 8, 8);                  // bore
    px(ctx, C, bx + 7, by + 7, 6, 6);
    if (w.fatal === 'shatter') { for (let i = 0; i < 6; i++) px(ctx, C, bx + i * 3 + 1, by + WP - 2 + (i % 2), 2, 1); return; }
    if (w.fatal === 'housing_crack') { for (let i = 0; i < 14; i += 2) px(ctx, 'k', bx + 3 + i, by + 8 + ((i >> 1) % 4), 1, 1); }
    const bearing = (x, y) => { px(ctx, 'k', x, y, 6, 6); px(ctx, 'S', x + 1, y + 1, 4, 4); px(ctx, 'k', x + 2, y + 2, 2, 2); };
    if (w.bearing === 'loose') bearing(bx + 7, by - 2);
    else if (w.bearing === 'half') bearing(bx + 7, by + 3);
    else if (w.bearing === 'seated') bearing(bx + 7, by + 7);
    // gone → nothing on the piece
}

function drawCart(ctx, w, bx, by) {
    // cart body on the belt
    px(ctx, 'k', bx - 1, by + 11, WP + 2, 9);
    px(ctx, 's', bx, by + 12, WP, 7);
    px(ctx, 'S', bx + 1, by + 13, WP - 2, 1);
    const items = Object.entries(w.cart ?? {}).flatMap(([k, n]) => Array.from({ length: n }, () => k));
    if (w.fatal === 'cart_tip') {
        px(ctx, 'k', bx - 3, by + 16, WP + 6, 4);
        items.forEach((k, i) => px(ctx, ITEM_COLOR[k] ?? 'c', bx - 4 + (i * 5) % 28, by + 17 + (i % 2), 3, 2));
        return;
    }
    items.forEach((k, i) => {
        const col = i % 5, row = Math.floor(i / 5);
        px(ctx, 'k', bx + col * 4, by + 8 - row * 4, 4, 4);
        px(ctx, ITEM_COLOR[k] ?? 'c', bx + col * 4 + 1, by + 9 - row * 4, 2, 2);
    });
    if (w.fatal === 'stuck') { px(ctx, 'y', bx + WP + 2, by + 2, 1, 5); px(ctx, 'y', bx + WP + 1, by + 1, 3, 1); px(ctx, 'y', bx + WP + 1, by + 7, 3, 1); }
}

function drawBox(ctx, w, bx, by) {
    if (w.box && w.box !== 'belt') return;                // in a bin (drawn by scene) or dropped
    const tag = TAG[w.tag] ?? 'c';
    px(ctx, 'k', bx + 2, by + 7, 16, 14);
    px(ctx, 'c', bx + 3, by + 8, 14, 12);
    px(ctx, 'C', bx + 3, by + 13, 14, 1);
    px(ctx, tag, bx + 5, by + 10, 4, 3);
}

function drawPack(ctx, w, bx, by) {
    const n = Math.min(w.layers ?? 0, 6);
    const grow = w.fatal === 'bulge' ? 6 : n;             // wrap layers puff the box up
    const x = bx + 3 - grow, y = by + 8 - grow * 2, wd = 14 + grow * 2, ht = 12 + grow * 2;
    px(ctx, 'k', x - 1, y - 1, wd + 2, ht + 2);
    px(ctx, grow ? 'Q' : 'c', x, y, wd, ht);
    for (let i = 0; i < grow; i++) px(ctx, i % 2 ? 'q' : 'w', x + 1 + i, y + 1 + i, wd - 2 - 2 * i, 1);
    if (!grow) px(ctx, 'C', x, y + 5, wd, 1);
    if (w.sealed) px(ctx, 'y', x + Math.floor(wd / 2) - 1, y, 2, ht);
    if (w.outer) px(ctx, 'u', x - 1, y - 1, wd + 2, 1);
}

function drawCrateStack(ctx, w, bx, by) {
    // the incoming crate of items (qty) on the belt; shelves are drawn by the scene
    const placed = (w.LOW ?? 0) + (w.TOP ?? 0) + (w.floor ?? 0);
    const left = Math.max(0, (w.qty ?? 0) - placed);
    if (!left) return;
    px(ctx, 'k', bx + 3, by + 9, 14, 12);
    px(ctx, 'c', bx + 4, by + 10, 12, 10);
    px(ctx, ITEM_COLOR[w.item] ?? 'c', bx + 8, by + 13, 4, 4);
}

function drawPallet(ctx, w, bx, by) {
    if (w.truck) return;                                   // loaded on the truck
    drawSprite(ctx, 'parcel', 0, bx + 3, by + 12);
}

/* ---------------- fixtures (per station, static) ---------------- */

/** Fixtures drawn around a station: bins, shelves, truck. `x` = station centre, belt top `beltY`. */
export function drawFixtures(ctx, w, x, beltY, text, { hideTruck = false, k = -1 } = {}) {
    if (!w) return;
    if (w.station === 'line') { if (k === 11 && !hideTruck) drawTruck(ctx, w, x, beltY, text); return; }
    if (w.station === 'chute') {
        const bins = w.bins ?? ['LEFT', 'RIGHT'];
        bins.forEach((b, i) => {
            const bxx = binX(b, x, i);
            px(ctx, 'k', bxx, beltY - 12, 14, 12);
            px(ctx, b === 'TRASH' ? 'p' : 's', bxx + 1, beltY - 11, 12, 10);
            text(BIN_LABEL[b] ?? b.slice(0, 3), bxx + 2, beltY - 19, PALETTE.S);
            if (w.box === b) { px(ctx, 'c', bxx + 3, beltY - 9, 8, 6); px(ctx, TAG[w.tag] ?? 'c', bxx + 5, beltY - 8, 3, 2); }
        });
        if (w.fatal === 'dropped') { px(ctx, 'c', x + 20, beltY + 7, 6, 2); px(ctx, 'C', x + 28, beltY + 8, 4, 2); }
    }
    if (w.station === 'stock') {
        const sx = x + 36;
        px(ctx, 'k', sx, beltY - 30, 18, 30);
        ['OIL', 'GLUE', 'TAPE', 'GLOVES'].forEach((k, i) => {
            const y = beltY - 28 + i * 7;
            px(ctx, 's', sx + 1, y + 5, 16, 1);
            const n = Math.min(w.shelf?.[k] ?? 0, 4);
            for (let j = 0; j < n; j++) px(ctx, ITEM_COLOR[k], sx + 2 + j * 4, y + 1, 3, 4);
        });
    }
    if (w.station === 'shelf') {
        const sx = x + 36;
        const tilt = w.fatal === 'collapse';
        px(ctx, 'k', sx, beltY - 26, 20, 26);
        px(ctx, 's', sx + 1, beltY - 13 + (tilt ? 3 : 0), 18, 1);      // TOP shelf
        px(ctx, 's', sx + 1, beltY - 2, 18, 1);                       // LOW shelf
        text('TOP', sx + 3, beltY - 25, PALETTE.S);
        const put = (n, y) => { for (let j = 0; j < Math.min(n, 9); j++) px(ctx, ITEM_COLOR[w.item] ?? 'c', sx + 2 + (j % 4) * 4, y - Math.floor(j / 4) * 3, 3, 2); };
        if (!tilt) { put(w.TOP ?? 0, beltY - 16); put(w.LOW ?? 0, beltY - 5); }
        else { for (let j = 0; j < 8; j++) px(ctx, ITEM_COLOR[w.item] ?? 'c', sx - 6 + j * 3, beltY + 6 + (j % 3), 2, 2); }
        if (w.floor) for (let j = 0; j < Math.min(w.floor, 6); j++) px(ctx, ITEM_COLOR[w.item] ?? 'c', x + 14 + j * 3, beltY + 7, 2, 2);
    }
    if (w.station === 'dock' && !hideTruck) drawTruck(ctx, w, x, beltY, text);
}

function drawTruck(ctx, w, x, beltY, text) {
    {
        const tx = x + 30;
        px(ctx, 'k', tx, beltY - 16, 26, 14);
        px(ctx, 'S', tx + 1, beltY - 15, 17, 12);
        px(ctx, 'u', tx + 19, beltY - 12, 6, 6);
        px(ctx, 'k', tx + 4, beltY - 3, 4, 4); px(ctx, 'k', tx + 18, beltY - 3, 4, 4);
        if (w.truck) {
            const code = w.truck.startsWith('LOST') ? '???' : w.truck;
            text(code, tx + 3, beltY - 12, PALETTE.y);
            drawSprite(ctx, 'parcel', 0, tx + 3, beltY - 24);
        }
    }
}

export function binX(dest, x, i) {
    if (dest === 'LEFT' || dest === 'REWORK') return x - 34;
    if (dest === 'TRASH') return x + 54;
    return x + 36;                                        // RIGHT / BOX
}

/* ---------------- clips ---------------- */
// Each clip: { dur, impact, draw(ctx, t, g) } with t ∈ [0,1] and g = { ev, bx, by, x, beltY, text }.
// Clips draw only the moving tool / particles; the workpiece itself is redrawn from `after` at impact.

const hammerArc = (ctx, t, cx, cy) => {
    // handle + head swinging down onto (cx, cy)
    const lift = t < 0.5 ? Math.round(10 * (1 - t * 2)) : Math.round(10 * Math.min(1, (t - 0.5) * 1.5));
    const hx = cx + 3, hy = cy - 4 - lift;
    px(ctx, 'k', hx - 2, hy - 4, 6, 3); px(ctx, 'S', hx - 1, hy - 3, 4, 1);      // head
    px(ctx, 'O', hx, hy - 1, 1, 5);                                               // handle
};
const spark = (ctx, cx, cy, color = 'y') => { px(ctx, color, cx - 2, cy - 2, 1, 1); px(ctx, color, cx + 4, cy - 3, 1, 1); px(ctx, color, cx + 1, cy - 5, 1, 1); px(ctx, color, cx + 4, cy + 1, 1, 1); };
const drillDown = (ctx, t, cx, cy) => {
    const depth = Math.round(Math.min(1, t * 1.6) * 8);
    px(ctx, 'k', cx - 1, cy - 12 + depth, 5, 5); px(ctx, 'S', cx, cy - 11 + depth, 3, 3);  // body
    px(ctx, (Math.floor(t * 20) % 2) ? 'S' : 'k', cx + 1, cy - 7 + depth, 1, 6);          // bit spins
};
const dust = (ctx, t, cx, cy) => { for (let i = 0; i < 4; i++) px(ctx, 'c', cx + i * 2 - 2, cy + 3 - Math.round(t * (2 + i)), 1, 1); };

function cellOf(g) {
    if (g.ev.cell && /^[A-D][1-4]$/.test(g.ev.cell)) return cellPos(g.ev.cell, g.bx, g.by);
    return { x: g.bx + WP + 4, y: g.by + WP - 4 };          // off the plank: whiff into the belt
}

const hammerClip = (dur, impact, fx) => ({
    dur, impact,
    draw(ctx, t, g) {
        const { x, y } = cellOf(g);
        hammerArc(ctx, t, x + 1, y + 1);
        if (t > 0.45 && t < 0.7) fx?.(ctx, t, x + 2, y + 2, g);
    },
});
const drillClip = (dur, impact, fx) => ({
    dur, impact,
    draw(ctx, t, g) {
        const { x, y } = cellOf(g);
        drillDown(ctx, t, x + 1, y + 1);
        if (t > 0.3) dust(ctx, t, x + 2, y + 4);
        if (t > 0.6) fx?.(ctx, t, x + 2, y + 2, g);
    },
});
const shrug = { dur: 450, impact: 200, draw(ctx, t, g) { g.text('?', g.x + 9, g.beltY - 30, PALETTE.y); } };

const dropIn = (dur = 350, impact = 220) => ({
    dur, impact,
    draw(ctx, t, g) {
        const s = Math.min(1, t / 0.6);
        const { x, y } = g.ev.cell && /^[A-D][1-4]$/.test(g.ev.cell) ? cellPos(g.ev.cell, g.bx, g.by) : { x: g.bx + 8, y: g.by + 8 };
        const yy = Math.round(y - 14 * (1 - s) * (1 - s) - 14 * (1 - s));
        px(ctx, 'k', x, yy, 4, 4); px(ctx, 'S', x + 1, yy + 1, 2, 2);
    },
});
/** Line events that reuse another clip's animation. */
export const CLIP_ALIAS = {
    set: 'dropin', set_wrong: 'dropin', drop: 'whiff', washer: 'dropin', washer_wrong: 'dropin', washer_stack: 'dropin',
    screw: 'dropin', screw_wrong: 'dropin', strip: 'bent', no_washer: 'dropin', pane: 'dropin', pane_wrong: 'dropin', glass_unseated: 'dropin',
    lid: 'dropin', lid_wrong: 'dropin', cover_wobble: 'dropin', lid_stack: 'dropin', bulb: 'dropin', bulb_wrong: 'dropin', bulb_tilt: 'dropin',
    bulb_drop: 'shatter', bulb_pop: 'shatter', paint: 'wrap', paint_wrong: 'wrap', paint_mud: 'wrap', glass_painted: 'wrap',
    no_nail: 'whiff', no_force: 'noop', dent: 'miss', skip: 'noop', idle: 'noop', unsealed: 'lost', socket_crush: 'hit_press',
};

export const CLIPS = {
    dropin: dropIn(),
    wire_spark: {
        dur: 800, impact: 250,
        draw(ctx, t, g) {
            const { x, y } = cellOf(g);
            if (t < 0.35) { drillDown(ctx, t * 2.5, x + 1, y + 1); return; }
            for (let i = 0; i < 7; i++) { const s = (t - 0.35) / 0.65; px(ctx, i % 2 ? 'y' : 'w', Math.round(x + 2 + Math.cos(i) * 8 * s), Math.round(y - 2 - Math.abs(Math.sin(i * 1.7)) * 12 * s), 1, 1); }
        },
    },
    hit: hammerClip(320, 160, (ctx, t, cx, cy) => spark(ctx, cx, cy)),
    miss: hammerClip(320, 160, (ctx, t, cx, cy) => spark(ctx, cx, cy, 'r')),
    bent: hammerClip(380, 160, (ctx, t, cx, cy) => spark(ctx, cx, cy, 'S')),
    occupied: hammerClip(300, 160),
    nail_in_hole: hammerClip(320, 160),
    bounce: hammerClip(380, 160, (ctx, t, cx, cy) => px(ctx, 'S', cx, cy - 8 - Math.round((t - 0.45) * 30), 2, 2)),
    whiff: hammerClip(400, 200),
    thumb: hammerClip(500, 200, (ctx, t, cx, cy, g) => { px(ctx, 'r', g.x + 6, g.beltY - 8, 2, 2); spark(ctx, g.x + 6, g.beltY - 8, 'y'); }),
    pipe_burst: {
        dur: 800, impact: 250,
        draw(ctx, t, g) {
            const { x, y } = cellOf(g);
            if (t < 0.35) { g.ev.verb === 'DRILL' ? drillDown(ctx, t * 2.5, x + 1, y + 1) : hammerArc(ctx, t * 1.4, x + 1, y + 1); return; }
            const h = Math.round(Math.min(1, (t - 0.35) * 3) * 14);
            px(ctx, 'u', x + 2, y - h, 1, h); px(ctx, 'u', x + 1, y - h + 3, 1, 2); px(ctx, 'u', x + 3, y - h + 5, 1, 2);
            for (let i = 0; i < 5; i++) px(ctx, 'u', x - 4 + i * 3, y - h - 2 + ((i * 7) % 4), 1, 1);
        },
    },
    shatter: {
        dur: 900, impact: 200,
        draw(ctx, t, g) {
            const { x, y } = cellOf(g);
            if (t < 0.25) { hammerArc(ctx, t * 2, x + 1, y + 1); return; }
            const s = (t - 0.25) / 0.75;
            for (let i = 0; i < 10; i++) {
                const vx = (i % 5 - 2) * 6, vy = -10 - (i % 3) * 4;
                px(ctx, i % 2 ? 'q' : 'Q', Math.round(g.bx + 10 + vx * s), Math.round(g.by + 10 + vy * s + 40 * s * s), 2, 2);
            }
        },
    },
    jig_crack: hammerClip(700, 250, (ctx, t, cx, cy, g) => { for (let i = 0; i < WP; i += 2) px(ctx, 'k', g.bx + i, g.by + 6 + ((i >> 1) % 3), 2, 1); }),
    hole: drillClip(400, 250),
    table_hole: {
        dur: 800, impact: 300,
        draw(ctx, t, g) {
            const { x, y } = cellOf(g);
            drillDown(ctx, Math.min(1, t * 1.2), x + 1, y + 1);
            if (t > 0.35) { const d = Math.round((t - 0.35) * 20); px(ctx, 'k', x + 1, y + 2, 1, Math.min(d, WP)); dust(ctx, t, x + 2, g.by + WP + 3); }
        },
    },
    bit_snap: drillClip(600, 250, (ctx, t, cx, cy) => { spark(ctx, cx, cy, 'y'); px(ctx, 'S', cx + 3 + Math.round((t - 0.6) * 20), cy - 8 - Math.round((t - 0.6) * 10), 1, 3); }),
    // press
    half: pressClip(500, 300, 5), hit_press: pressClip(500, 300, 9),
    popout: { dur: 700, impact: 250, draw(ctx, t, g) { pressHead(ctx, t, g); if (t > 0.4) { const s = (t - 0.4) / 0.6; px(ctx, 'S', Math.round(g.bx + 8 + 20 * s), Math.round(g.by - 2 - 18 * s + 30 * s * s), 4, 4); } } },
    housing_crack: pressClip(700, 300, 9),
    // stock
    take: flyClip(220, 120, g => ({ from: { x: g.x + 40, y: g.beltY - 20 }, to: { x: g.bx + 8, y: g.by + 8 } })),
    overtake: flyClip(220, 120, g => ({ from: { x: g.x + 40, y: g.beltY - 20 }, to: { x: g.bx + 8, y: g.by + 2 } })),
    emptyhand: shrug,
    stuck: { dur: 900, impact: 300, draw(ctx, t, g) { g.text('ZZ', g.x + 40, g.beltY - 40 - Math.round(t * 4), PALETTE.S); } },
    cart_tip: { dur: 800, impact: 300, draw(ctx, t, g) { if (t < 0.4) for (let i = 0; i < 4; i++) px(ctx, 'c', g.bx + i * 4, g.by - 2 - Math.round(t * 10), 3, 2); } },
    // chute
    place: arcClip(350, 300), wrongBin: arcClip(350, 300),
    hold: shrug,
    dropped: { dur: 700, impact: 400, draw(ctx, t, g) { const s = Math.min(1, t / 0.6); px(ctx, 'c', g.bx + 4 + Math.round(16 * s), g.by + 8 + Math.round(20 * s * s), 10, 8); } },
    // pack
    wrap: { dur: 300, impact: 150, draw(ctx, t, g) { px(ctx, 'Q', g.bx - 2 + Math.round(t * 24), g.by + 2, 4, 1); } },
    overwrap: { dur: 300, impact: 150, draw(ctx, t, g) { px(ctx, 'Q', g.bx - 2 + Math.round(t * 24), g.by + 2, 4, 1); } },
    wrap_outside: { dur: 300, impact: 150, draw(ctx, t, g) { px(ctx, 'u', g.bx - 2 + Math.round(t * 24), g.by - 2, 4, 1); } },
    seal: { dur: 300, impact: 200, draw(ctx, t, g) { px(ctx, 'y', g.bx + 9, g.by + 6, 2, Math.round(t * 14)); } },
    bulge: { dur: 800, impact: 300, draw(ctx, t, g) { const r = Math.round(t * 8); px(ctx, 'Q', g.bx + 10 - r, g.by + 10 - r - 4, r * 2, r * 2); } },
    // shelf
    stack: flyClip(300, 200, g => ({ from: { x: g.bx + 8, y: g.by + 10 }, to: { x: g.x + 40, y: g.beltY - (g.ev.shelf === 'TOP' ? 18 : 6) } })),
    overstack: flyClip(300, 200, g => ({ from: { x: g.bx + 8, y: g.by + 10 }, to: { x: g.x + 40, y: g.beltY - (g.ev.shelf === 'TOP' ? 18 : 6) } })),
    floor: flyClip(300, 200, g => ({ from: { x: g.bx + 8, y: g.by + 10 }, to: { x: g.x + 20, y: g.beltY + 6 } })),
    collapse: { dur: 1000, impact: 300, draw(ctx, t, g) { if (t > 0.3) for (let j = 0; j < 8; j++) px(ctx, 'y', g.x + 32 + j * 3, g.beltY - 20 + Math.round(((t - 0.3) / 0.7) * (24 + j * 2)), 2, 2); } },
    // dock
    ship: truckClip(false), wrong_ship: truckClip(false), lost: truckClip(true),
    // generic
    noop: shrug, tired: { dur: 500, impact: 200, draw(ctx, t, g) { g.text('ZZ', g.x + 9, g.beltY - 30, PALETTE.S); } },
};

function pressHead(ctx, t, g) {
    const down = t < 0.6 ? Math.round(t / 0.6 * 6) : Math.round(6 * (1 - (t - 0.6) / 0.4));
    px(ctx, 'k', g.bx + 4, g.by - 10 + down, 12, 4); px(ctx, 'S', g.bx + 5, g.by - 9 + down, 10, 2);
    px(ctx, 'k', g.bx + 9, g.by - 14, 2, 4 + down);
}
function pressClip(dur, impact) { return { dur, impact, draw(ctx, t, g) { pressHead(ctx, t, g); if (t > 0.55 && t < 0.7) spark(ctx, g.bx + 10, g.by + 4, 'S'); } }; }
function flyClip(dur, impact, path) {
    return {
        dur, impact,
        draw(ctx, t, g) {
            const { from, to } = path(g);
            const s = Math.min(1, t / 0.8);
            const x = Math.round(from.x + (to.x - from.x) * s), y = Math.round(from.y + (to.y - from.y) * s - 8 * Math.sin(s * Math.PI));
            px(ctx, 'k', x - 1, y - 1, 4, 4); px(ctx, 'c', x, y, 2, 2);
        },
    };
}
function arcClip(dur, impact) {
    return {
        dur, impact,
        draw(ctx, t, g) {
            const dest = g.ev.dest;
            const tx = binX(dest, g.x) + 4, ty = g.beltY - 10;
            const s = Math.min(1, t / 0.85);
            const x = Math.round(g.bx + 4 + (tx - g.bx - 4) * s), y = Math.round(g.by + 8 + (ty - g.by - 8) * s - 14 * Math.sin(s * Math.PI));
            px(ctx, 'k', x - 1, y - 1, 12, 10); px(ctx, 'c', x, y, 10, 8);
        },
    };
}
function truckClip(lost) {
    return {
        dur: lost ? 1200 : 700, impact: 200,
        draw(ctx, t, g) {
            const tx = g.x + 30;
            const dx = lost ? Math.round(Math.sin(t * Math.PI) * 24) : Math.round(t * 40);
            px(ctx, 'k', tx + dx, g.beltY - 16, 26, 14); px(ctx, 'S', tx + dx + 1, g.beltY - 15, 17, 12); px(ctx, 'u', tx + dx + 19, g.beltY - 12, 6, 6);
            px(ctx, 'k', tx + dx + 4, g.beltY - 3, 4, 4); px(ctx, 'k', tx + dx + 18, g.beltY - 3, 4, 4);
            drawSprite(ctx, 'parcel', 0, tx + dx + 3, g.beltY - 24);
            if (lost && t > 0.5) g.text('?', tx + dx + 8, g.beltY - 32, PALETTE.y);
        },
    };
}

/** Chimp face to show after an event, and how long (ms). */
export function faceFor(type) {
    switch (type) {
        case 'hit': case 'place': case 'take': case 'wrap': case 'seal': case 'stack': case 'ship': return ['happy', 300];
        case 'miss': case 'wrongBin': case 'overtake': case 'overstack': case 'overwrap': case 'wrong_ship': case 'nail_in_hole': case 'whiff': return ['happy', 300];
        case 'bent': case 'bounce': case 'occupied': case 'half': case 'popout': case 'wrap_outside': case 'lost': case 'floor': return ['sad', 350];
        case 'thumb': case 'pipe_burst': case 'shatter': case 'jig_crack': case 'table_hole': case 'bit_snap': case 'housing_crack': case 'cart_tip': case 'dropped': case 'bulge': case 'collapse': case 'wire_spark': case 'bulb_drop': case 'bulb_pop': case 'socket_crush': return ['dead', 700];
        case 'set': case 'washer': case 'skip': case 'screw': case 'pane': case 'lid': case 'bulb': case 'paint': return ['happy', 300];
        case 'set_wrong': case 'washer_wrong': case 'screw_wrong': case 'pane_wrong': case 'lid_wrong': case 'bulb_wrong': case 'paint_wrong': case 'no_washer': case 'dent': case 'no_nail': return ['happy', 300];
        case 'strip': case 'glass_unseated': case 'cover_wobble': case 'lid_stack': case 'bulb_tilt': case 'paint_mud': case 'glass_painted': case 'washer_stack': case 'drop': case 'no_force': case 'unsealed': case 'idle': return ['sad', 400];
        case 'stuck': case 'tired': return ['sad', 700];
        default: return ['think', 300];
    }
}
