// app.js — Chimp Conveyor v4: one dumb chimp model, production-line work orders, batches of 10.
import * as llm from './llm.js';
import {
    BOSS_LINES,
    WORK_ORDERS, SANDBOX_DEFAULT, MATCH_MODES, DEPARTMENTS, INTRO_TEXT, BATCH_SIZE, PASS_COUNT,
    isUnlocked, campaignComplete, parseBatchText, batchToText,
} from './puzzles.js';
import { score as scoreOutput, stars as starsOf, stripFences } from './similarity.js';
import { load, save, remove } from './storage.js';
import * as eco from './economy.js';
import * as scene from './scene.js';
import * as machine from './machine.js';
import * as line from './line.js';
import { t as T, L, lang, setLang } from './i18n.js';

// ---------- constants ----------
const CHATTER_LINE = /^(sure|certainly|of course|okay|ok|here('s| is| you go)|the (answer|output|result) is|output|result|answer|출력|결과|답|정답|네|물론)\b[^\n]{0,40}?[:：!.]?\s*$/i;
const CHATTER_PREFIX = /^(sure[,!.]?\s*|certainly[,!.]?\s*|here('s| is)( the| your)? (output|result|answer)[:：]?\s*|(output|result|answer|출력|결과|답)[:：]\s*)/i;
const MEMORY_LABEL = ['직전 출력만', '+원본 전표'];
const DEFAULT_MAX_TOKENS = 64;

// ---------- state ----------
const state = {
    phase: 'BOOT',            // BOOT | NO_WEBGPU | MODEL_LOADING | MODEL_ERROR | IDLE | RUNNING | RESULT
    company: load('company', null) ?? eco.newCompany(),
    levelIndex: load('levelIndex', 0),
    sandbox: false,
    puzzle: null,
    prompts: [],
    items: [],                // per-item results for the current/last run: { input, target, outputs[], final, score, ok, done }
    activeItem: -1,
    activeChimp: -1,
    result: null,             // { correct, total, tier, stars, materialCost, revenue, aborted }
    runCtrl: null,
    skipAnim: load('skipAnim', false),
    rawMode: load('rawMode', false),
    lastPrompts: load('lastPrompts', {}),
    sandboxConfig: load('sandbox', null),
    linePrompts: load('linePrompts', {}),   // station id → instruction; carried across line levels
};

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const el = {
    hudDebtWrap: $('hud-debt-wrap'), hudDebt: $('hud-debt'), hudSkill: $('hud-skill'),
    loadStatus: $('load-status'), loadFill: $('load-fill'), loadText: $('load-text'),
    toggleSkip: $('toggle-skip-anim'), toggleRaw: $('toggle-raw'),
    btnPrev: $('btn-prev'), btnNext: $('btn-next'), btnSandbox: $('btn-sandbox'), btnHint: $('btn-hint'), btnResetProgress: $('btn-reset-progress'), btnLang: $('btn-lang'),
    levelIndex: $('level-index'), levelTitle: $('level-title'),
    brief: $('brief'), flavor: $('flavor'), knobs: $('knobs'),
    sandboxPanel: $('sandbox-panel'), sbBatch: $('sb-batch'), sbChimps: $('sb-chimps'), sbMatch: $('sb-match'), btnSbApply: $('btn-sb-apply'),
    conveyor: $('conveyor'), conveyorWrap: $('conveyor-wrap'), statusPanel: $('status-panel'), workDock: $('work-dock'), ledger: $('ledger-block'), btnMenu: $('btn-menu'), menuPanel: $('menu-panel'), btnCopy: $('btn-copy'),
    btnRun: $('btn-run'), btnClear: $('btn-clear'),
    message: $('message-area'),
    sceneCanvas: $('scene'), bubbles: $('bubbles'),
    overlay: $('overlay'), overlayEmoji: $('overlay-emoji'), overlayTitle: $('overlay-title'),
    overlayText: $('overlay-text'), overlayActions: $('overlay-actions'),
};

let cards = [];
let inputCard = null;     // { card, badge, body }
let inspectCard = null;   // { card, badge, rows, foot }
let workCard = null;      // { card, canvas, steps, summary } — the big workpiece panel (action levels)
let speeches = [];        // speech bubble elements over the scene, one per chimp
let messageTimer = null;

const delay = ms => new Promise(r => setTimeout(r, ms));
const wait = ms => (state.skipAnim ? Promise.resolve() : delay(ms));
const clone = o => JSON.parse(JSON.stringify(o));
const isAction = p => (p ?? state.puzzle)?.match === 'action';
const isLine = p => (p ?? state.puzzle)?.match === 'line';
const hasBench = p => isAction(p) || isLine(p);
const roleOf = (p, k) => isLine(p) ? 'worker' : (p.perChimp?.[k]?.role ?? (k === p.chimps - 1 ? 'worker' : 'clerk'));
const workerIdx = p => Array.from({ length: p.chimps }, (_, k) => k).filter(k => roleOf(p, k) === 'worker');
let boss = { runCount: 0, itemDone: false, seen: new Set(), streak: 0, bins: [] };

// ---------- boot ----------
boot();
new ResizeObserver(() => syncScene()).observe(el.conveyor);
document.fonts?.ready?.then(() => syncScene());

function applyStaticText() {
    document.documentElement.lang = lang();
    document.title = T('title');
    for (const n of document.querySelectorAll('[data-i18n]')) n.textContent = T(n.dataset.i18n);
    for (const n of document.querySelectorAll('[data-i18n-title]')) n.title = T(n.dataset.i18nTitle);
}

function boot() {
    applyStaticText();
    scene.mount(el.sceneCanvas);
    scene.setSkipAnim(state.skipAnim);
    el.toggleSkip.checked = state.skipAnim;
    el.toggleRaw.checked = state.rawMode;
    populateMatchModes();
    wireEvents();
    renderHud();
    selectPuzzle(state.levelIndex);

    if (!llm.hasWebGPU()) {
        setPhase('NO_WEBGPU');
        showOverlay('🙈', T('noWebgpuTitle'), T('noWebgpuText'), []);
        setLoadStatus('error', 0, T('noWebgpuStatus'));
        return;
    }
    if (!llm.modelInfo(eco.MODEL_ID)) {
        setPhase('MODEL_ERROR');
        showOverlay('💀', T('noModelTitle'), T('noModelText', eco.MODEL_ID), []);
        return;
    }
    if (state.company.introSeen) {
        loadModel();
    } else {
        showOverlay('🏭', T('companyName'), L(INTRO_TEXT),
            [{ label: T('clockIn'), accent: true, onClick: () => { state.company.introSeen = true; saveCompany(); hideOverlay(); loadModel(); } }]);
    }
}

function populateMatchModes() {
    for (const m of MATCH_MODES) {
        const opt = document.createElement('option');
        opt.value = m.value;
        opt.textContent = L(m.label);
        el.sbMatch.appendChild(opt);
    }
}

function saveCompany() {
    save('company', state.company);
}

// ---------- model loading ----------
async function loadModel() {
    setPhase('MODEL_LOADING');
    setLoadStatus('loading', 0, T('clockingIn'));
    try {
        await llm.init(eco.MODEL_ID, report => {
            const p = Math.max(0, Math.min(1, report.progress ?? 0));
            setLoadStatus('loading', p, report.text ?? '');
        });
        setLoadStatus('ready', 1, T('chimpsReady'));
        setPhase('IDLE');
    } catch (err) {
        console.error(err);
        setLoadStatus('error', 0, T('clockInFailed'));
        setPhase('MODEL_ERROR');
        showOverlay('💀', T('modelFailTitle'), T('modelFailText', String(err?.message ?? err).slice(0, 300)),
            [{ label: T('retry'), accent: true, onClick: () => { hideOverlay(); loadModel(); } }]);
    }
}

function setLoadStatus(kind, progress, text) {
    el.loadStatus.classList.toggle('ready', kind === 'ready');
    el.loadStatus.classList.toggle('error', kind === 'error');
    el.loadFill.style.width = `${Math.round(progress * 100)}%`;
    el.loadText.textContent = text;
    el.loadText.title = text;
}

// ---------- phases ----------
function setPhase(phase) {
    state.phase = phase;
    const idle = phase === 'IDLE' || phase === 'RESULT';
    const running = phase === 'RUNNING';
    el.btnRun.disabled = !(idle || running);
    el.btnRun.textContent = running ? T('stop') : (phase === 'RESULT' ? T('runAgain') : T('run'));
    el.btnRun.classList.toggle('stop', running);
    updateNavButtons();
    el.btnSandbox.disabled = running;
    el.btnClear.disabled = running;
    el.btnSbApply.disabled = running;
    el.btnResetProgress.disabled = running;
    el.conveyor.classList.toggle('running', running);
    for (const c of cards) c.textarea.disabled = running;
}

function updateNavButtons() {
    const running = state.phase === 'RUNNING';
    el.btnPrev.disabled = running || (!state.sandbox && state.levelIndex === 0);
    el.btnNext.disabled = running || (!state.sandbox && (state.levelIndex >= WORK_ORDERS.length - 1
        || !isUnlocked(state.levelIndex + 1, state.company.passed)));
}

// ---------- HUD / knobs ----------
function currentKnobs() {
    return { ...eco.progressionFor(eco.levelOf(state.company)), ...(window.__chimp?.knobOverride ?? {}) };
}

function renderHud(flash = null) {
    const c = state.company;
    el.hudDebtWrap.hidden = c.debt === 0;
    el.hudDebt.textContent = eco.formatWon(c.debt);
    el.hudSkill.textContent = `Lv.${eco.levelOf(c)}`;
    if (state.puzzle && inspectCard) renderLedger();
    renderKnobs();
}

function renderKnobs(highlight = false) {
    const k = currentKnobs();
    el.knobs.innerHTML = '';
    const chips = [
        T('knobPrompt', k.promptLimit),
        T('knobFocus', Math.round((1 - k.temperature) * 100)),
        T('knobTokens', k.maxTokens ?? DEFAULT_MAX_TOKENS),
    ];
    for (const t of chips) {
        const s = document.createElement('span');
        s.className = 'chip' + (highlight ? ' up' : '');
        s.textContent = t;
        el.knobs.appendChild(s);
    }
}


// ---------- puzzle selection ----------
function selectPuzzle(index) {
    const n = WORK_ORDERS.length;
    index = Math.max(0, Math.min(n - 1, index));
    state.sandbox = false;
    state.levelIndex = index;
    save('levelIndex', index);
    el.sandboxPanel.hidden = true;
    applyPuzzle(WORK_ORDERS[index]);
}

function selectSandbox() {
    state.sandbox = true;
    const cfg = { ...SANDBOX_DEFAULT, ...(state.sandboxConfig ?? {}) };
    if (!cfg.batch?.length) cfg.batch = SANDBOX_DEFAULT.batch;
    cfg.samples = cfg.batch.slice(0, 3);
    if (cfg.match === 'action') {
        cfg.station = machine.inferStation(cfg.batch.map(b => b.target));
        for (const b of cfg.batch) b.world = b.world ?? machine.parseSetup(cfg.station, b.input);
    }
    el.sandboxPanel.hidden = false;
    el.sbBatch.value = batchToText(cfg.batch);
    el.sbChimps.value = cfg.chimps;
    el.sbMatch.value = cfg.match;
    applyPuzzle(cfg);
}

function applySandboxForm() {
    const batch = parseBatchText(el.sbBatch.value);
    if (!batch.length) { showMessage(T('sbFormat'), 'hint'); return; }
    const cfg = {
        batch,
        chimps: clamp(parseInt(el.sbChimps.value, 10) || 1, 1, 5),
        match: el.sbMatch.value,
    };
    state.sandboxConfig = cfg;
    save('sandbox', cfg);
    const puzzle = { ...SANDBOX_DEFAULT, ...cfg, samples: batch.slice(0, 3) };
    if (puzzle.match === 'action') {
        puzzle.station = machine.inferStation(batch.map(b => b.target));
        for (const b of batch) b.world = machine.parseSetup(puzzle.station, b.input);
    }
    applyPuzzle(puzzle);
    showMessage(T('sbApplied', batch.length, puzzle.match === 'action' ? (L(machine.STATION_INFO[puzzle.station]?.label) ?? puzzle.station) : ''));
}

function applyPuzzle(puzzle) {
    state.puzzle = puzzle;
    state.result = null;
    state.items = [];
    state.activeItem = -1;
    state.activeChimp = -1;
    const saved = state.lastPrompts[puzzle.id];
    state.prompts = isLine(puzzle)
        ? puzzle.perChimp.map(c => state.linePrompts[c.station] ?? '')
        : Array.from({ length: puzzle.chimps }, (_, i) => saved?.[i] ?? '');

    const locked = !state.sandbox && !isUnlocked(state.levelIndex, state.company.passed);
    const dept = L(DEPARTMENTS[puzzle.dept]) ?? '';
    el.levelIndex.textContent = state.sandbox ? T('testLine') : T('levelIndex', state.levelIndex + 1, WORK_ORDERS.length);
    el.levelTitle.textContent = (locked ? '🔒 ' : '') + L(puzzle.title);
    el.levelTitle.classList.toggle('locked', locked);
    el.brief.textContent = (L(puzzle.brief) ?? '').replace(/^(사장|Boss)\s*:\s*/, '');
    el.flavor.textContent = locked ? T('lockedFlavor') : (L(puzzle.flavor) ?? '');
    el.btnHint.hidden = !puzzle.hint && !puzzle.sampleSolution;
    updateNavButtons();
    showMessage('');
    buildConveyor(puzzle, locked);
    if (state.phase === 'RESULT') setPhase('IDLE');
}

// ---------- conveyor DOM ----------
function buildConveyor(puzzle, locked = false) {
    el.conveyor.innerHTML = '';
    cards = [];
    const knobs = currentKnobs();

    inputCard = samplesCard(puzzle);
    el.conveyor.appendChild(inputCard.card);

    for (let k = 0; k < puzzle.chimps; k++) {
        const label = L(puzzle.perChimp?.[k]?.label) ?? '';
        const role = hasBench(puzzle) ? roleOf(puzzle, k) : 'clerk';
        const card = document.createElement('div');
        card.className = `card chimp ${role}`;

        const title = document.createElement('div');
        title.className = 'card-title';
        title.innerHTML = `<span></span><span class="label"></span>`;
        title.firstChild.textContent = T('chimp', k + 1);
        title.querySelector('.label').textContent = isLine(puzzle) ? label : label + (isAction(puzzle) ? (role === 'worker' ? T('roleWorker') : T('roleClerk')) : '');

        const textarea = document.createElement('textarea');
        textarea.value = state.prompts[k] ?? '';
        textarea.disabled = locked;

        const counter = document.createElement('div');
        counter.className = 'counter';

        const status = document.createElement('div');
        status.className = 'status';

        card.append(title, textarea, counter, status);
        el.conveyor.appendChild(card);

        const bundle = { card, textarea, counter, status, limit: knobs.promptLimit };
        cards.push(bundle);
        applyKnobsToCard(bundle, knobs, k);

        textarea.addEventListener('input', () => {
            state.prompts[k] = textarea.value;
            updateCounter(bundle);
            scene.setInstruction(k, textarea.value.trim().length > 0);
            schedulePromptSave();
        });
    }

    workCard = null;
    el.workDock.innerHTML = '';
    el.workDock.hidden = !hasBench(puzzle);
    if (hasBench(puzzle)) {
        workCard = buildWorkCard(puzzle);
        el.workDock.appendChild(workCard.card);
        renderWork(isLine(puzzle) ? line.goalOf(puzzle.batch[0].job, puzzle.batch[0].targets, puzzle.chimps) : machine.initWorld(puzzle.station, puzzle.batch[0]?.world), -1, isLine(puzzle) ? T('exampleDone') : '');
    }
    el.conveyor.appendChild(goalCard(puzzle));
    syncScene();
    scene.setWorkMode(hasBench(puzzle) ? puzzle.station : null, hasBench(puzzle) ? workerIdx(puzzle) : []);
    cards.forEach((c, k) => scene.setInstruction(k, (state.prompts[k] ?? '').trim().length > 0));
    scene.reset();
    renderQueue();
}

/** Measure card centers and lay the pixel scene out to match them. */
function syncScene() {
    if (!inputCard || !inspectCard || !cards.length) return;
    const center = elm => elm.offsetLeft + elm.offsetWidth / 2;
    const stations = cards.map(c => center(c.card));
    scene.layout({
        cssWidth: el.conveyor.scrollWidth,
        stations,
        inX: center(inputCard.card),
        outX: center(inspectCard.card),
    });
    layoutSpeech(stations);
    el.conveyor.style.height = el.sceneCanvas.style.height;     // cards get exactly the scene's height
    el.statusPanel.style.minHeight = `${el.conveyorWrap.offsetHeight}px`;   // at least the conveyor's height, never a scrollbar
}

// ---------- speech bubbles (HTML, positioned over the canvas) ----------

function layoutSpeech(stations) {
    el.bubbles.style.width = `${el.conveyor.scrollWidth}px`;
    el.bubbles.style.height = el.sceneCanvas.style.height;
    while (speeches.length < stations.length) {
        const d = document.createElement('div');
        d.className = 'speech hidden';
        el.bubbles.appendChild(d);
        speeches.push(d);
    }
    while (speeches.length > stations.length) speeches.pop().remove();
    const bottom = parseInt(el.sceneCanvas.style.height, 10) - scene.CHIMP_HEAD_CSS() + 8;
    stations.forEach((x, k) => {
        speeches[k].style.left = `${x}px`;
        speeches[k].style.bottom = `${bottom}px`;
        speeches[k].classList.toggle('side', isAction() && roleOf(state.puzzle, k) === 'worker');
    });
}

/** Worker bubble: the machine's reading of the output. Verbs yellow, arguments blue, the rest grey. */
function speechScript(k, tokens, activeIdx = -2) {
    const d = speeches[k];
    if (!d) return;
    const side = d.classList.contains('side');
    d.className = `speech script done${side ? ' side' : ''}`;
    d.innerHTML = '';
    if (!tokens.length) { d.textContent = T('emptyOutput'); return; }
    for (const t of tokens) {
        const sp = document.createElement('span');
        sp.className = `tok ${t.role}` + (activeIdx >= -1 && t.s === activeIdx ? ' active' : '');
        sp.textContent = t.t;
        d.appendChild(sp);
    }
    d.title = tokens.map(t => t.t).join(' ');
}

function speechThinking(k) {
    const d = speeches[k];
    if (!d) return;
    d.className = `speech thinking${d.classList.contains('side') ? ' side' : ''}`;
    d.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    d.title = '';
}

function speechText(k, text, { streaming = false } = {}) {
    const d = speeches[k];
    if (!d) return;
    d.className = `speech ${streaming ? 'talking' : 'done'}${d.classList.contains('side') ? ' side' : ''}`;
    d.textContent = text || T('emptyOutput');
    d.title = text || '';
}

function speechMark(k, cls) {
    const d = speeches[k];
    if (d) d.classList.add(cls);
}

function speechHideAll() {
    for (const d of speeches) { const side = d.classList.contains('side'); d.className = `speech hidden${side ? ' side' : ''}`; d.textContent = ''; }
}

/** The ticket card: three samples while idle; during a run the live queue of remaining tickets. */
function samplesCard(puzzle) {
    const card = document.createElement('div');
    card.className = 'card io tickets';
    const t = document.createElement('div');
    t.className = 'card-title';
    t.innerHTML = `<span></span><span class="badge" hidden></span>`;
    t.firstChild.textContent = T('samplesTitle');
    const badge = t.querySelector('.badge');
    const list = document.createElement('div');
    list.className = 'ticket-list';
    const foot = document.createElement('div');
    foot.className = 'sample-foot';
    const info = isAction(puzzle) ? machine.STATION_INFO[puzzle.station] : null;
    foot.textContent = (info ? T('machineNote', L(info.label), info.verbs, info.args) : '') + T('batchNote', puzzle.batch.length);
    card.append(t, list, foot);
    const bundle = { card, badge, list, foot, nodes: new Map(), mode: null, puzzle };
    fillSamples(bundle, puzzle);
    return bundle;
}

function fillSamples(bundle, puzzle) {
    bundle.list.innerHTML = '';
    bundle.nodes = new Map();
    bundle.mode = 'samples';
    for (const s of puzzle.samples ?? []) {
        const row = document.createElement('div');
        row.className = 'ticket sample';
        const i = document.createElement('div');
        i.className = 'sample-in';
        i.textContent = s.input;
        const o = document.createElement('div');
        o.className = 'sample-out';
        o.textContent = '→ ' + s.target;
        row.append(i, o);
        bundle.list.appendChild(row);
    }
}

/** Ticket card during a run: the remaining tickets stand in line; the one just finished slides out. */
function renderQueue() {
    if (!inputCard) return;
    const running = state.phase === 'RUNNING' && state.activeItem >= 0;
    inputCard.foot.hidden = running;
    inputCard.badge.hidden = !running;
    if (!running) {
        if (inputCard.mode !== 'samples') fillSamples(inputCard, state.puzzle);
        return;
    }
    const items = state.items;
    const i = state.activeItem;
    inputCard.badge.textContent = `${i + 1}/${items.length}`;
    if (inputCard.mode !== 'queue') {
        inputCard.list.innerHTML = '';
        inputCard.nodes = new Map();
        inputCard.mode = 'queue';
    }
    // tickets already processed slide out
    for (const [idx, node] of inputCard.nodes) {
        if (idx < i && !node.classList.contains('leaving')) {
            node.classList.add('leaving');
            setTimeout(() => { node.remove(); inputCard.nodes.delete(idx); }, state.skipAnim ? 0 : 320);
        }
    }
    // the rest stand in line
    for (let j = i; j < items.length; j++) {
        let node = inputCard.nodes.get(j);
        if (!node) {
            node = document.createElement('div');
            node.className = 'ticket queue-item';
            const tag = document.createElement('span');
            tag.className = 'queue-tag';
            tag.textContent = String(j + 1);
            const txt = document.createElement('span');
            txt.className = 'queue-text';
            txt.textContent = items[j].input;
            node.append(tag, txt);
            inputCard.list.appendChild(node);
            inputCard.nodes.set(j, node);
        }
        node.classList.toggle('now', j === i);
    }
}

/** The big workpiece panel: the current item's state at 8×, the station checklist, and the verdict line. */
function buildWorkCard(puzzle) {
    const card = document.createElement('div');
    card.className = 'card io work';
    const t = document.createElement('div');
    t.className = 'card-title';
    t.innerHTML = `<span></span><span class="label"></span>`;
    t.firstChild.textContent = T('workTitle');
    t.querySelector('.label').textContent = isLine(puzzle) ? T('lampName') : (L(machine.STATION_INFO[puzzle.station]?.label) ?? '');
    const canvas = document.createElement('canvas');
    canvas.className = 'work-canvas';
    canvas.width = 24;
    canvas.height = 24;
    const steps = document.createElement('div');
    steps.className = 'work-steps';
    for (let k = 0; k < puzzle.chimps; k++) {
        const row = document.createElement('div');
        row.className = 'work-step';
        const name = document.createElement('span');
        name.textContent = `${k + 1}. ${L(puzzle.perChimp?.[k]?.label) ?? T('chimp', k + 1)}`;
        const st = document.createElement('span');
        st.className = 'st';
        st.textContent = isLine(puzzle) ? line.LINE[k].field : (roleOf(puzzle, k) === 'worker' ? T('worker') : T('clerk'));
        row.append(name, st);
        steps.appendChild(row);
    }
    const summary = document.createElement('div');
    summary.className = 'work-summary';
    card.append(t, canvas, steps, summary);
    return { card, canvas, steps, summary };
}

/** Redraw the workpiece panel from a world snapshot; activeK highlights the station at work. */
function renderWork(snapshot, activeK = -1, summaryText = '') {
    if (!workCard) return;
    const ctx = workCard.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#14142a';
    ctx.fillRect(0, 0, 24, 24);
    if (snapshot) scene.drawWorkpieceAt(ctx, snapshot, 2, 2);
    [...workCard.steps.children].forEach((row, k) => {
        row.classList.toggle('active', k === activeK);
    });
    workCard.summary.textContent = summaryText;
}

/** Colour the station checklist from a line judgement (facts per station). */
function renderWorkSteps(judge) {
    if (!workCard) return;
    [...workCard.steps.children].forEach((row, k) => {
        row.classList.remove('ok', 'bad', 'warn');
        const st = row.querySelector('.st');
        if (!judge) { st.textContent = line.LINE[k]?.field ?? ''; return; }
        const facts = judge.facts.filter(f => f.k === k);
        const bad = facts.some(f => !f.ok && !f.cosmetic);
        const warn = !bad && facts.some(f => !f.ok);
        row.classList.add(bad ? 'bad' : warn ? 'warn' : 'ok');
        const casc = facts.find(f => f.cascade !== undefined);
        st.textContent = bad ? (casc ? `✗ ↳${casc.cascade + 1}` : '✗') : warn ? '△' : '✓';
    });
}

function goalCard(puzzle) {
    const card = document.createElement('div');
    card.className = 'card io inspect';
    const t = document.createElement('div');
    t.className = 'card-title';
    t.innerHTML = `<span></span><span class="badge"></span>`;
    t.firstChild.textContent = T('inspectTitle');
    const badge = t.querySelector('.badge');
    const rows = document.createElement('div');
    rows.className = 'inspect-col';
    card.append(t, rows);
    inspectCard = { card, badge, rows, shown: 0 };
    renderInspection();
    return card;
}

/** Redraw the inspection card from state.items / state.result. */
function renderInspection() {
    if (!inspectCard) return;
    const puzzle = state.puzzle;
    const total = puzzle.batch.length;
    const items = state.items.length ? state.items : puzzle.batch.map(b => ({ input: b.input, target: b.target, done: false, ok: false }));
    const correct = items.filter(it => it.ok).length;
    const running = state.phase === 'RUNNING';
    const started = state.items.length > 0;

    inspectCard.badge.textContent = `${correct} / ${total}`;
    el.btnCopy.disabled = !state.result;

    const doneCount = items.filter(it => it.done).length;
    const prev = inspectCard.shown ?? 0;
    inspectCard.rows.innerHTML = '';
    items.forEach((it, i) => {
        if (!it.done && !(running && i === state.activeItem)) return;
        const row = document.createElement('div');
        row.className = `inspect-row ${it.done ? (it.ok ? 'ok' : 'bad') : 'active'}${it.done && i >= prev ? ' enter' : ''}`;
        const n = document.createElement('span');
        n.className = 'n';
        n.textContent = String(i + 1);
        const mark = document.createElement('span');
        mark.className = 'mark';
        mark.textContent = it.done ? (it.ok ? '✓' : '✗') : '…';
        const out = document.createElement('span');
        out.className = 'out';
        out.textContent = it.done ? (it.final || T('emptyOutput')) : '';
        row.append(n, out, mark);
        row.title = `${T('tipInput')}: ${it.input}\n${T('tipExpect')}: ${it.target}` + (it.done ? `\n${T('tipOutput')}: ${it.final || T('emptyOutput')}${it.detail ? `\n${it.detail}` : ''}` : '');
        inspectCard.rows.appendChild(row);
    });
    inspectCard.shown = doneCount;
    inspectCard.rows.scrollTop = inspectCard.rows.scrollHeight;

    renderLedger();
}

/** 손익계산서 at the bottom of the inspection card: quote before the run, statement after. */
function renderLedger() {
    const puzzle = state.puzzle;
    const total = puzzle.batch.length;
    const foot = el.ledger;
    foot.innerHTML = '';
    const line = (k, v, cls = '') => {
        const kk = document.createElement('span');
        kk.className = 'k';
        kk.textContent = k;
        const vv = document.createElement('span');
        vv.className = `v ${cls}`;
        vv.textContent = v;
        foot.append(kk, vv);
    };
    if (state.sandbox) {
        line(T('ledgerTest'), T('ledgerItems', total, L(MATCH_MODES.find(m => m.value === puzzle.match)?.label) ?? puzzle.match));
        if (state.result) line(T('ledgerResult'), `${state.result.tier.label} ${state.result.correct}/${total}`, state.result.tier.key);
        return;
    }
    const per = eco.payout(1, total, puzzle.revenue);
    const r = state.result;
    if (isLine(puzzle) && state.items.some(it => it.done)) {
        const done = state.items.filter(it => it.done && it.actionOk);
        const rate = puzzle.perChimp.map((c, k) => done.filter(it => it.actionOk[k]).length);
        line(T('ledgerHits'), rate.map((n, k) => `${k + 1}:${n}`).join(' '));
    }
    line(T('ledgerPass'), `${PASS_COUNT} / ${total}`);
    line(T('ledgerPrice'), `${eco.formatWon(per)} × ${total}`);
    line(T('ledgerMaterial'), `-${eco.formatWon(puzzle.materialCost)}`, 'bad');
    if (!r) line(T('ledgerCash'), eco.formatWon(state.company.cash));
    if (r) {
        const profit = r.revenue - r.materialCost;
        line(T('ledgerRevenue'), `${eco.formatWon(per)} × ${r.correct} = ${eco.formatWon(r.revenue)}`, r.revenue > 0 ? 'good' : '');
        line(T('ledgerProfit'), `${profit >= 0 ? '+' : ''}${eco.formatWon(profit)}`, `total ${profit >= 0 ? 'good' : 'bad'}`);
        line(T('ledgerVerdict'), r.tier.label, `total ${r.tier.key}`);
        line(T('ledgerCash'), eco.formatWon(state.company.cash));
    }
}

function applyKnobsToCard(b, knobs, k) {
    b.limit = knobs.promptLimit;
    b.textarea.maxLength = knobs.promptLimit;
    b.textarea.placeholder = T('placeholder', k + 1, knobs.promptLimit);
    if (b.textarea.value.length > knobs.promptLimit) {
        b.textarea.value = b.textarea.value.slice(0, knobs.promptLimit);
        state.prompts[k] = b.textarea.value;
    }
    updateCounter(b);
}

function renderConveyorKnobs() {
    const knobs = currentKnobs();
    cards.forEach((b, k) => applyKnobsToCard(b, knobs, k));
}

function updateCounter(b) {
    const n = b.textarea.value.length;
    b.counter.textContent = `${n}/${b.limit}`;
    b.counter.classList.toggle('warn', n >= b.limit * 0.9 && n < b.limit);
    b.counter.classList.toggle('over', n >= b.limit);
}

function resetCards() {
    if (inspectCard) inspectCard.shown = 0;
    scene.reset();
    speechHideAll();
    for (const c of cards) {
        c.card.classList.remove('active', 'done', 'failed');
        c.status.textContent = '';
        c.status.className = 'status';
    }
    renderQueue();
}

function showCurrentItem() {
    renderQueue();
}

// ---------- run loop ----------
// (No answer-hardcoding guard: with 10 varied items per batch, a hardcoded answer scores 1/10 on its own.)

async function runChain() {
    const puzzle = state.puzzle;
    if (!state.sandbox && !isUnlocked(state.levelIndex, state.company.passed)) {
        showMessage(T('locked'), 'hint');
        return;
    }
    if (state.prompts.some(p => !p.trim())) {
        showMessage(T('needAll'), 'hint');
        const idx = state.prompts.findIndex(p => !p.trim());
        cards[idx]?.textarea.focus();
        return;
    }

    const knobs = currentKnobs();
    const materialCost = state.sandbox ? 0 : puzzle.materialCost;
    if (!state.sandbox && eco.needsLoan(state.company, materialCost)) {
        showLoanOffer(T('noMaterialMoney', eco.formatWon(materialCost)));
        return;
    }

    const ctrl = new AbortController();
    state.runCtrl = ctrl;
    state.items = puzzle.batch.map(b => ({ input: b.input, target: b.target, note: b.note, outputs: [], runs: [], final: null, score: 0, ok: false, done: false,
        world: isLine(puzzle) ? line.initAssembly(b.job) : isAction(puzzle) ? machine.initWorld(puzzle.station, b.world) : null,
        goal: isLine(puzzle) ? line.goalOf(b.job, b.targets, puzzle.chimps) : null }));
    boss = { runCount: 0, itemDone: false, seen: new Set(), streak: 0, bins: [] };
    state.result = null;
    resetCards();
    setPhase('RUNNING');
    scene.start();
    scene.itemProgress(0, state.items.length, 0);
    showMessage('');
    renderInspection();

    if (materialCost > 0) {
        state.company = eco.chargeMaterial(state.company, materialCost);
        saveCompany();
        renderHud(-1);
    }

    let aborted = false;
    let failed = false;

    outer:
    for (let i = 0; i < state.items.length; i++) {
        const item = state.items[i];
        state.activeItem = i;
        showCurrentItem();
        renderInspection();
        for (const c of cards) { c.card.classList.remove('done'); c.status.textContent = ''; c.status.className = 'status'; }
        scene.allChimps('idle');
        speechHideAll();
        scene.hideParcel();
        boss.itemDone = false;
        if (hasBench(puzzle)) { scene.setWorkpiece(clone(item.world)); renderWorkSteps(null); renderWork(item.world, -1, T('ticketN', i + 1, state.items.length)); }
        if (i === 0) scrollCardIntoView(inputCard.card);
        await scene.spawnParcel();
        if (ctrl.signal.aborted) { aborted = true; markAborted(cards[0]); break outer; }
        let carry = item.input;

        for (let k = 0; k < puzzle.chimps; k++) {
            const b = cards[k];
            state.activeChimp = k;
            b.card.classList.add('active');
            scene.setActive(k);
            if (i === 0) scrollCardIntoView(b.card);
            await scene.parcelTo(k);
            if (ctrl.signal.aborted) { aborted = true; markAborted(b); break outer; }

            scene.chimpState(k, 'think');
            speechThinking(k);
            const context = {};
            if (knobs.memoryLevel >= 1 && k > 0) context.originalInput = item.input;

            let raw = '';
            try {
                raw = await llm.generate({
                    prompt: state.prompts[k],
                    input: isLine(puzzle) ? item.input : carry,
                    context,
                    signal: ctrl.signal,
                    maxTokens: knobs.maxTokens ?? DEFAULT_MAX_TOKENS,
                    temperature: knobs.temperature,
                    onToken: (text) => {
                        scene.chimpState(k, 'write');
                        speechText(k, text, { streaming: true });
                    },
                });
            } catch (err) {
                if (err?.name === 'AbortError') { aborted = true; markAborted(b); break outer; }
                console.error(err);
                failed = true;
                scene.chimpState(k, 'dead');
                speechText(k, '…');
                speechMark(k, 'dead');
                b.status.textContent = T('error', String(err?.message ?? err).slice(0, 80));
                b.status.classList.add('error');
                b.card.classList.remove('active');
                b.card.classList.add('failed');
                break outer;
            }
            const cleaned = state.rawMode ? raw.trim() : postClean(raw);
            item.outputs[k] = cleaned;
            if (!state.rawMode && cleaned !== raw.trim()) b.status.textContent = T('trimmed');
            carry = cleaned;

            if (isLine(puzzle) || (isAction(puzzle) && roleOf(puzzle, k) === 'worker')) {
                // The machine executes what this chimp said, on the workpiece it has in front of it.
                const r = isLine(puzzle)
                    ? line.runStation(item.world, k, cleaned, item.goal)
                    : machine.run(item.world, cleaned, machine.goalOf(puzzle.station, puzzle.batch[i].world, item.target));
                item.runs[k] = { tokens: r.tokens, events: r.events.map(({ after, ...e }) => e) };
                speechScript(k, r.tokens);
                await wait(150);
                await scene.playEvents(k, r.events, {
                    tempo: i < 2 ? 1 : 0.65,
                    signal: ctrl.signal,
                    onEvent: ev => { speechScript(k, r.tokens, ev.idx); maybeBoss(ev, false); renderWork(ev.after, k, (isLine(puzzle) ? line.eventLabel : machine.eventLabel)(ev)); },
                    onBig: (ev, first) => maybeBoss(ev, first),
                });
                speechScript(k, r.tokens);
                if (state.skipAnim) for (const ev of r.events) maybeBoss(ev, ev.big);
                if (ctrl.signal.aborted) { aborted = true; markAborted(b); break outer; }
            } else {
                speechText(k, cleaned);
            }

            scene.chimpState(k, 'idle');
            if (k < puzzle.chimps - 1 && i === 0) await wait(300);
            b.card.classList.remove('active');
            b.card.classList.add('done');
        }

        if (isLine(puzzle)) {
            const b = puzzle.batch[i];
            const j = line.scoreLine(b.job, b.targets, item.outputs, puzzle.chimps, { cosmeticPaint: puzzle.chimps > 10 });
            item.final = j.summary;
            item.score = j.score;
            item.detail = j.detail;
            item.ok = j.correct;
            item.fatal = j.fatal;
            item.actionOk = j.actionOk;
            renderWork(item.world, -1, `${item.ok ? '✓' : '✗'} ${j.summary}`);
            renderWorkSteps(j);
            workCard?.summary.classList.toggle('bad', !item.ok);
        } else if (isAction(puzzle)) {
            const j = machine.score(item.outputs[workerIdx(puzzle).at(-1)] ?? '', { target: item.target, world: puzzle.batch[i].world }, puzzle);
            item.final = j.summary;
            item.score = j.score;
            item.detail = j.detail;
            item.ok = j.correct;
            item.fatal = j.fatal;
            renderWork(item.world, -1, `${item.ok ? '✓' : '✗'} ${j.summary}`);
            workCard?.summary.classList.toggle('bad', !item.ok);
        } else {
            item.final = carry;
            const { score, detail } = scoreOutput(carry, item.target, puzzle.match);
            item.score = score;
            item.detail = detail;
            item.ok = score >= puzzle.itemThreshold;
        }
        item.done = true;
        boss.streak = item.ok ? boss.streak + 1 : 0;
        if (boss.streak === 3) sayBoss('streak3');
        speechMark(puzzle.chimps - 1, item.ok ? 'ok' : 'bad');
        if (hasBench(puzzle)) await scene.showVerdict(item.ok, item.world);
        await scene.parcelTo(puzzle.chimps);
        scene.chimpState(puzzle.chimps - 1, item.ok ? 'happy' : 'sad');
        scene.itemProgress(i + 1, state.items.length, state.items.filter(it => it.ok).length);
        renderInspection();
        await wait(250);
        scene.hideParcel();
    }

    state.runCtrl = null;
    scene.stop();

    if (failed) {
        setPhase('IDLE');
        renderQueue();
        showMessage(T('chimpDown', eco.formatWon(materialCost)), 'hint');
        if (!state.sandbox) offerLoanIfNeeded();
        return;
    }
    finish(materialCost, aborted);
}

/** Boss one-liners: at most 12 per run and 1 per item; highlights and first-seen event types go first. */
function maybeBoss(ev, isHighlight) {
    if (boss.runCount >= 12 || boss.itemDone) return;
    if (ev.type === 'hit' || ev.type === 'take' || ev.type === 'place' || ev.type === 'wrap' || ev.type === 'seal' || ev.type === 'ship') return;
    if (ev.type === 'wrongBin' || ev.type === 'place') {
        boss.bins.push(ev.dest);
        if (boss.bins.length >= 3 && boss.bins.slice(-3).every(d => d === 'LEFT') && !boss.seen.has('allLeft')) { sayBoss('allLeft'); return; }
    }
    const first = !boss.seen.has(ev.type);
    if (!(isHighlight || ev.big || first || Math.random() < 0.25)) return;
    sayBoss(ev.type);
}

function sayBoss(key) {
    const lines = state.puzzle?.boss?.[key] ?? L(BOSS_LINES)[key];
    if (!lines?.length) return;
    boss.seen.add(key);
    boss.runCount++;
    boss.itemDone = true;
    showMessage(pick(lines), 'boss');
}

function markAborted(b) {
    b.status.textContent = T('aborted');
    b.status.classList.add('aborted');
    b.card.classList.remove('active');
}

function postClean(text) {
    let t = stripFences(text).trim();
    const lines = t.split('\n');
    while (lines.length > 1 && CHATTER_LINE.test(lines[0].trim())) lines.shift();
    t = lines.join('\n').trim();
    t = t.replace(CHATTER_PREFIX, '').trim();
    return t;
}

function tierFor(correct, total) {
    if (correct === total) return { key: 'perfect', label: T('tierPerfect'), emoji: 'PERFECT' };
    if (eco.isPass(correct)) return { key: 'pass', label: T('tierPass'), emoji: 'PASS' };
    if (correct >= 3) return { key: 'close', label: T('tierClose'), emoji: 'CLOSE' };
    return { key: 'disaster', label: T('tierDisaster'), emoji: 'FAIL' };
}

function finish(materialCost, aborted) {
    const puzzle = state.puzzle;
    const total = state.items.length;
    const correct = state.items.filter(it => it.ok).length;
    const tier = tierFor(correct, total);
    const used = state.prompts.reduce((a, p) => a + p.length, 0);
    const budget = cards.reduce((a, c) => a + c.limit, 0);
    const stars = starsOf(correct / total, PASS_COUNT / total, budget ? used / budget : 1);
    const revenue = state.sandbox ? 0 : eco.payout(correct, total, puzzle.revenue);
    state.result = { correct, total, tier, stars, materialCost, revenue, aborted };
    scene.allChimps(eco.isPass(correct) ? 'happy' : 'sad');

    let leveledUp = false;
    if (!state.sandbox) {
        const levelBefore = eco.levelOf(state.company);
        state.company = eco.addRevenue(state.company, revenue, { items: state.items.filter(i => i.done).length, correct });
        const passedNow = eco.isPass(correct);
        const prev = state.company.passed[puzzle.id];
        if (passedNow) {
            state.company.passed[puzzle.id] = {
                stars: Math.max(stars, prev?.stars ?? 0),
                bestCorrect: Math.max(correct, prev?.bestCorrect ?? 0),
            };
        }
        saveCompany();
        leveledUp = eco.levelOf(state.company) > levelBefore;
        renderHud(revenue > 0 ? 1 : null);
        if (leveledUp) renderKnobs(true);
    }

    setPhase('RESULT');
    renderInspection();
    renderQueue();

    if (aborted) showMessage(T('stopped', state.items.filter(i => i.done).length), 'hint');
    else if (leveledUp) showMessage(T('leveledUp'));

    if (!state.sandbox) {
        if (campaignComplete(state.company.passed) && !state.company.reportSeen) {
            state.company.reportSeen = true;
            saveCompany();
            setTimeout(showFinalReport, state.skipAnim ? 0 : 1200);
        } else if (!aborted) {
            offerLoanIfNeeded();
        }
    }
}

function buildTranscript() {
    const p = state.puzzle;
    const k = currentKnobs();
    const lines = [T('transcriptHead', L(DEPARTMENTS[p.dept]) ?? '', L(p.title))];
    state.prompts.forEach((pr, i) => lines.push(T('transcriptChimp', i + 1, pr)));
    lines.push('');
    state.items.forEach((it, i) => {
        if (!it.done) return;
        lines.push(`${String(i + 1).padStart(2)} ${it.ok ? '✓' : '✗'} ${it.input.replace(/\n/g, ' | ')}`);
        lines.push(`     → ${it.outputs.map(o => (o ?? '').replace(/\n/g, ' | ')).join('  →  ')}`);
        if (hasBench(p)) {
            const lab = isLine(p) ? line.eventLabel : machine.eventLabel;
            it.runs.forEach((r, k) => { if (r) lines.push(`     [${k + 1}] ${r.events.map(lab).join(' / ')}`); });
            lines.push(T('transcriptVerdict', it.final, it.ok ? '' : it.target));
        } else if (!it.ok) lines.push(T('transcriptExpected', it.target));
    });
    if (state.result) {
        const r = state.result;
        lines.push('', T('transcriptResult', r.tier.label, r.correct, r.total, PASS_COUNT));
        if (!state.sandbox) lines.push(T('transcriptProfit', eco.formatWon(r.revenue), eco.formatWon(r.materialCost), eco.formatWon(r.revenue - r.materialCost)));
    }
    lines.push(T('transcriptKnobs', eco.levelOf(state.company), k.promptLimit, k.temperature, k.maxTokens ?? DEFAULT_MAX_TOKENS, eco.MODEL_ID));
    return lines.join('\n');
}

function showFinalReport() {
    const s = state.company.stats;
    const net = eco.netProfit(state.company);
    const rate = s.items ? Math.round(s.correct / s.items * 100) : 0;
    showOverlay('📊', T('reportTitle'),
        T('reportBody', { rev: eco.formatWon(s.revenue), mat: eco.formatWon(s.material), runs: s.runs, items: s.items, correct: s.correct }, eco.formatWon(state.company.debt), rate, eco.formatWon(net), eco.verdict(net)),
        [{ label: T('keepRolling'), accent: true, onClick: hideOverlay }]);
}

// ---------- loans ----------
function offerLoanIfNeeded() {
    if (state.sandbox) return;
    if (eco.needsLoan(state.company, state.puzzle.materialCost)) {
        showLoanOffer(T('loanNeeded'));
    }
}

function showLoanOffer(text) {
    showMessage(text + ' ', 'hint');
    const btn = document.createElement('button');
    btn.className = 'btn small loan';
    btn.textContent = T('loanButton', eco.formatWon(eco.LOAN_AMOUNT));
    btn.addEventListener('click', () => {
        state.company = eco.takeLoan(state.company);
        saveCompany();
        renderHud(1);
        renderInspection();
        showMessage(T('loanTaken'));
    });
    el.message.appendChild(btn);
}

function resetProgress() {
    if (!confirm(T('resetConfirm'))) return;
    state.company = { ...eco.newCompany(), introSeen: true };
    state.lastPrompts = {};
    remove('lastPrompts');
    saveCompany();
    save('levelIndex', 0);
    renderHud();
    selectPuzzle(0);
    showMessage(T('newYear'));
}

// ---------- animation helpers ----------
function scrollCardIntoView(card) {
    card.scrollIntoView({ behavior: state.skipAnim ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
}

// ---------- misc UI ----------
function showMessage(text, kind = '') {
    clearTimeout(messageTimer);
    el.message.textContent = text;
    el.message.className = `message-area ${kind}`;
    if (text && kind !== 'hint') messageTimer = setTimeout(() => { el.message.textContent = ''; }, kind === 'boss' ? 4500 : 3500);
}

function showOverlay(emoji, title, text, actions) {
    el.overlayEmoji.textContent = emoji;
    el.overlayTitle.textContent = title;
    el.overlayText.textContent = text;
    el.overlayActions.innerHTML = '';
    for (const a of actions) {
        const btn = document.createElement('button');
        btn.className = `btn ${a.accent ? 'accent' : ''}`;
        btn.textContent = a.label;
        btn.addEventListener('click', a.onClick);
        el.overlayActions.appendChild(btn);
    }
    el.overlay.hidden = false;
}

function hideOverlay() {
    el.overlay.hidden = true;
}

function showHint() {
    const p = state.puzzle;
    const fails = state.result && !(state.result.tier.key === 'pass' || state.result.tier.key === 'perfect');
    if (p.sampleSolution && (fails || !p.hint)) {
        const ok = p.hint ? confirm(T('hintConfirm')) : true;
        if (ok) {
            showMessage(T('hintExample') + p.sampleSolution.map((s, i) => `[${i + 1}] ${s}`).join('  '), 'hint');
            return;
        }
    }
    showMessage(p.hint ? `${L(p.flavor) ?? ''} ${T('hintPrefix', L(p.hint))}`.trim() : (L(p.flavor) ?? T('noHint')), 'hint');
}

let promptSaveTimer = null;
function schedulePromptSave() {
    clearTimeout(promptSaveTimer);
    promptSaveTimer = setTimeout(() => {
        state.lastPrompts[state.puzzle.id] = [...state.prompts];
        save('lastPrompts', state.lastPrompts);
        if (isLine()) {
            state.puzzle.perChimp.forEach((c, k) => { state.linePrompts[c.station] = state.prompts[k] ?? ''; });
            save('linePrompts', state.linePrompts);
        }
    }, 300);
}

async function copyTranscript() {
    const text = buildTranscript();
    try {
        await navigator.clipboard.writeText(text);
        showMessage(T('copied'));
    } catch {
        window.prompt(T('copyBlocked'), text);
    }
}

// ---------- events ----------
function wireEvents() {
    el.btnRun.addEventListener('click', () => {
        if (state.phase === 'RUNNING') {
            state.runCtrl?.abort();
            llm.abort();
        } else if (state.phase === 'IDLE' || state.phase === 'RESULT') {
            runChain();
        }
    });
    el.btnClear.addEventListener('click', () => {
        state.prompts = state.prompts.map(() => '');
        for (const c of cards) { c.textarea.value = ''; updateCounter(c); }
        resetCards();
        state.result = null;
        state.items = [];
        renderInspection();
        schedulePromptSave();
        if (state.phase === 'RESULT') setPhase('IDLE');
    });
    el.btnPrev.addEventListener('click', () => selectPuzzle(state.sandbox ? state.levelIndex : state.levelIndex - 1));
    el.btnNext.addEventListener('click', () => selectPuzzle(state.sandbox ? state.levelIndex : state.levelIndex + 1));
    el.btnSandbox.addEventListener('click', () => { if (state.sandbox) selectPuzzle(state.levelIndex); else selectSandbox(); });
    el.btnSbApply.addEventListener('click', applySandboxForm);
    el.btnHint.addEventListener('click', showHint);
    el.btnResetProgress.addEventListener('click', resetProgress);
    el.btnLang.addEventListener('click', () => { setLang(lang() === 'ko' ? 'en' : 'ko'); location.reload(); });
    el.btnMenu.addEventListener('click', e => { e.stopPropagation(); el.menuPanel.hidden = !el.menuPanel.hidden; });
    el.btnCopy.addEventListener('click', () => { el.menuPanel.hidden = true; copyTranscript(); });
    el.menuPanel.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => { el.menuPanel.hidden = true; });
    el.btnSandbox.addEventListener('click', () => { el.menuPanel.hidden = true; });

    el.toggleSkip.addEventListener('change', () => { state.skipAnim = el.toggleSkip.checked; save('skipAnim', state.skipAnim); scene.setSkipAnim(state.skipAnim); });
    el.toggleRaw.addEventListener('change', () => { state.rawMode = el.toggleRaw.checked; save('rawMode', state.rawMode); });

    document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && (state.phase === 'IDLE' || state.phase === 'RESULT')) {
            e.preventDefault();
            runChain();
        }
    });
}

// ---------- utils ----------
function starString(n) {
    return '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
}

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

// Test hook (used by the CDP smoke tests; harmless otherwise).
window.__chimp = {
    get state() { return state; },
    get company() { return state.company; },
    setCompany(c) { state.company = c; saveCompany(); renderHud(); renderConveyorKnobs(); },
    knobOverride: null,       // e.g. { temperature: 0.3 } for balance measurements
    selectPuzzle, selectSandbox, machine, scene, line,
};
