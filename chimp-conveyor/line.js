// line.js — the v7 assembly line: one lamp, twelve stations, one shared workpiece.
//
// Every station's chimp reads the SAME ticket and outputs its own action; the machine executes
// station k's output on the shared assembly state. Dependencies between stations are enforced by
// the machine (a hammer needs a standing nail, a lid needs a flat surface, a socket needs a hole…),
// so an early mistake shows up later as a visible cascade.
//
// Pure ESM, no DOM. Reuses the token parser and vocab helpers of machine.js.
import { parse, FATAL_KO as BASE_FATAL_KO, CODES, CELL } from './machine.js';

const RANK = { SOFT: 0, MEDIUM: 1, HARD: 2 };
const NEED = { glass: 'SOFT', pine: 'MEDIUM', oak: 'MEDIUM', walnut: 'MEDIUM', wood: 'MEDIUM', steel: 'HARD' };
const WOOD = new Set(['pine', 'oak', 'walnut', 'wood']);
const FORCE = /^(SOFT|MEDIUM|HARD)$/;
const OFFGRID = /^[A-Z]\d{1,2}$/;
const INT = /^\d{1,2}$/;
const NUM_WORDS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10 };
export const LIDS = ['FLAT', 'DOME', 'MESH'];
export const BULBS = ['LED', 'NEON', 'EDISON'];
export const WASHERS = ['RUBBER', 'STEEL'];
export const COLORS = ['RED', 'BLUE', 'BLACK', 'WHITE', 'GREEN'];
export const CODE_OF = { BUSAN: 'PUS', INCHEON: 'ICN', DAEGU: 'TAE', GWANGJU: 'KWJ', TBD: 'HLD' };
const ALL_CELLS = [];
for (const r of 'ABCD') for (let c = 1; c <= 4; c++) ALL_CELLS.push(r + c);
const clone = w => JSON.parse(JSON.stringify(w));
const cellsOf = args => args.filter(a => CELL.test(a));
const offOf = args => args.filter(a => OFFGRID.test(a) && !CELL.test(a));
const lastForce = args => { let f = null; for (const a of args) if (FORCE.test(a)) f = a; return f; };
const firstInt = args => { for (const a of args) { if (INT.test(a)) return +a; if (NUM_WORDS[a]) return NUM_WORDS[a]; } return null; };

/** 2×2 pane footprint from its top-left cell. */
export function paneCells(at) {
    const r = 'ABCD'.indexOf(at[0]), c = +at[1];
    const out = [];
    for (const dr of [0, 1]) for (const dc of [0, 1]) { const rr = 'ABCD'[r + dr], cc = c + dc; if (rr && cc <= 4) out.push(rr + cc); }
    return out;
}

export function initAssembly(job = {}) {
    const cells = {};
    for (const c of ALL_CELLS) cells[c] = { nail: null, washer: 0, screw: null, hole: false, dent: false };
    return {
        station: 'line', base: job.base ?? 'pine', wire: job.wire ?? null, screwAt: job.screw ?? null,
        cells, pane: null, lid: null, socket: 'none', socketAt: null, bulb: null,
        paint: null, glassPainted: false, pack: { layers: 0, outer: 0, sealed: false }, truck: null,
        floor: [], fatal: null, stage: 0,
    };
}

/** Something sticking up from the base at cell c (blocks panes and lids). */
function protrudes(cell) {
    return cell.nail === 'standing' || cell.nail === 'bent' || (cell.washer > 0 && !cell.screw) || cell.washer >= 2 || cell.screw === 'stripped';
}
function anyProtrusion(w) { return ALL_CELLS.some(c => protrudes(w.cells[c])); }
function holes(w) { return ALL_CELLS.filter(c => w.cells[c].hole); }

