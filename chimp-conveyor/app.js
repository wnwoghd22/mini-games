// app.js — Chimp Conveyor v4: one dumb chimp model, production-line work orders, batches of 10.
import * as llm from './llm.js';
import {
    WORK_ORDERS, SANDBOX_DEFAULT, MATCH_MODES, DEPARTMENTS, INTRO_TEXT, BATCH_SIZE, PASS_COUNT,
    isUnlocked, campaignComplete, parseBatchText, batchToText,
} from './puzzles.js';
import { score as scoreOutput, stars as starsOf, stripFences } from './similarity.js';
import { load, save, remove } from './storage.js';
import * as eco from './economy.js';
import * as scene from './scene.js';

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
};

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const el = {
    hudCash: $('hud-cash'), hudDebtWrap: $('hud-debt-wrap'), hudDebt: $('hud-debt'), hudSkill: $('hud-skill'),
    loadStatus: $('load-status'), loadFill: $('load-fill'), loadText: $('load-text'),
    toggleSkip: $('toggle-skip-anim'), toggleRaw: $('toggle-raw'),
    btnPrev: $('btn-prev'), btnNext: $('btn-next'), btnSandbox: $('btn-sandbox'), btnHint: $('btn-hint'), btnResetProgress: $('btn-reset-progress'),
    levelIndex: $('level-index'), levelTitle: $('level-title'), levelStars: $('level-stars'),
    brief: $('brief'), flavor: $('flavor'), knobs: $('knobs'),
    sandboxPanel: $('sandbox-panel'), sbBatch: $('sb-batch'), sbChimps: $('sb-chimps'), sbMatch: $('sb-match'), btnSbApply: $('btn-sb-apply'),
    conveyor: $('conveyor'),
    btnRun: $('btn-run'), btnClear: $('btn-clear'),
    message: $('message-area'),
    sceneCanvas: $('scene'), bubbles: $('bubbles'),
    overlay: $('overlay'), overlayEmoji: $('overlay-emoji'), overlayTitle: $('overlay-title'),
    overlayText: $('overlay-text'), overlayActions: $('overlay-actions'),
};

let cards = [];
let inputCard = null;     // { card, badge, body }
let inspectCard = null;   // { card, badge, rows, foot }
let speeches = [];        // speech bubble elements over the scene, one per chimp
let messageTimer = null;

const delay = ms => new Promise(r => setTimeout(r, ms));
const wait = ms => (state.skipAnim ? Promise.resolve() : delay(ms));

// ---------- boot ----------
boot();
new ResizeObserver(() => syncScene()).observe(el.conveyor);
document.fonts?.ready?.then(() => syncScene());

function boot() {
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
        showOverlay('🙈', 'WebGPU가 없습니다',
            '이 게임은 브라우저 안에서 소형 LLM을 직접 돌립니다.\n최신 Chrome 또는 Edge(데스크톱)에서 열어 주세요.\nFirefox/Safari는 아직 지원이 불안정합니다.',
            []);
        setLoadStatus('error', 0, 'WebGPU 미지원');
        return;
    }
    if (!llm.modelInfo(eco.MODEL_ID)) {
        setPhase('MODEL_ERROR');
        showOverlay('💀', '침팬지 모델을 찾을 수 없습니다', `WebLLM 목록에 ${eco.MODEL_ID}가 없습니다. 라이브러리 버전을 확인해 주세요.`, []);
        return;
    }
    if (state.company.introSeen) {
        loadModel();
    } else {
        showOverlay('🏭', '침팬지 컨베이어 주식회사', INTRO_TEXT,
            [{ label: '출근하기', accent: true, onClick: () => { state.company.introSeen = true; saveCompany(); hideOverlay(); loadModel(); } }]);
    }
}

function populateMatchModes() {
    for (const m of MATCH_MODES) {
        const opt = document.createElement('option');
        opt.value = m.value;
        opt.textContent = m.label;
        el.sbMatch.appendChild(opt);
    }
}

