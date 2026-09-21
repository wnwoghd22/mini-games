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
    levelIndex: $('level-index'), levelTitle: $('level-title'), levelStars: $('level-stars'), levelRevenue: $('level-revenue'),
    brief: $('brief'), flavor: $('flavor'), knobs: $('knobs'),
    sandboxPanel: $('sandbox-panel'), sbBatch: $('sb-batch'), sbChimps: $('sb-chimps'), sbMatch: $('sb-match'), btnSbApply: $('btn-sb-apply'),
    conveyor: $('conveyor'),
    btnRun: $('btn-run'), runCost: $('run-cost'), btnRerun: $('btn-rerun'), btnClear: $('btn-clear'),
    message: $('message-area'),
    resultPanel: $('result-panel'), resultEmoji: $('result-emoji'), resultLabel: $('result-label'),
    resultStars: $('result-stars'), resultScore: $('result-score'), meter: $('meter'), sceneCanvas: $('scene'),
    resultDetail: $('result-detail'), ledger: $('ledger'), batchTable: $('batch-table'), transcript: $('transcript'),
    btnCopy: $('btn-copy'), btnNextLevel: $('btn-next-level'),
    overlay: $('overlay'), overlayEmoji: $('overlay-emoji'), overlayTitle: $('overlay-title'),
    overlayText: $('overlay-text'), overlayActions: $('overlay-actions'),
};

let cards = [];
let inputCard = null;     // { card, badge, body }
let messageTimer = null;

const delay = ms => new Promise(r => setTimeout(r, ms));
const wait = ms => (state.skipAnim ? Promise.resolve() : delay(ms));

// ---------- boot ----------
boot();

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
    el.btnRun.textContent = running ? '■ 정지' : '▶ 가동';
    el.btnRun.classList.toggle('stop', running);
    el.btnRerun.hidden = !(phase === 'RESULT');
    updateNavButtons();
    el.btnSandbox.disabled = running;
    el.btnClear.disabled = running;
    el.btnSbApply.disabled = running;
    el.btnResetProgress.disabled = running;
    el.conveyor.classList.toggle('running', running);
    for (const c of cards) c.textarea.disabled = running;
    renderRunCost();
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
    renderRunCost();
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

function renderRunCost() {
    if (!state.puzzle) return;
    const n = state.puzzle.batch.length;
    if (state.sandbox) {
        el.runCost.innerHTML = `<span class="cost">원재료 무료 (시험 라인)</span> · ${n}건`;
        return;
    }
    const per = eco.payout(1, n, state.puzzle.revenue);
    el.runCost.innerHTML = `원재료 <span class="cost">-${eco.formatWon(state.puzzle.materialCost)}</span> · 납품가 <span class="rev">${eco.formatWon(per)}/건</span> · ${n}건 중 ${PASS_COUNT}건 합격`;
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
    el.levelRevenue.textContent = state.sandbox ? '' : `납품가 ${eco.formatWon(puzzle.revenue)} / ${puzzle.batch.length}건`;
    el.brief.textContent = puzzle.brief ?? '';
    el.flavor.textContent = locked ? '이전 작업을 통과하면 해금됩니다.' : (puzzle.flavor ?? '');
    el.btnHint.hidden = !puzzle.hint && !puzzle.sampleSolution;
    updateNavButtons();
    el.resultPanel.hidden = true;
    showMessage('');
    buildConveyor(puzzle, locked);
    if (state.phase === 'RESULT') setPhase('IDLE');
    renderRunCost();
}

// ---------- conveyor DOM ----------
function buildConveyor(puzzle, locked = false) {
    el.conveyor.innerHTML = '';
    cards = [];
    const knobs = currentKnobs();

    inputCard = samplesCard(puzzle);
    el.conveyor.appendChild(inputCard.card);
    scene.setStations(puzzle.chimps);
    scene.reset();

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

        const bubble = document.createElement('div');
        bubble.className = 'bubble';

        const status = document.createElement('div');
        status.className = 'status';

        card.append(title, textarea, counter, bubble, status);
        el.conveyor.appendChild(card);

        const bundle = { card, textarea, counter, bubble, status, limit: knobs.promptLimit };
        cards.push(bundle);
        applyKnobsToCard(bundle, knobs, k);

        textarea.addEventListener('input', () => {
            state.prompts[k] = textarea.value;
            updateCounter(bundle);
            schedulePromptSave();
        });
    }

    el.conveyor.appendChild(goalCard(puzzle));
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
    const current = document.createElement('div');
    current.className = 'io-text current-item';
    current.hidden = true;
    card.append(t, body, foot, current);
    return { card, badge, body, foot, current };
}