/* ---------------- stations ---------------- */
export const LINE = [
    {
        id: 'nailer', label: '못 꽂기', field: 'nail', verbs: ['PUT'], defaultVerb: 'PUT',
        run(w, args, goal, emit) {
            const cells = cellsOf(args), off = offOf(args);
            if (!cells.length && !off.length) return emit('noop', { reason: 'empty' });
            for (const o of off) { w.floor.push('nail'); emit('drop', { cell: o }); }
            for (const c of cells) {
                if (w.cells[c].nail) { emit('occupied', { cell: c }); continue; }
                w.cells[c].nail = 'standing';
                emit(goal?.cells?.[c]?.nail ? 'set' : 'set_wrong', { cell: c });
            }
        },
    },
    {
        id: 'hammer', label: '못 박기', field: 'hit', verbs: ['HAMMER'], defaultVerb: 'HAMMER',
        run(w, args, goal, emit) {
            const force = lastForce(args);
            if (!force) return emit('no_force');
            let cells = cellsOf(args);
            if (!cells.length) cells = ALL_CELLS.filter(c => w.cells[c].nail === 'standing');
            if (!cells.length) return emit('no_nail');
            const need = NEED[w.base] ?? 'MEDIUM';
            for (const c of cells) {
                const cell = w.cells[c];
                if (cell.nail === 'flush' || cell.nail === 'bent') { emit('occupied', { cell: c }); continue; }
                if (cell.nail !== 'standing') { cell.dent = true; emit('dent', { cell: c }); continue; }
                if (RANK[force] < RANK[need]) { cell.nail = 'bent'; emit('bent', { cell: c }); continue; }
                if (RANK[force] > RANK[need]) {
                    if (w.base === 'glass') return emit('shatter', { cell: c, fatal: true });
                    if (WOOD.has(w.base)) return emit('jig_crack', { cell: c, fatal: true });
                }
                cell.nail = 'flush';
                emit('hit', { cell: c });
            }
        },
    },
    {
        id: 'washer', label: '와셔', field: 'washer', verbs: ['PUT'], defaultVerb: 'PUT',
        run(w, args, goal, emit) {
            let cells = cellsOf(args);
            const type = args.find(a => WASHERS.includes(a));
            if (!cells.length && (type || args.includes('YES')) && w.screwAt) cells = [w.screwAt];
            if (!cells.length) return emit('skip');
            for (const c of cells) {
                w.cells[c].washer++;
                if (type) w.cells[c].washerType = type;
                if (w.cells[c].washer >= 2) emit('washer_stack', { cell: c });
                else emit(goal?.cells?.[c]?.washer ? 'washer' : 'washer_wrong', { cell: c });
            }
        },
    },
    {
        id: 'screw', label: '나사', field: 'screw', verbs: ['SCREW', 'PUT'], defaultVerb: 'SCREW',
        run(w, args, goal, emit) {
            const cells = cellsOf(args);
            if (!cells.length) return emit('noop', { reason: 'empty' });
            for (const c of cells) {
                const cell = w.cells[c];
                if (cell.screw) { emit('occupied', { cell: c }); continue; }
                if (cell.nail) { cell.screw = 'stripped'; emit('strip', { cell: c }); continue; }
                cell.screw = 'flush';
                if (goal?.cells?.[c]?.screw) emit(cell.washer ? 'screw' : (goal.cells[c].washer ? 'no_washer' : 'screw'), { cell: c });
                else emit('screw_wrong', { cell: c });
            }
        },
    },
    {
        id: 'pane', label: '유리판', field: 'pane', verbs: ['PUT'], defaultVerb: 'PUT',
        run(w, args, goal, emit) {
            const cells = cellsOf(args);
            if (!cells.length) return emit('noop', { reason: 'empty' });
            const at = cells.at(-1);
            if (at[0] === 'D' || at[1] === '4') return emit('shatter', { cell: at, fatal: true, reason: 'slide' });
            const foot = paneCells(at);
            const blocker = foot.find(c => protrudes(w.cells[c]));
            w.pane = { at, seated: !blocker };
            emit(blocker ? 'glass_unseated' : (goal?.pane?.at === at ? 'pane' : 'pane_wrong'), { cell: at, blocker });
        },
    },
    {
        id: 'drill', label: '전선 구멍', field: 'hole', verbs: ['DRILL'], defaultVerb: 'DRILL',
        run(w, args, goal, emit) {
            const cells = cellsOf(args), off = offOf(args);
            if (!cells.length && !off.length) return emit('thumb');
            if (off.length) return emit('table_hole', { cell: off[0], fatal: true });
            for (const c of cells) {
                const cell = w.cells[c];
                if (w.pane && paneCells(w.pane.at).includes(c)) return emit('shatter', { cell: c, fatal: true });
                if (cell.nail || cell.screw || cell.washer) return emit('bit_snap', { cell: c, fatal: true });
                if (w.wire === c) return emit('wire_spark', { cell: c, fatal: true });
                if (cell.hole) return emit('table_hole', { cell: c, fatal: true });
                cell.hole = true;
                emit(goal?.cells?.[c]?.hole ? 'hit' : 'miss', { cell: c, verb: 'DRILL' });
            }
        },
    },
    {
        id: 'lid', label: '덮개', field: 'lid', verbs: ['PUT'], defaultVerb: 'PUT',
        run(w, args, goal, emit) {
            const types = args.filter(a => LIDS.includes(a));
            if (!types.length) return emit('noop', { reason: 'empty' });
            if (w.pane && !w.pane.seated) return emit('shatter', { fatal: true, reason: 'lid' });
            const wobble = anyProtrusion(w) || types.length > 1;
            w.lid = { type: types[0], wobble, layers: types.length };
            if (types.length > 1) return emit('lid_stack');
            emit(wobble ? 'cover_wobble' : (goal?.lid?.type === types[0] ? 'lid' : 'lid_wrong'), { type: types[0] });
        },
    },
    {
        id: 'socket', label: '소켓 압입', field: 'hit', verbs: ['PRESS'], defaultVerb: 'PRESS',
        run(w, args, goal, emit) {
            const force = lastForce(args);
            if (!force) return emit('thumb');
            const hs = holes(w);
            if (!hs.length) { w.socket = 'crushed'; return emit('socket_crush'); }
            if (w.socket === 'crushed') return emit('noop', { reason: 'gone' });
            const need = NEED[w.base] ?? 'MEDIUM';
            if (RANK[force] > RANK[need]) {
                if (w.base === 'glass') return emit('shatter', { fatal: true });
                if (WOOD.has(w.base)) return emit('housing_crack', { fatal: true });
            }
            w.socketAt = hs[0];
            if (w.socket === 'seated') return emit('occupied');
            if (RANK[force] < RANK[need]) {
                if (w.socket === 'half') { w.socket = 'seated'; return emit('hit'); }
                w.socket = 'half';
                return emit('half');
            }
            w.socket = 'seated';
            emit('hit');
        },
    },
    {
        id: 'bulb', label: '전구', field: 'bulb', verbs: ['PUT'], defaultVerb: 'PUT',
        run(w, args, goal, emit) {
            const types = args.filter(a => BULBS.includes(a));
            if (!types.length) return emit('noop', { reason: 'empty' });
            if (types.length > 1) { w.bulb = { type: null, state: 'popped' }; return emit('bulb_pop'); }
            const t = types[0];
            if (w.socket === 'seated') { w.bulb = { type: t, state: 'in' }; return emit(goal?.bulb?.type === t ? 'bulb' : 'bulb_wrong', { type: t }); }
            if (w.socket === 'half') { w.bulb = { type: t, state: 'tilt' }; return emit('bulb_tilt', { type: t }); }
            w.bulb = { type: t, state: 'dropped' };
            emit('bulb_drop', { type: t });
        },
    },
    {
        id: 'paint', label: '도색', field: 'color', verbs: ['PAINT', 'PUT'], defaultVerb: 'PAINT',
        run(w, args, goal, emit) {
            const cs = args.filter(a => COLORS.includes(a));
            if (!cs.length) return emit('noop', { reason: 'empty' });
            if (cs.length > 1) { w.paint = 'MUD'; return emit('paint_mud'); }
            if (!w.lid) { w.glassPainted = true; w.paint = cs[0]; return emit('glass_painted', { color: cs[0] }); }
            w.paint = cs[0];
            emit(goal?.paint === cs[0] ? 'paint' : 'paint_wrong', { color: cs[0] });
        },
    },
    {
        id: 'pack', label: '포장', field: 'wrap', verbs: ['WRAP', 'PUT', 'SEAL'], defaultVerb: 'WRAP',
        run(w, args, goal, emit) {
            const n = args.includes('HEAVY') ? 3 : args.includes('LIGHT') ? 1 : (firstInt(args) ?? 1);
            if (w.pack.sealed) { w.pack.outer += n; return emit('wrap_outside', { n }); }
            w.pack.layers += n;
            if (w.pack.layers > 6) return emit('bulge', { fatal: true });
            w.pack.sealed = true;
            emit(w.pack.layers === (goal?.pack?.layers ?? 0) ? 'wrap' : 'overwrap', { n });
        },
    },
    {
        id: 'dock', label: '출하', field: 'dest', verbs: ['SHIP'], defaultVerb: 'SHIP', loose: true,
        run(w, args, goal, emit) {
            if (w.truck) return emit('noop', { reason: 'gone' });
            if (!w.pack.sealed) return emit('unsealed');
            const code = args.map(a => CODES.includes(a) ? a : CODE_OF[a]).find(Boolean);
            if (code) { w.truck = code; return emit(goal?.truck === code ? 'ship' : 'wrong_ship', { code }); }
            const guess = args.find(a => /^[A-Z]{3,}$/.test(a) && !STOP_WORDS.has(a));
            if (!guess) return emit('thumb');
            w.truck = `LOST:${guess}`;
            emit('lost', { code: guess });
        },
    },
];

