// machine.js — the action language and the tiny factory "machine" that executes it.
//
// The machine does not read English. It uppercases the chimp's output, splits it into tokens,
// and only recognises VERB tokens and a closed vocabulary of arguments (cells A1–D4, forces,
// small integers, item / destination / shelf / airport-code words). A verb opens a sentence;
// every following token belongs to that sentence until the next verb. There is no NOT button:
// "I will NOT HAMMER C1" hammers C1. Everything before the first verb is chatter.
//
// Scoring never asks a model: the reference program (item.target) is run on the same initial
// world and the FINAL STATES are compared (so order does not matter). Fatal accidents stop the
// program and always fail the item. Partial scores are only shown in tooltips.
//
// Pure ESM, no DOM: runs in the browser and in node (tests, offline probe scoring).

export const VERBS = ['HAMMER', 'DRILL', 'PRESS', 'TAKE', 'PUT', 'WRAP', 'SEAL', 'STACK', 'SHIP'];
const VERB_RE = {
    HAMMER: /^HAMMER(S|ED|ING)?$/, DRILL: /^DRILL(S|ED|ING)?$/, PRESS: /^PRESS(ES|ED|ING)?$/,
    TAKE: /^(TAKE|TAKES|TAKING|TOOK|TAKEN)$/, PUT: /^PUT(S|TING)?$/, WRAP: /^WRAP(S|PED|PING)?$/,
    SEAL: /^SEAL(S|ED|ING)?$/, STACK: /^STACK(S|ED|ING)?$/, SHIP: /^SHIP(S|PED|PING)?$/,
};
export const CELL = /^[A-D][1-4]$/;
const OFFGRID = /^[A-Z]\d{1,2}$/;
const FORCE = /^(SOFT|MEDIUM|HARD)$/;
const INT = /^\d{1,2}$/;
const NUM_WORDS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10, ELEVEN: 11, TWELVE: 12, DOZEN: 12 };
const ITEMS = { OIL: 'OIL', OILS: 'OIL', TAPE: 'TAPE', TAPES: 'TAPE', GLUE: 'GLUE', GLUES: 'GLUE', GLOVES: 'GLOVES', GLOVE: 'GLOVES' };
const DESTS = ['LEFT', 'RIGHT', 'BOX', 'REWORK', 'TRASH'];
const SHELVES = ['LOW', 'TOP'];
export const CODES = ['PUS', 'ICN', 'TAE', 'KWJ', 'HLD'];
const STOPWORDS = new Set(['THE', 'AND', 'FOR', 'TO', 'IT', 'ALL', 'OUT', 'NOW', 'NOT', 'ONLY', 'THEN', 'WITH', 'INTO', 'ON', 'IN', 'AT', 'OF', 'BY']);
const RANK = { SOFT: 0, MEDIUM: 1, HARD: 2 };
const NEED = { glass: 'SOFT', wood: 'MEDIUM', steel: 'HARD', rubber: 'HARD' };
const HEAVY = new Set(['OIL', 'GLUE']);
export const MAX_SENTENCES = 8;

const clone = w => JSON.parse(JSON.stringify(w));
const verbOf = tok => VERBS.find(v => VERB_RE[v].test(tok)) ?? null;
const firstInt = args => { for (const a of args) { if (INT.test(a)) return +a; if (NUM_WORDS[a]) return NUM_WORDS[a]; } return null; };
const lastForce = args => { let f = null; for (const a of args) if (FORCE.test(a)) f = a; return f; };

/**
 * Tokenise; allowed verbs open sentences, everything else is an argument of the current sentence.
 * With `defaultVerb`, arguments that appear before any verb belong to an implicit sentence of
 * that verb (the chimp is standing at that tool). Non-allowed verbs are plain junk tokens.
 * Returns { sentences, tokens } — tokens carry a role for bubble colouring.
 */