function saveCompany() {
    save('company', state.company);
}

// ---------- model loading ----------
async function loadModel() {
    setPhase('MODEL_LOADING');
    setLoadStatus('loading', 0, '침팬지 출근 중…');
    try {
        await llm.init(eco.MODEL_ID, report => {
            const p = Math.max(0, Math.min(1, report.progress ?? 0));
            setLoadStatus('loading', p, report.text ?? '');
        });
        setLoadStatus('ready', 1, '침팬지 대기 중');
        setPhase('IDLE');
    } catch (err) {
        console.error(err);
        setLoadStatus('error', 0, '출근 실패');
        setPhase('MODEL_ERROR');
        showOverlay('💀', '침팬지가 출근하다 넘어졌습니다',
            `모델을 불러오지 못했습니다.\n${String(err?.message ?? err).slice(0, 300)}\n\n네트워크 상태나 GPU 메모리를 확인해 주세요.`,
            [{ label: '다시 시도', accent: true, onClick: () => { hideOverlay(); loadModel(); } }]);
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
    el.btnRun.textContent = running ? '■ 정지' : (phase === 'RESULT' ? '▶ 다시 가동' : '▶ 가동');
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
    el.hudCash.textContent = eco.formatWon(c.cash);
    el.hudDebtWrap.hidden = c.debt === 0;
    el.hudDebt.textContent = eco.formatWon(c.debt);
    el.hudSkill.textContent = `Lv.${eco.levelOf(c)}`;
    if (flash) {
        el.hudCash.classList.remove('flash-up', 'flash-down');
        void el.hudCash.offsetWidth;
        el.hudCash.classList.add(flash > 0 ? 'flash-up' : 'flash-down');
    }
    renderKnobs();
}

function renderKnobs(highlight = false) {
    const k = currentKnobs();
    el.knobs.innerHTML = '';
    const chips = [
        `📄 지시서 ${k.promptLimit}자`,
        `🎯 집중력 ${Math.round((1 - k.temperature) * 100)}`,
        `🧾 출력 용지 ${k.maxTokens ?? DEFAULT_MAX_TOKENS}토큰`,
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
    el.sandboxPanel.hidden = false;
    el.sbBatch.value = batchToText(cfg.batch);
    el.sbChimps.value = cfg.chimps;
    el.sbMatch.value = cfg.match;
    applyPuzzle(cfg);
}

function applySandboxForm() {
    const batch = parseBatchText(el.sbBatch.value);
    if (!batch.length) { showMessage('한 줄에 한 건, "입력 => 목표" 형식으로 적어 주세요.', 'hint'); return; }
    const cfg = {
        batch,
        chimps: clamp(parseInt(el.sbChimps.value, 10) || 1, 1, 5),
        match: el.sbMatch.value,
    };
    state.sandboxConfig = cfg;
    save('sandbox', cfg);
    applyPuzzle({ ...SANDBOX_DEFAULT, ...cfg, samples: batch.slice(0, 3) });
    showMessage(`샌드박스 배치 ${batch.length}건을 적용했습니다.`);
}

function applyPuzzle(puzzle) {
    state.puzzle = puzzle;
    state.result = null;
    state.items = [];
    state.activeItem = -1;
    state.activeChimp = -1;
    const saved = state.lastPrompts[puzzle.id];
    state.prompts = Array.from({ length: puzzle.chimps }, (_, i) => saved?.[i] ?? '');

    const locked = !state.sandbox && !isUnlocked(state.levelIndex, state.company.passed);
    const dept = DEPARTMENTS[puzzle.dept] ?? '';
    el.levelIndex.textContent = state.sandbox ? '시험 라인' : `작업 ${state.levelIndex + 1}/${WORK_ORDERS.length} · ${dept}`;
    el.levelTitle.textContent = (locked ? '🔒 ' : '') + puzzle.title;
    el.levelTitle.classList.toggle('locked', locked);
    el.levelStars.textContent = state.sandbox ? '' : starString(state.company.passed[puzzle.id]?.stars ?? 0);
    el.brief.textContent = puzzle.brief ?? '';
    el.flavor.textContent = locked ? '이전 작업을 통과하면 해금됩니다.' : (puzzle.flavor ?? '');
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
        const label = puzzle.perChimp?.[k]?.label ?? '';
        const card = document.createElement('div');
        card.className = 'card chimp';

        const title = document.createElement('div');
        title.className = 'card-title';
        title.innerHTML = `<span>침팬지 ${k + 1}</span><span class="label"></span>`;
        title.querySelector('.label').textContent = label;

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

    el.conveyor.appendChild(goalCard(puzzle));
    syncScene();
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
    });
}