const STOP_WORDS = new Set(['THE', 'AND', 'FOR', 'TO', 'IT', 'ALL', 'OUT', 'NOW', 'NOT', 'ONLY', 'THEN', 'WITH', 'INTO', 'ON', 'IN', 'AT', 'OF', 'BY', 'VALUE', 'OUTPUT', 'NOTHING', 'ELSE']);
export const LINE_FATAL_KO = { ...BASE_FATAL_KO, wire_spark: '전선 합선', jig_crack: '받침판 쪼개짐', housing_crack: '받침판 균열' };
export const LINE_BIG = new Set(['shatter', 'jig_crack', 'housing_crack', 'bit_snap', 'table_hole', 'wire_spark', 'bulge']);
const OK_EVENTS = new Set(['set', 'hit', 'washer', 'skip', 'screw', 'pane', 'lid', 'bulb', 'paint', 'wrap', 'ship']);

/** Parse station k's output into the argument list the station acts on. */
export function parseFor(k, text) {
    const st = LINE[k];
    return parse(text, st.verbs, st.defaultVerb, { loose: !!st.loose });
}

/** Execute station k's output on the shared world (mutated). Returns { events, tokens, args }. */
export function runStation(world, k, text, goal = null) {
    const st = LINE[k];
    const parsed = parseFor(k, text);
    const events = [];
    const args = parsed.sentences.flatMap(s => s.args);
    const emit = (type, extra = {}) => {
        const ev = { type, k, ok: OK_EVENTS.has(type), big: LINE_BIG.has(type), ...extra };
        if (extra.fatal) world.fatal = type;
        ev.after = clone(world);
        events.push(ev);
        return ev;
    };
    if (world.fatal) { emit('idle'); return { events, tokens: parsed.tokens, args }; }
    if (!parsed.sentences.length) emit(st.id === 'washer' ? 'skip' : st.id === 'hammer' ? 'no_force' : 'noop', { reason: 'empty' });
    else st.run(world, args, goal, emit);
    world.stage = Math.max(world.stage, k + 1);
    return { events, tokens: parsed.tokens, args };
}