function goalCard(puzzle) {
    const card = document.createElement('div');
    card.className = 'card io';
    const t = document.createElement('div');
    t.className = 'card-title';
    t.textContent = '합격선';
    const body = document.createElement('div');
    body.className = 'io-text goal';
    body.textContent = state.sandbox
        ? `${puzzle.batch.length}건 시험. 채점: ${MATCH_MODES.find(m => m.value === puzzle.match)?.label ?? puzzle.match}`
        : `${puzzle.batch.length}건 중 ${PASS_COUNT}건 이상 정답`;
    card.append(t, body);
    return card;
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
    for (const c of cards) {
        c.card.classList.remove('active', 'done', 'failed');
        c.bubble.textContent = '';
        c.bubble.classList.remove('streaming');
        c.status.textContent = '';
        c.status.className = 'status';
    }
    if (inputCard) {
        inputCard.badge.hidden = true;
        inputCard.current.hidden = true;
        inputCard.body.hidden = false;
        inputCard.foot.hidden = false;
    }
}

function showCurrentItem(i, item) {
    inputCard.badge.hidden = false;
    inputCard.badge.textContent = `${i + 1}/${state.puzzle.batch.length}`;
    inputCard.body.hidden = true;
    inputCard.foot.hidden = true;
    inputCard.current.hidden = false;
    inputCard.current.textContent = item.input;
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
    renderResult({ live: true });

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
        showCurrentItem(i, item);
        for (const c of cards) { c.card.classList.remove('done'); c.bubble.textContent = ''; c.status.textContent = ''; c.status.className = 'status'; }
        scene.allChimps('idle');
        scene.hideParcel();
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
            const context = {};
            if (knobs.memoryLevel >= 1 && k > 0) context.originalInput = item.input;

            let raw = '';
            try {
                b.bubble.classList.add('streaming');
                raw = await llm.generate({
                    prompt: state.prompts[k],
                    input: carry,
                    context,
                    signal: ctrl.signal,
                    maxTokens: knobs.maxTokens ?? DEFAULT_MAX_TOKENS,
                    temperature: knobs.temperature,
                    onToken: (text) => {
                        scene.chimpState(k, 'write');
                        b.bubble.textContent = text;
                    },
                });
            } catch (err) {
                b.bubble.classList.remove('streaming');
                if (err?.name === 'AbortError') { aborted = true; markAborted(b); break outer; }
                console.error(err);
                failed = true;
                scene.chimpState(k, 'dead');
                b.status.textContent = `오류: ${String(err?.message ?? err).slice(0, 80)}`;
                b.status.classList.add('error');
                b.card.classList.remove('active');
                b.card.classList.add('failed');
                break outer;
            }
            b.bubble.classList.remove('streaming');

            const cleaned = state.rawMode ? raw.trim() : postClean(raw);
            item.outputs[k] = cleaned;
            b.bubble.textContent = cleaned || '(빈 출력)';
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
        await scene.parcelTo(puzzle.chimps);
        scene.chimpState(puzzle.chimps - 1, item.ok ? 'happy' : 'sad');
        scene.itemProgress(i + 1, state.items.length, state.items.filter(it => it.ok).length);
        renderResult({ live: true });
        await wait(250);
        scene.hideParcel();
    }

    state.runCtrl = null;
    scene.stop();

    if (failed) {
        setPhase('IDLE');
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

    renderResult({ live: false, leveledUp });
    setPhase('RESULT');

    if (aborted) showMessage(`컨베이어를 멈췄습니다. ${state.items.filter(i => i.done).length}건까지의 결과만 남았습니다.`, 'hint');

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

function renderResult({ live, leveledUp = false }) {
    const puzzle = state.puzzle;
    const total = state.items.length;
    const doneCount = state.items.filter(i => i.done).length;
    const correct = state.items.filter(i => i.ok).length;

    // batch table (always)
    el.batchTable.innerHTML = '';
    state.items.forEach((it, i) => {
        const row = document.createElement('div');
        row.className = 'batch-row ' + (it.done ? (it.ok ? 'ok' : 'bad') : (i === state.activeItem ? 'active' : 'pending'));
        row.innerHTML = `<span class="n">${i + 1}</span><span class="in"></span><span class="out"></span><span class="mark"></span>`;
        row.querySelector('.in').textContent = it.input;
        row.querySelector('.out').textContent = it.done ? (it.final || '(빈 출력)') : (i === state.activeItem ? '…' : '');
        row.querySelector('.mark').textContent = it.done ? (it.ok ? '✓' : '✗') : '';
        if (it.done && !it.ok && it.detail) row.title = it.detail;
        el.batchTable.appendChild(row);
    });

    renderMeter();
    if (live) {
        el.resultEmoji.textContent = 'RUNNING';
        el.resultLabel.textContent = `가동 중 ${doneCount}/${total}`;
        el.resultLabel.className = 'result-label';
        el.resultStars.textContent = '';
        el.resultScore.textContent = `정답 ${correct}건`;
        el.resultDetail.textContent = state.sandbox ? '' : `합격선 ${PASS_COUNT}건`;
        el.ledger.hidden = true;
        el.transcript.textContent = '';
        el.btnNextLevel.hidden = true;
        el.resultPanel.hidden = false;
        return;
    }

    const r = state.result;
    el.resultEmoji.textContent = r.tier.emoji;
    el.resultLabel.textContent = r.tier.label;
    el.resultLabel.className = `result-label ${r.tier.key}`;
    el.resultStars.textContent = state.sandbox ? '' : starString(r.stars);
    el.resultScore.textContent = `${r.correct}/${r.total} 정답 · 합격선 ${PASS_COUNT}`;
    const wrong = state.items.filter(i => i.done && !i.ok).length;
    el.resultDetail.textContent = (wrong ? `틀린 전표 ${wrong}건. 표에서 ✗를 눌러 보면 무엇이 나갔는지 보입니다.` : '열 장 전부 정확합니다. 사장은 이게 당연한 줄 압니다.')
        + (leveledUp ? ' · 현장 숙련도가 올랐습니다. 지시서가 길어지고 집중력과 출력 용지가 조금 늘어납니다.' : '');

    if (state.sandbox) {
        el.ledger.hidden = true;
    } else {
        const profit = r.revenue - r.materialCost;
        el.ledger.hidden = false;
        el.ledger.innerHTML = `
            <span class="k">매출 (${r.correct}건 × ${eco.formatWon(eco.payout(1, r.total, puzzle.revenue))})</span><span class="v ${r.revenue > 0 ? 'good' : ''}">${eco.formatWon(r.revenue)}</span>
            <span class="k">원재료</span><span class="v bad">-${eco.formatWon(r.materialCost)}</span>
            <span class="k">침팬지 임금</span><span class="v">₩0 (바나나는 사장 개인 비용)</span>
            <span class="k total">이번 작업 손익</span><span class="v total ${profit >= 0 ? 'good' : 'bad'}">${eco.formatWon(profit)}</span>
            <span class="k">현금</span><span class="v">${eco.formatWon(state.company.cash)}</span>`;
    }

    el.transcript.textContent = buildTranscript();
    const passed = r.tier.key === 'pass' || r.tier.key === 'perfect';
    el.btnNextLevel.hidden = state.sandbox || !passed || state.levelIndex >= WORK_ORDERS.length - 1;
    el.resultPanel.hidden = false;
}

function renderMeter() {
    el.meter.innerHTML = '';
    state.items.forEach((it, i) => {
        const s = document.createElement('span');
        if (it.done) s.className = it.ok ? 'ok' : 'bad';
        else if (i === state.activeItem && state.phase === 'RUNNING') s.className = 'live';
        el.meter.appendChild(s);
    });
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
        const range = document.createRange();
        range.selectNodeContents(el.transcript);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        showMessage('자동 복사에 실패했습니다. 기록을 선택했으니 Ctrl+C로 복사하세요.', 'hint');
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
    el.btnRerun.addEventListener('click', () => { if (state.phase === 'RESULT') runChain(); });
    el.btnClear.addEventListener('click', () => {
        state.prompts = state.prompts.map(() => '');
        for (const c of cards) { c.textarea.value = ''; updateCounter(c); }
        resetCards();
        el.resultPanel.hidden = true;
        state.result = null;
        state.items = [];
        schedulePromptSave();
        if (state.phase === 'RESULT') setPhase('IDLE');
    });
    el.btnPrev.addEventListener('click', () => selectPuzzle(state.sandbox ? state.levelIndex : state.levelIndex - 1));
    el.btnNext.addEventListener('click', () => selectPuzzle(state.sandbox ? state.levelIndex : state.levelIndex + 1));
    el.btnNextLevel.addEventListener('click', () => selectPuzzle(state.levelIndex + 1));
    el.btnSandbox.addEventListener('click', () => { if (state.sandbox) selectPuzzle(state.levelIndex); else selectSandbox(); });
    el.btnSbApply.addEventListener('click', applySandboxForm);
    el.btnHint.addEventListener('click', showHint);
    el.btnCopy.addEventListener('click', copyTranscript);
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