function speechThinking(k) {
    const d = speeches[k];
    if (!d) return;
    d.className = 'speech thinking';
    d.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    d.title = '';
}

function speechText(k, text, { streaming = false } = {}) {
    const d = speeches[k];
    if (!d) return;
    d.className = `speech ${streaming ? 'talking' : 'done'}`;
    d.textContent = text || '(빈 출력)';
    d.title = text || '';
}

function speechMark(k, cls) {
    const d = speeches[k];
    if (d) d.classList.add(cls);
}

function speechHideAll() {
    for (const d of speeches) { d.className = 'speech hidden'; d.textContent = ''; }
}

function samplesCard(puzzle) {
    const card = document.createElement('div');
    card.className = 'card io samples';
    const t = document.createElement('div');
    t.className = 'card-title';
    t.innerHTML = `<span>샘플 전표</span><span class="badge" hidden></span>`;
    const badge = t.querySelector('.badge');
    const body = document.createElement('div');
    body.className = 'sample-list';
    for (const s of puzzle.samples ?? []) {
        const row = document.createElement('div');
        row.className = 'sample';
        const i = document.createElement('div');
        i.className = 'sample-in';
        i.textContent = s.input;
        const o = document.createElement('div');
        o.className = 'sample-out';
        o.textContent = '→ ' + s.target;
        row.append(i, o);
        body.appendChild(row);
    }
    const foot = document.createElement('div');
    foot.className = 'sample-foot';
    foot.textContent = `실제로는 ${puzzle.batch.length}건이 흘러옵니다.`;
    const queue = document.createElement('div');
    queue.className = 'queue';
    queue.hidden = true;
    card.append(t, body, foot, queue);
    return { card, badge, body, foot, queue };
}

/** Sample card body: samples when idle, the live queue (now / next / after) while running. */
function renderQueue() {
    if (!inputCard) return;
    const running = state.phase === 'RUNNING' && state.activeItem >= 0;
    inputCard.body.hidden = running;
    inputCard.foot.hidden = running;
    inputCard.queue.hidden = !running;
    inputCard.badge.hidden = !running;
    if (!running) return;
    const items = state.items;
    const i = state.activeItem;
    inputCard.badge.textContent = `${i + 1}/${items.length}`;
    inputCard.queue.innerHTML = '';
    const labels = ['지금', '다음', '그다음'];
    for (let d = 0; d < 3 && i + d < items.length; d++) {
        const row = document.createElement('div');
        row.className = 'queue-item' + (d === 0 ? ' now' : '');
        const tag = document.createElement('span');
        tag.className = 'queue-tag';
        tag.textContent = labels[d];
        const txt = document.createElement('span');
        txt.className = 'queue-text';
        txt.textContent = items[i + d].input;
        row.append(tag, txt);
        inputCard.queue.appendChild(row);
    }
    const left = items.length - i - 3;
    if (left > 0) {
        const more = document.createElement('div');
        more.className = 'queue-more';
        more.textContent = `… ${left}장 더`;
        inputCard.queue.appendChild(more);
    }
}