/** Run stations 0..n-1 with the given outputs on a fresh world. */
export function runLine(job, outputs, n, goal = null) {
    const world = initAssembly(job);
    const runs = [];
    for (let k = 0; k < n; k++) runs.push(runStation(world, k, outputs[k] ?? '', goal));
    return { world, runs };
}

export function goalOf(job, targets, n) {
    return runLine(job, targets, n).world;
}

/** The normalised action of station k's output: the argument tokens the station listens to. */
function actionKey(k, text) {
    const st = LINE[k];
    const args = parseFor(k, text).sentences.flatMap(s => s.args);
    const keep = a => CELL.test(a) || FORCE.test(a) || LIDS.includes(a) || BULBS.includes(a) || COLORS.includes(a) || CODES.includes(a) || INT.test(a) || !!NUM_WORDS[a] || ['HEAVY', 'LIGHT'].includes(a);
    let list = args.filter(keep);
    if (st.id === 'pane' && list.length) list = [list.at(-1)];
    if (st.id === 'hammer' || st.id === 'socket') list = [lastForce(args) ?? '-'];
    if (st.id === 'washer' && !list.length) list = ['none'];
    return [...new Set(list)].sort().join(' ');
}

const CIRCLE = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];

/**
 * Score a ticket: outputs[k] for k < n vs targets. cosmeticPaint: paint colour is only shown, not judged.
 * Returns { correct, fatal, facts:[{k, ok, cosmetic, t, cascade}], actionOk[], summary, detail, world, goal }.
 */