export function parse(text, allowed = VERBS, defaultVerb = null, { loose = false } = {}) {
    const raw = String(text ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const toks = raw ? raw.split(' ') : [];
    const sentences = [];
    const tokens = [];
    let cur = null;
    if (defaultVerb) { cur = { verb: defaultVerb, args: [], implicit: true, idx: 0 }; sentences.push(cur); }
    for (const t of toks) {
        const v = verbOf(t);
        if (v && allowed.includes(v)) {
            cur = { verb: v, args: [], idx: sentences.length };
            sentences.push(cur);
            tokens.push({ t, role: 'verb', s: cur.idx });
        } else if (cur) {
            cur.args.push(t);
            tokens.push({ t, role: isArg(t) ? 'arg' : 'junk', s: cur.idx });
        } else {
            tokens.push({ t, role: 'junk', s: -1 });
        }
    }
    // An implicit sentence without a single recognisable argument is just chatter.
    if (sentences[0]?.implicit && !sentences[0].args.some(t => isArg(t) || (loose && /^[A-Z]{3,}$/.test(t) && !STOPWORDS.has(t)))) {
        sentences.shift();
        sentences.forEach((s, i) => { s.idx = i; });
        for (const tk of tokens) tk.s = tk.s < 0 ? -1 : tk.s - 1;
    }
    return { sentences, tokens };
}

const LINE_WORDS = new Set(['FLAT', 'DOME', 'MESH', 'LED', 'HALOGEN', 'EDISON', 'RED', 'BLUE', 'BLACK', 'WHITE', 'GREEN', 'HEAVY', 'LIGHT', 'YES', 'RUBBER', 'SKIP', 'NEON']);
function isArg(t) {
    return CELL.test(t) || OFFGRID.test(t) || FORCE.test(t) || INT.test(t) || !!NUM_WORDS[t] || !!ITEMS[t]
        || DESTS.includes(t) || SHELVES.includes(t) || CODES.includes(t) || LINE_WORDS.has(t);
}

/* ---------------- stations ---------------- */

const STATIONS = {
    jig: {
        verbs: ['HAMMER', 'DRILL'],
        init: o => ({ station: 'jig', material: o.material ?? 'wood', pipe: o.pipe ?? null, grid: {}, fatal: null }),
        handlers: {
            HAMMER(w, args, goal, emit) {
                const cells = args.filter(a => CELL.test(a));
                const off = args.filter(a => OFFGRID.test(a) && !CELL.test(a));
                const force = lastForce(args) ?? 'MEDIUM';
                if (!cells.length && !off.length) return emit('thumb');
                for (const o of off) emit('whiff', { cell: o });
                for (const c of cells) {
                    if (w.pipe === c) return emit('pipe_burst', { cell: c, fatal: true });
                    const cur = w.grid[c];
                    if (cur === 'nail' || cur === 'bent' || cur === 'nail_in_hole') { emit('occupied', { cell: c }); continue; }
                    if (cur === 'hole') { w.grid[c] = 'nail_in_hole'; emit('nail_in_hole', { cell: c }); continue; }
                    const need = NEED[w.material] ?? 'MEDIUM';
                    if (RANK[force] < RANK[need]) {
                        if (w.material === 'rubber') emit('bounce', { cell: c });
                        else { w.grid[c] = 'bent'; emit('bent', { cell: c }); }
                        continue;
                    }
                    if (RANK[force] > RANK[need]) {
                        if (w.material === 'glass') return emit('shatter', { cell: c, fatal: true });
                        if (w.material === 'wood') return emit('jig_crack', { cell: c, fatal: true });
                    }
                    w.grid[c] = 'nail';
                    emit(goal?.grid?.[c] === 'nail' ? 'hit' : 'miss', { cell: c });
                }
            },
            DRILL(w, args, goal, emit) {
                const cells = args.filter(a => CELL.test(a));
                const off = args.filter(a => OFFGRID.test(a) && !CELL.test(a));
                const force = lastForce(args) ?? 'MEDIUM';
                if (!cells.length && !off.length) return emit('thumb');
                if (off.length) return emit('table_hole', { cell: off[0], fatal: true });
                for (const c of cells) {
                    if (w.pipe === c) return emit('pipe_burst', { cell: c, fatal: true });
                    if (w.material === 'glass' && force === 'HARD') return emit('shatter', { cell: c, fatal: true });
                    const cur = w.grid[c];
                    if (cur === 'nail' || cur === 'bent' || cur === 'nail_in_hole') return emit('bit_snap', { cell: c, fatal: true });
                    if (cur === 'hole') return emit('table_hole', { cell: c, fatal: true });
                    w.grid[c] = 'hole';
                    emit(goal?.grid?.[c] === 'hole' ? 'hit' : 'miss', { cell: c });
                }
            },
        },
        equal: (a, b) => sameMap(a.grid, b.grid),
        partial(a, g) {
            const A = new Set(Object.entries(a.grid).map(e => e.join(':')));
            const G = new Set(Object.entries(g.grid).map(e => e.join(':')));
            const inter = [...A].filter(x => G.has(x)).length;
            const uni = new Set([...A, ...G]).size;
            return uni ? inter / uni : 1;
        },
        summary(a, g) {
            const facts = [];
            for (const [c, s] of Object.entries(g.grid).sort()) {
                const got = a.grid[c];
                if (got === s) facts.push({ ok: true, t: `${c} ${s === 'nail' ? '못' : '구멍'}` });
                else if (!got) facts.push({ ok: false, t: `${c} 빠짐` });
                else facts.push({ ok: false, t: `${c} ${STATE_KO[got] ?? got}` });
            }
            for (const [c, s] of Object.entries(a.grid).sort()) if (!g.grid[c]) facts.push({ ok: false, t: `${c} 여분 ${STATE_KO[s] ?? s}` });
            const need = Object.keys(g.grid).length;
            const okc = facts.filter(f => f.ok).length;
            const extra = facts.length - Object.keys(g.grid).length;
            return { head: (need ? `못 ${okc}/${need}` : '작업 없음') + (extra > 0 ? ` · 여분 ${extra}` : ''), facts };
        },
    },

    press: {
        verbs: ['PRESS'],
        init: o => ({ station: 'press', material: o.material ?? 'steel', bearing: 'loose', fatal: null }),
        handlers: {
            PRESS(w, args, goal, emit) {
                const force = lastForce(args);
                if (!force) return emit('thumb');
                const need = NEED[w.material] ?? 'HARD';
                if (w.bearing === 'gone') return emit('noop', { reason: 'gone' });
                if (RANK[force] > RANK[need]) {
                    if (w.material === 'glass') return emit('shatter', { fatal: true });
                    if (w.material === 'wood') return emit('housing_crack', { fatal: true });
                }
                if (w.bearing === 'seated') return emit('occupied');
                if (RANK[force] < RANK[need]) {
                    if (w.material === 'rubber') { w.bearing = 'gone'; return emit('popout'); }
                    if (w.bearing === 'half') { w.bearing = 'seated'; return emit('hit'); }
                    w.bearing = 'half';
                    return emit('half');
                }
                w.bearing = 'seated';
                emit('hit');
            },
        },
        equal: (a, b) => a.bearing === b.bearing,
        partial: (a, g) => (a.bearing === g.bearing ? 1 : a.bearing === 'half' ? 0.5 : 0),
        summary: a => ({ head: `베어링 ${BEARING_KO[a.bearing]}`, facts: [{ ok: a.bearing === 'seated', t: `베어링 ${BEARING_KO[a.bearing]}` }] }),
    },

    stock: {
        verbs: ['TAKE'],
        init: o => ({ station: 'stock', shelf: { OIL: 9, GLUE: 9, TAPE: 6, GLOVES: 9, ...(o.shelf ?? {}) }, cart: { ...(o.cart ?? {}) }, fatal: null }),
        handlers: {
            TAKE(w, args, goal, emit) {
                // "1 OIL 6 TAPE" → two picks; a number binds to the next item word.
                const picks = [];
                let n = null;
                for (const a of args) {
                    if (INT.test(a)) n = +a;
                    else if (NUM_WORDS[a]) n = NUM_WORDS[a];
                    else if (ITEMS[a]) { picks.push({ item: ITEMS[a], n: n ?? 1 }); n = null; }
                }
                if (!picks.length) return emit('emptyhand');
                for (const { item, n: want } of picks) {
                    if (want === 0) { emit('noop', { reason: 'zero', item }); continue; }
                    const have = w.shelf[item] ?? 0;
                    if (have <= 0) return emit('stuck', { item, fatal: true });
                    const take = Math.min(want, have);
                    w.shelf[item] = have - take;
                    w.cart[item] = (w.cart[item] ?? 0) + take;
                    const total = Object.values(w.cart).reduce((a, b) => a + b, 0);
                    emit(w.cart[item] > (goal?.cart?.[item] ?? 0) ? 'overtake' : 'take', { item, n: take });
                    if (total > 8) return emit('cart_tip', { fatal: true });
                }
            },
        },
        equal: (a, b) => sameMap(a.cart, b.cart),
        partial(a, g) {
            const keys = new Set([...Object.keys(a.cart), ...Object.keys(g.cart)]);
            if (!keys.size) return 1;
            let ok = 0;
            for (const k of keys) if ((a.cart[k] ?? 0) === (g.cart[k] ?? 0)) ok++;
            return ok / keys.size;
        },
        summary(a, g) {
            const keys = [...new Set([...Object.keys(g.cart), ...Object.keys(a.cart)])].sort();
            const facts = keys.map(k => ({ ok: (a.cart[k] ?? 0) === (g.cart[k] ?? 0), t: `${ITEM_KO[k] ?? k} ${a.cart[k] ?? 0}/${g.cart[k] ?? 0}` }));
            return { head: facts.map(f => f.t).join(' · ') || '빈 카트', facts };
        },
    },

    chute: {
        verbs: ['PUT'],
        init: o => ({ station: 'chute', tag: o.tag ?? null, bins: o.bins ?? ['LEFT', 'RIGHT'], box: 'belt', moves: 0, fatal: null }),
        handlers: {
            PUT(w, args, goal, emit) {
                const dest = args.find(a => DESTS.includes(a));
                if (!dest) return emit('hold');
                if (w.box === 'gone') return emit('noop', { reason: 'gone' });
                w.moves++;
                if (w.moves >= 3) { w.box = 'gone'; return emit('dropped', { fatal: true }); }
                w.box = dest;
                emit(goal?.box === dest ? 'place' : 'wrongBin', { dest });
            },
        },
        equal: (a, b) => a.box === b.box,
        partial: (a, g) => (a.box === g.box ? 1 : 0),
        summary: (a, g) => ({ head: a.box === g.box ? `${DEST_KO[a.box]}` : `${DEST_KO[a.box] ?? '벨트'} (${DEST_KO[g.box]}이어야)`, facts: [{ ok: a.box === g.box, t: `상자 → ${DEST_KO[a.box] ?? '벨트 위'}` }] }),
    },

    pack: {
        verbs: ['WRAP', 'PUT', 'SEAL'],
        // WRAP/PUT HEAVY = 3 layers, WRAP/PUT LIGHT = 1 layer, or a number of layers. Wrapping seals the box.
        // (PUT is accepted because the model maps tables to "PUT X" far more reliably than to "WRAP X".)
        init: () => ({ station: 'pack', layers: 0, outer: 0, sealed: false, fatal: null }),
        handlers: {
            WRAP(w, args, goal, emit) {
                const n = args.includes('HEAVY') ? 3 : args.includes('LIGHT') ? 1 : (firstInt(args) ?? 1);
                if (w.sealed) { w.outer += n; return emit('wrap_outside', { n }); }
                w.layers += n;
                if (w.layers > 6) return emit('bulge', { fatal: true });
                w.sealed = true;
                emit(w.layers === (goal?.layers ?? 0) ? 'wrap' : 'overwrap', { n });
            },
            PUT(w, args, goal, emit) { STATIONS.pack.handlers.WRAP(w, args, goal, emit); },
            SEAL(w, args, goal, emit) {
                if (w.sealed) return emit('occupied');
                w.sealed = true;
                emit('seal');
            },
        },
        equal: (a, b) => a.layers === b.layers && a.outer === b.outer,
        partial: (a, g) => (a.layers === g.layers && a.outer === g.outer ? 1 : a.layers === g.layers ? 0.5 : 0),
        summary(a, g) {
            const facts = [{ ok: a.layers === g.layers, t: `뽁뽁이 ${a.layers}겹/${g.layers}겹` }];
            if (a.outer) facts.push({ ok: false, t: `봉한 위에 ${a.outer}겹 더` });
            return { head: `${a.layers}겹` + (a.outer ? ` +겉 ${a.outer}` : ''), facts };
        },
    },

    shelf: {
        verbs: ['STACK'],
        init: o => ({ station: 'shelf', item: o.item ?? 'TAPE', qty: o.qty ?? 1, LOW: 0, TOP: 0, floor: 0, fatal: null }),
        handlers: {
            STACK(w, args, goal, emit) {
                const s = args.find(a => SHELVES.includes(a));
                const n = w.qty;
                if (!s) { w.floor += n; return emit('floor', { n }); }
                if (s === 'TOP' && HEAVY.has(w.item)) return emit('collapse', { fatal: true, n });
                w[s] += n;
                if (w[s] > 9) return emit('collapse', { fatal: true, n });
                emit(goal && goal[s] >= w[s] ? 'stack' : 'overstack', { shelf: s, n });
            },
        },
        equal: (a, b) => a.LOW === b.LOW && a.TOP === b.TOP && a.floor === b.floor,
        partial: (a, g) => ((a.LOW === g.LOW) + (a.TOP === g.TOP) + (a.floor === g.floor)) / 3,
        summary(a, g) {
            const facts = [];
            for (const s of ['LOW', 'TOP']) if (a[s] || g[s]) facts.push({ ok: a[s] === g[s], t: `${SHELF_KO[s]} ${a[s]}/${g[s]}` });
            if (a.floor) facts.push({ ok: false, t: `바닥에 ${a.floor}개` });
            return { head: facts.map(f => f.t).join(' · ') || '선반 비어 있음', facts };
        },
    },

    dock: {
        verbs: ['SHIP'],
        loose: true,                                   // a bare word is a destination attempt (→ lost truck)
        init: () => ({ station: 'dock', truck: null, fatal: null }),
        handlers: {
            SHIP(w, args, goal, emit) {
                if (w.truck) return emit('noop', { reason: 'gone' });
                const code = args.find(a => CODES.includes(a));
                if (code) { w.truck = code; return emit(goal?.truck === code ? 'ship' : 'wrong_ship', { code }); }
                const guess = args.find(a => /^[A-Z]{3,}$/.test(a) && !STOPWORDS.has(a));
                if (!guess) return emit('thumb');
                w.truck = `LOST:${guess}`;
                emit('lost', { code: guess });
            },
        },
        equal: (a, b) => a.truck === b.truck,
        partial: (a, g) => (a.truck === g.truck ? 1 : 0),
        summary: (a, g) => ({
            head: a.truck ? (a.truck.startsWith('LOST') ? `행방불명(${a.truck.slice(5)})` : `${a.truck}행`) : '출하 안 됨',
            facts: [{ ok: a.truck === g.truck, t: `트럭 → ${a.truck ?? '출발 안 함'} (기대 ${g.truck})` }],
        }),
    },
};

STATIONS.drill = { ...STATIONS.jig, verbs: ['DRILL', 'HAMMER'], init: o => ({ ...STATIONS.jig.init(o), station: 'drill' }) };

const STATE_KO = { nail: '못', bent: '휜 못', hole: '구멍', nail_in_hole: '구멍에 못' };
const BEARING_KO = { loose: '헐거움', half: '반쯤 걸림', seated: '안착', gone: '튕겨 나감' };
const ITEM_KO = { OIL: '오일', TAPE: '테이프', GLUE: '본드', GLOVES: '장갑' };
const DEST_KO = { LEFT: '왼쪽 통', RIGHT: '오른쪽 통', BOX: '출하 상자', REWORK: '재작업', TRASH: '폐기', belt: '벨트 위', gone: '떨어뜨림' };
const SHELF_KO = { LOW: '아래 칸', TOP: '윗 칸' };
export const FATAL_KO = {
    pipe_burst: '배관 파열', shatter: '유리 박살', jig_crack: '지그 파손', bit_snap: '드릴 날 파손', table_hole: '테이블 관통',
    housing_crack: '하우징 균열', stuck: '재고 없음 무한 대기', cart_tip: '카트 전도', dropped: '상자 추락', bulge: '뽁뽁이 풍선', collapse: '선반 붕괴',
};
export const BIG = new Set(['pipe_burst', 'shatter', 'jig_crack', 'bit_snap', 'table_hole', 'housing_crack', 'cart_tip', 'dropped', 'bulge', 'collapse', 'stuck']);
export const OK_EVENTS = new Set(['hit', 'take', 'place', 'wrap', 'seal', 'stack', 'ship']);

function sameMap(a, b) {
    const ka = Object.keys(a).filter(k => a[k]), kb = Object.keys(b).filter(k => b[k]);
    return ka.length === kb.length && ka.every(k => a[k] === b[k]);
}

export function stationOf(name) {
    const s = STATIONS[name];
    if (!s) throw new Error(`unknown station ${name}`);
    return s;
}

export function initWorld(station, override = {}) {
    return stationOf(station).init(override ?? {});
}

/**
 * Execute a program (text or parse() result) on `world` (mutated). `goal` only labels events
 * (hit/miss). Returns { world, events, sentences, tokens }.
 */
export function run(world, program, goal = null) {
    const st = stationOf(world.station);
    const parsed = typeof program === 'string' ? parse(program, st.verbs, st.verbs[0], { loose: !!st.loose }) : program;
    const events = [];
    let stopped = false;
    const emit = (idx) => (type, extra = {}) => {
        const ev = { type, idx, ok: OK_EVENTS.has(type), big: BIG.has(type), ...extra };
        if (extra.fatal) { world.fatal = type; stopped = true; }
        ev.after = clone(world);
        events.push(ev);
        return ev;
    };
    if (!parsed.sentences.length) emit(-1)('noop', { reason: 'empty' });
    for (const s of parsed.sentences.slice(0, MAX_SENTENCES)) {
        if (stopped) break;
        st.handlers[s.verb](world, s.args, goal, emit(s.idx));
    }
    if (parsed.sentences.length > MAX_SENTENCES && !stopped) emit(MAX_SENTENCES)('tired');
    return { world, events, sentences: parsed.sentences, tokens: parsed.tokens };
}

/** Run the reference program on a fresh world → goal world. */
export function goalOf(station, override, target) {
    return run(initWorld(station, override), target).world;
}

/**
 * Score one chimp output. item = { target, world? }, puzzle = { station }.
 * Returns { score, correct, summary, detail, facts, events, world, goal, fatal }.
 */
export function score(output, item, puzzle) {
    const station = puzzle.station;
    const st = stationOf(station);
    const goal = goalOf(station, item.world, item.target);
    const r = run(initWorld(station, item.world), output ?? '', goal);
    const w = r.world;
    const fatal = w.fatal;
    const correct = !fatal && st.equal(w, goal);
    const partial = fatal ? 0 : st.partial(w, goal);
    const sum = st.summary(w, goal);
    const facts = fatal ? [{ ok: false, t: `${FATAL_KO[fatal]}★` }, ...sum.facts] : sum.facts;
    const summary = fatal ? `${FATAL_KO[fatal]} · ${sum.head}` : sum.head;
    const detail = facts.map(f => `${f.ok ? '✓' : '✗'} ${f.t}`).join('\n');
    return { score: correct ? 1 : partial, correct, summary, detail, facts, events: r.events, world: w, goal, fatal };
}

/** Human-readable label for an event (transcript / bubble marks). */
export function eventLabel(ev) {
    const c = ev.cell ? `${ev.cell} ` : '';
    switch (ev.type) {
        case 'hit': return `${c}명중`;
        case 'miss': return `${c}빗나감`;
        case 'bent': return `${c}못 휨`;
        case 'bounce': return `${c}튕김`;
        case 'occupied': return `${c}이미 있음`;
        case 'nail_in_hole': return `${c}구멍에 못`;
        case 'whiff': return `${c}허공`;
        case 'thumb': return '엄지 찧음';
        case 'half': return '반쯤 걸림';
        case 'popout': return '베어링 튕겨 나감';
        case 'take': return `${ITEM_KO[ev.item] ?? ev.item} ${ev.n}`;
        case 'overtake': return `${ITEM_KO[ev.item] ?? ev.item} ${ev.n} (과다)`;
        case 'emptyhand': return '빈손';
        case 'place': return `${DEST_KO[ev.dest]}`;
        case 'wrongBin': return `${DEST_KO[ev.dest]} (오배송)`;
        case 'hold': return '상자 든 채 멍';
        case 'wrap': return `${ev.n}겹`;
        case 'overwrap': return `${ev.n}겹 (과다)`;
        case 'wrap_outside': return `봉한 뒤 ${ev.n}겹`;
        case 'seal': return '봉함';
        case 'stack': return `${SHELF_KO[ev.shelf]} ${ev.n}`;
        case 'overstack': return `${SHELF_KO[ev.shelf]} ${ev.n} (과다)`;
        case 'floor': return `바닥에 ${ev.n}`;
        case 'ship': return `${ev.code}행`;
        case 'wrong_ship': return `${ev.code}행 (오배송)`;
        case 'lost': return `${ev.code}? 행방불명`;
        case 'noop': return ev.reason === 'empty' ? '멍' : ev.reason === 'zero' ? '집을 것 없음' : '이미 끝난 일';
        case 'tired': return '지쳐서 드러눔';
        default: return FATAL_KO[ev.type] ? `${c}${FATAL_KO[ev.type]}★` : ev.type;
    }
}

/** Guess the station from reference programs (sandbox). */
export function inferStation(targets) {
    const verbs = new Set();
    const words = new Set();
    for (const t of targets) for (const s of parse(t).sentences) { verbs.add(s.verb); for (const a of s.args) words.add(a); }
    if (verbs.has('PUT') && (words.has('HEAVY') || words.has('LIGHT'))) return 'pack';
    for (const [name, st] of Object.entries(STATIONS)) if ([...verbs].every(v => st.verbs.includes(v)) && verbs.size) return name;
    return 'jig';
}

/** Read material / tag / stock / item hints from a work-order line (sandbox). */
export function parseSetup(station, input) {
    const s = String(input ?? '');
    const o = {};
    const m = s.match(/\b(glass|wood|pine|oak|steel|rubber)\b/i);
    if (m) o.material = { pine: 'wood', oak: 'wood' }[m[1].toLowerCase()] ?? m[1].toLowerCase();
    const p = s.match(/pipe(?:\s+\w+){0,2}\s+([A-D][1-4])\b/i);
    if (p) o.pipe = p[1].toUpperCase();
    const tg = s.match(/\b(red|blue|green|orange|yellow)\b/i);
    if (tg && station === 'chute') o.tag = tg[1].toLowerCase();
    const it = s.match(/\b(OIL|TAPE|GLUE|GLOVES)\b/i);
    if (it && station === 'shelf') o.item = it[1].toUpperCase();
    return o;
}

export const STATION_INFO = {
    jig: { label: '조립 지그(망치)', verbs: 'HAMMER / DRILL', args: 'A1–D4, SOFT/MEDIUM/HARD' },
    drill: { label: '조립 지그(드릴)', verbs: 'DRILL / HAMMER', args: 'A1–D4' },
    press: { label: '프레스', verbs: 'PRESS', args: 'SOFT/MEDIUM/HARD' },
    stock: { label: '자재 선반', verbs: 'TAKE', args: '수량 + OIL/TAPE/GLUE/GLOVES' },
    chute: { label: '분류 슈트', verbs: 'PUT', args: 'LEFT/RIGHT/BOX/REWORK/TRASH' },
    pack: { label: '포장대', verbs: 'PUT / WRAP', args: 'HEAVY(3겹) / LIGHT(1겹) / 숫자' },
    shelf: { label: '적재 선반', verbs: 'STACK', args: 'LOW/TOP + 수량' },
    dock: { label: '출하 도크', verbs: 'SHIP', args: 'PUS/ICN/TAE/KWJ/HLD' },
};