function goalCard(puzzle) {
    const card = document.createElement('div');
    card.className = 'card io inspect';
    const t = document.createElement('div');
    t.className = 'card-title';
    t.innerHTML = `<span>검수함</span><span class="badge"></span>`;
    const badge = t.querySelector('.badge');
    const copy = document.createElement('button');
    copy.className = 'btn tiny copy';
    copy.textContent = '복사';
    copy.title = '릴레이 기록 복사';
    copy.addEventListener('click', copyTranscript);
    t.appendChild(copy);
    const rows = document.createElement('div');
    rows.className = 'inspect-rows';
    const foot = document.createElement('div');
    foot.className = 'inspect-foot';
    card.append(t, rows, foot);
    inspectCard = { card, badge, rows, foot, copy };
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

    inspectCard.badge.textContent = state.sandbox
        ? (started ? `정답 ${correct}/${total}` : `${total}건 시험`)
        : (started ? `정답 ${correct} / 합격선 ${PASS_COUNT}` : `합격선 ${PASS_COUNT}/${total}`);
    inspectCard.copy.hidden = !state.result;

    inspectCard.rows.innerHTML = '';
    items.forEach((it, i) => {
        const row = document.createElement('div');
        const cls = it.done ? (it.ok ? 'ok' : 'bad') : (running && i === state.activeItem ? 'active' : 'pending');
        row.className = `inspect-row ${cls}`;
        const n = document.createElement('span');
        n.className = 'n';
        n.textContent = String(i + 1);
        const out = document.createElement('span');
        out.className = 'out';
        out.textContent = it.done ? (it.final || '(빈 출력)') : (running && i === state.activeItem ? '…' : '');
        const mark = document.createElement('span');
        mark.className = 'mark';
        mark.textContent = it.done ? (it.ok ? '✓' : '✗') : '';
        row.append(n, out, mark);
        row.title = `입력: ${it.input}\n기대: ${it.target}` + (it.done ? `\n출력: ${it.final || '(빈 출력)'}${it.detail ? `\n${it.detail}` : ''}` : '');
        inspectCard.rows.appendChild(row);
    });

    renderLedger();
}

/** 손익계산서 at the bottom of the inspection card: quote before the run, statement after. */
function renderLedger() {
    const puzzle = state.puzzle;
    const total = puzzle.batch.length;
    const foot = inspectCard.foot;
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
        line('시험 라인', `${total}건 · ${MATCH_MODES.find(m => m.value === puzzle.match)?.label ?? puzzle.match}`);
        if (state.result) line('결과', `${state.result.tier.label} ${state.result.correct}/${total}`, state.result.tier.key);
        return;
    }
    const per = eco.payout(1, total, puzzle.revenue);
    const r = state.result;
    line('합격선', `${PASS_COUNT} / ${total}`);
    line('납품가', `${eco.formatWon(per)} × ${total}`);
    line('원재료', `-${eco.formatWon(puzzle.materialCost)}`, 'bad');
    if (r) {
        const profit = r.revenue - r.materialCost;
        line('매출', `${eco.formatWon(per)} × ${r.correct} = ${eco.formatWon(r.revenue)}`, r.revenue > 0 ? 'good' : '');
        line('손익', `${profit >= 0 ? '+' : ''}${eco.formatWon(profit)}`, `total ${profit >= 0 ? 'good' : 'bad'}`);
        line('판정', `${r.tier.label} ${starString(r.stars)}`, `total ${r.tier.key}`);
        line('현금', eco.formatWon(state.company.cash));
    }
}