export function scoreLine(job, targets, outputs, n, { cosmeticPaint = false } = {}) {
    const goal = goalOf(job, targets, n);
    const { world: a } = runLine(job, outputs, n, goal);
    const actionOk = Array.from({ length: n }, (_, k) => actionKey(k, outputs[k] ?? '') === actionKey(k, targets[k] ?? ''));
    const facts = [];
    const firstBad = () => { const i = facts.findIndex(f => !f.ok && !f.cosmetic); return i < 0 ? null : facts[i].k; };
    const F = (k, ok, t, cosmetic = false) => {
        const f = { k, ok, cosmetic, t: `${CIRCLE[k]} ${t}` };
        if (!ok && actionOk[k]) { const b = firstBad(); if (b !== null && b < k) f.cascade = b; }
        facts.push(f);
    };
    const gc = goal.cells, ac = a.cells;
    for (let k = 0; k < n; k++) {
        const st = LINE[k];
        switch (st.id) {
            case 'nailer': {
                for (const c of ALL_CELLS) if (gc[c].nail) F(k, !!ac[c].nail, `못 ${c}${ac[c].nail ? '' : ' 없음'}`);
                for (const c of ALL_CELLS) if (ac[c].nail && !gc[c].nail) F(k, false, `여분 못 ${c}`);
                break;
            }
            case 'hammer': {
                for (const c of ALL_CELLS) if (gc[c].nail) F(k, ac[c].nail === 'flush', ac[c].nail === 'flush' ? `${c} 박힘` : ac[c].nail === 'bent' ? `${c} 못 휨` : ac[c].nail === 'standing' ? `${c} 못 서 있음` : `${c} 박을 못 없음`);
                const dents = ALL_CELLS.filter(c => ac[c].dent);
                if (dents.length) F(k, false, `찍힘 ${dents.join(' ')}`, true);
                break;
            }
            case 'washer': {
                // An extra washer under a screw is harmless hardware-wise: cosmetic. Elsewhere it protrudes: structural.
                const want = ALL_CELLS.filter(c => gc[c].washer);
                const extra = ALL_CELLS.filter(c => ac[c].washer && !gc[c].washer);
                if (!want.length && !extra.length) F(k, true, '와셔 없음');
                for (const c of want) F(k, ac[c].washer === 1, `와셔 ${c}${ac[c].washer === 1 ? '' : ac[c].washer > 1 ? ' 이단' : ' 없음'}`);
                for (const c of extra) F(k, false, `여분 와셔 ${c}${gc[c].screw ? ' (나사 밑, 무해)' : ''}`, !!gc[c].screw && ac[c].washer === 1);
                break;
            }
            case 'screw': {
                for (const c of ALL_CELLS) if (gc[c].screw) F(k, ac[c].screw === 'flush' && !!ac[c].washer === !!gc[c].washer, `나사 ${c}${ac[c].screw === 'flush' ? (!!ac[c].washer === !!gc[c].washer ? '' : (ac[c].washer ? ' 와셔 남음' : ' 와셔 없이')) : ac[c].screw === 'stripped' ? ' 헛돎' : ' 없음'}`);
                for (const c of ALL_CELLS) if (ac[c].screw && !gc[c].screw) F(k, false, `여분 나사 ${c}${ac[c].screw === 'stripped' ? ' (못 위에서 헛돎)' : ''}`);
                break;
            }
            case 'pane': F(k, !!a.pane && a.pane.at === goal.pane?.at && a.pane.seated, a.pane ? `유리 ${a.pane.at}${a.pane.seated ? '' : ' 들뜸'}${a.pane.at !== goal.pane?.at ? ' (자리 다름)' : ''}` : '유리 없음'); break;
            case 'drill': {
                for (const c of ALL_CELLS) if (gc[c].hole) F(k, ac[c].hole, `구멍 ${c}${ac[c].hole ? '' : ' 없음'}`);
                for (const c of ALL_CELLS) if (ac[c].hole && !gc[c].hole) F(k, false, `여분 구멍 ${c}`);
                break;
            }
            case 'lid': F(k, !!a.lid && a.lid.type === goal.lid?.type && !a.lid.wobble && a.lid.layers === 1, a.lid ? `덮개 ${a.lid.type}${a.lid.layers > 1 ? ' 두 겹' : ''}${a.lid.wobble ? ' 들썩' : ''}${a.lid.type !== goal.lid?.type ? ' (종류 다름)' : ''}` : '덮개 없음'); break;
            case 'socket': F(k, a.socket === 'seated' && a.socketAt === goal.socketAt, a.socket === 'seated' ? `소켓 ${a.socketAt}${a.socketAt !== goal.socketAt ? ' (엉뚱한 구멍)' : ''}` : a.socket === 'half' ? '소켓 반쯤' : a.socket === 'crushed' ? '소켓 찌그러짐' : '소켓 없음'); break;
            case 'bulb': F(k, !!a.bulb && a.bulb.state === 'in' && a.bulb.type === goal.bulb?.type, a.bulb ? (a.bulb.state === 'popped' ? '전구 둘 다 깨짐' : `전구 ${a.bulb.type}${a.bulb.state === 'tilt' ? ' 기울어짐' : a.bulb.state === 'dropped' ? ' 추락' : ''}${a.bulb.type !== goal.bulb?.type ? ' (종류 다름)' : ''}`) : '전구 없음'); break;
            case 'paint': F(k, a.paint === goal.paint && !a.glassPainted, a.paint ? (a.paint === 'MUD' ? '도색 흙탕물' : `도색 ${a.paint}${a.glassPainted ? ' (유리에)' : ''}${a.paint !== goal.paint ? ' (색 다름)' : ''}`) : '도색 없음', cosmeticPaint); break;
            case 'pack': F(k, a.pack.layers === goal.pack.layers && a.pack.sealed && !a.pack.outer, `뽁뽁이 ${a.pack.layers}겹${a.pack.outer ? ` +겉 ${a.pack.outer}` : ''}${a.pack.sealed ? '' : ' 미봉'}`); break;
            case 'dock': F(k, a.truck === goal.truck, a.truck ? (a.truck.startsWith('LOST') ? `행방불명(${a.truck.slice(5)})` : `${a.truck}행`) : (a.pack.sealed ? '출하 안 됨' : '미봉 상태로 출하 시도')); break;
        }
    }
    const fatal = a.fatal;
    if (fatal) facts.unshift({ k: -1, ok: false, cosmetic: false, t: `${LINE_FATAL_KO[fatal] ?? fatal}★` });
    const structural = facts.filter(f => !f.cosmetic);
    const correct = !fatal && structural.every(f => f.ok);
    const bad = structural.filter(f => !f.ok);
    const summary = correct ? `${n}공정 ✓` : (fatal ? LINE_FATAL_KO[fatal] ?? fatal : bad[0].t.replace(/^.\s/, '')) + (bad.length > 1 ? ` 외 ${bad.length - 1}` : '');
    const detail = facts.map(f => `${f.ok ? '✓' : f.cosmetic ? '△' : '✗'} ${f.t}${f.cascade !== undefined ? ` ↳${f.cascade + 1}번 여파` : ''}`).join('\n');
    const score = structural.length ? structural.filter(f => f.ok).length / structural.length : 1;
    return { correct, fatal, facts, actionOk, summary, detail, world: a, goal, score: correct ? 1 : fatal ? 0 : score };
}