function applyKnobsToCard(b, knobs, k) {
    b.limit = knobs.promptLimit;
    b.textarea.maxLength = knobs.promptLimit;
    b.textarea.placeholder = `침팬지 ${k + 1}에게 내릴 지시 (${knobs.promptLimit}자)`;
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
        showMessage('이 작업은 아직 잠겨 있습니다.', 'hint');
        return;
    }
    if (state.prompts.some(p => !p.trim())) {
        showMessage('모든 침팬지에게 지시를 내려야 합니다.', 'hint');
        const idx = state.prompts.findIndex(p => !p.trim());
        cards[idx]?.textarea.focus();
        return;
    }

    const knobs = currentKnobs();
    const materialCost = state.sandbox ? 0 : puzzle.materialCost;
    if (!state.sandbox && eco.needsLoan(state.company, materialCost)) {
        showLoanOffer(`원재료 값 ${eco.formatWon(materialCost)}이 없습니다.`);
        return;
    }

    const ctrl = new AbortController();
    state.runCtrl = ctrl;
    state.items = puzzle.batch.map(b => ({ input: b.input, target: b.target, note: b.note, outputs: [], final: null, score: 0, ok: false, done: false }));
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
                    input: carry,
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
                b.status.textContent = `오류: ${String(err?.message ?? err).slice(0, 80)}`;
                b.status.classList.add('error');
                b.card.classList.remove('active');
                b.card.classList.add('failed');
                break outer;
            }
            const cleaned = state.rawMode ? raw.trim() : postClean(raw);
            item.outputs[k] = cleaned;
            speechText(k, cleaned);
            if (!state.rawMode && cleaned !== raw.trim()) b.status.textContent = '잡담을 정리했습니다';
            carry = cleaned;

            scene.chimpState(k, 'idle');
            if (k < puzzle.chimps - 1 && i === 0) await wait(300);
            b.card.classList.remove('active');
            b.card.classList.add('done');
        }

        item.final = carry;
        const { score, detail } = scoreOutput(carry, item.target, puzzle.match);
        item.score = score;
        item.detail = detail;
        item.ok = score >= puzzle.itemThreshold;
        item.done = true;
        speechMark(puzzle.chimps - 1, item.ok ? 'ok' : 'bad');
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
        showMessage(`침팬지가 쓰러졌습니다. 원재료 ${eco.formatWon(materialCost)}은 이미 녹았습니다.`, 'hint');
        if (!state.sandbox) offerLoanIfNeeded();
        return;
    }
    finish(materialCost, aborted);
}

function markAborted(b) {
    b.status.textContent = '중단됨';
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
    if (correct === total) return { key: 'perfect', label: '전량 합격!', emoji: 'PERFECT' };
    if (eco.isPass(correct)) return { key: 'pass', label: '합격', emoji: 'PASS' };
    if (correct >= 3) return { key: 'close', label: '아깝다', emoji: 'CLOSE' };
    return { key: 'disaster', label: '대참사', emoji: 'FAIL' };
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
            el.levelStars.textContent = starString(state.company.passed[puzzle.id].stars);
        }
        saveCompany();
        leveledUp = eco.levelOf(state.company) > levelBefore;
        renderHud(revenue > 0 ? 1 : null);
        if (leveledUp) renderKnobs(true);
    }

    setPhase('RESULT');
    renderInspection();
    renderQueue();

    if (aborted) showMessage(`컨베이어를 멈췄습니다. ${state.items.filter(i => i.done).length}건까지의 결과만 남았습니다.`, 'hint');
    else if (leveledUp) showMessage('현장 숙련도가 올랐습니다. 지시서가 길어지고 집중력과 출력 용지가 늘어납니다.');

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
    const lines = [`🏭 컨베이어 위의 침팬지 — [${DEPARTMENTS[p.dept] ?? ''}] ${p.title}`];
    state.prompts.forEach((pr, i) => lines.push(`[침팬지 ${i + 1}] "${pr}"`));
    lines.push('');
    state.items.forEach((it, i) => {
        if (!it.done) return;
        lines.push(`${String(i + 1).padStart(2)} ${it.ok ? '✓' : '✗'} ${it.input.replace(/\n/g, ' | ')}`);
        lines.push(`     → ${it.outputs.map(o => (o ?? '').replace(/\n/g, ' | ')).join('  →  ')}`);
        if (!it.ok) lines.push(`     (기대: ${it.target})`);
    });
    if (state.result) {
        const r = state.result;
        lines.push('', `결과: ${r.tier.label} ${r.correct}/${r.total} (합격선 ${PASS_COUNT})`);
        if (!state.sandbox) lines.push(`손익: 매출 ${eco.formatWon(r.revenue)} − 원재료 ${eco.formatWon(r.materialCost)} = ${eco.formatWon(r.revenue - r.materialCost)}`);
    }
    lines.push(`숙련도 Lv.${eco.levelOf(state.company)} · 지시서 ${k.promptLimit}자 · 집중력 t=${k.temperature} · 출력 ${k.maxTokens ?? DEFAULT_MAX_TOKENS}토큰 · ${eco.MODEL_ID}`);
    return lines.join('\n');
}

function showFinalReport() {
    const s = state.company.stats;
    const net = eco.netProfit(state.company);
    const rate = s.items ? Math.round(s.correct / s.items * 100) : 0;
    showOverlay('📊', '연간 결산',
        `총매출 ${eco.formatWon(s.revenue)}\n원재료 ${eco.formatWon(s.material)}\n침팬지 임금 ₩0\n은행 대출 ${eco.formatWon(state.company.debt)}\n가동 ${s.runs}회 · 전표 ${s.items}장 중 ${s.correct}장 정답 (${rate}%)\n\n순이익 ${eco.formatWon(net)}\n\n${eco.verdict(net)}`,
        [{ label: '계속 굴리기', accent: true, onClick: hideOverlay }]);
}

// ---------- loans ----------
function offerLoanIfNeeded() {
    if (state.sandbox) return;
    if (eco.needsLoan(state.company, state.puzzle.materialCost)) {
        showLoanOffer('현금이 원재료 값에도 못 미칩니다.');
    }
}

function showLoanOffer(text) {
    showMessage(text + ' ', 'hint');
    const btn = document.createElement('button');
    btn.className = 'btn small loan';
    btn.textContent = `🏦 대출 ${eco.formatWon(eco.LOAN_AMOUNT)}`;
    btn.addEventListener('click', () => {
        state.company = eco.takeLoan(state.company);
        saveCompany();
        renderHud(1);
        renderInspection();
        showMessage('은행이 "AI 혁신 기업"이라며 기꺼이 빌려줬습니다. 부채가 늘었습니다.');
    });
    el.message.appendChild(btn);
}

function resetProgress() {
    if (!confirm('진행(현금, 부채, 통과 기록, 숙련도)을 모두 초기화할까요? 모델 캐시는 남습니다.')) return;
    state.company = { ...eco.newCompany(), introSeen: true };
    state.lastPrompts = {};
    remove('lastPrompts');
    saveCompany();
    save('levelIndex', 0);
    renderHud();
    selectPuzzle(0);
    showMessage('새 회계연도가 시작됐습니다.');
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
    if (text && kind !== 'hint') messageTimer = setTimeout(() => { el.message.textContent = ''; }, 3500);
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
        const ok = p.hint ? confirm('힌트를 넘어 예시 지시서를 볼까요? (별은 그대로 받을 수 있습니다)') : true;
        if (ok) {
            showMessage('예시 지시서: ' + p.sampleSolution.map((s, i) => `[${i + 1}] ${s}`).join('  '), 'hint');
            return;
        }
    }
    showMessage(p.hint ? `힌트: ${p.hint}` : '이 작업에는 힌트가 없습니다.', 'hint');
}

let promptSaveTimer = null;
function schedulePromptSave() {
    clearTimeout(promptSaveTimer);
    promptSaveTimer = setTimeout(() => {
        state.lastPrompts[state.puzzle.id] = [...state.prompts];
        save('lastPrompts', state.lastPrompts);
    }, 300);
}

async function copyTranscript() {
    const text = buildTranscript();
    try {
        await navigator.clipboard.writeText(text);
        showMessage('릴레이 기록을 복사했습니다.');
    } catch {
        window.prompt('클립보드 접근이 막혔습니다. 아래 기록을 직접 복사하세요.', text);
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
    selectPuzzle, selectSandbox,
};