export function eventLabel(ev) {
    const c = ev.cell ? `${ev.cell} ` : '';
    const L = {
        set: `${c}못 세움`, set_wrong: `${c}못 세움 (자리 다름)`, drop: `${c}판 밖, 못 떨어짐`, occupied: `${c}이미 있음`,
        no_force: '힘 단어 없음, 망치 안 내려옴', no_nail: '칠 못 없음, 허공', dent: `${c}빈 칸 찍음`, bent: `${c}못 휨`, hit: `${c}${ev.verb === 'DRILL' ? '구멍' : '명중'}`, miss: `${c}빗나감`,
        skip: '와셔 없이 통과', washer: `${c}와셔`, washer_wrong: `${c}와셔 (자리 다름)`, washer_stack: `${c}와셔 이단`,
        screw: `${c}나사`, screw_wrong: `${c}나사 (자리 다름)`, strip: `${c}못 위에서 헛돎`, no_washer: `${c}와셔 없이 조임`,
        pane: `${c}유리 안착`, pane_wrong: `${c}유리 (자리 다름)`, glass_unseated: `${c}유리 들뜸 (${ev.blocker ?? ''} 밑)`,
        lid: `덮개 ${ev.type}`, lid_wrong: `덮개 ${ev.type} (종류 다름)`, cover_wobble: `덮개 ${ev.type} 들썩`, lid_stack: '덮개 두 겹',
        half: '소켓 반쯤', socket_crush: '구멍 없어 소켓 찌그러짐',
        bulb: `전구 ${ev.type}`, bulb_wrong: `전구 ${ev.type} (종류 다름)`, bulb_tilt: `전구 ${ev.type} 기울어짐`, bulb_drop: `전구 ${ev.type} 추락`, bulb_pop: '전구 둘 다 깨짐',
        paint: `도색 ${ev.color}`, paint_wrong: `도색 ${ev.color} (색 다름)`, paint_mud: '색 둘 → 흙탕물', glass_painted: `유리에 ${ev.color} 칠함`,
        wrap: `${ev.n}겹`, overwrap: `${ev.n}겹 (과다)`, wrap_outside: `봉한 뒤 ${ev.n}겹`, ship: `${ev.code}행`, wrong_ship: `${ev.code}행 (오배송)`, lost: `${ev.code}? 행방불명`, unsealed: '미봉 상태, 트럭에서 굴러떨어짐',
        thumb: '엄지 찧음', noop: ev.reason === 'empty' ? '멍' : '이미 끝난 일', idle: '앞 사고로 손 놓음', tired: '지침',
    };
    return L[ev.type] ?? (LINE_FATAL_KO[ev.type] ? `${c}${LINE_FATAL_KO[ev.type]}★` : ev.type);
}
