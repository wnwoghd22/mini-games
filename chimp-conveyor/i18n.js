// i18n.js — two languages, one place. English is the default; Korean when the browser says so or
// the player toggles. Model-facing text (prompts, tickets, the action vocabulary) is always English.
//
//   lang()           → 'en' | 'ko'
//   setLang(l)       → persists and reloads
//   L(x)             → x is { ko, en } (or an array/string): pick the current language
//   tr(ko, en)       → inline pair
//   t(key, ...args)  → UI dictionary lookup; entries may be functions of the args
import { load, save } from './storage.js';

let current = load('lang', null) ?? 'en';   // English by default; the menu toggle stores the choice

export function lang() { return current; }
export function setLang(l) {
    current = l === 'ko' ? 'ko' : 'en';
    save('lang', current);
}
export function L(x) {
    if (x && typeof x === 'object' && !Array.isArray(x) && ('en' in x || 'ko' in x)) return x[current] ?? x.en ?? x.ko;
    return x;
}
export const tr = (ko, en) => (current === 'ko' ? ko : en);

const UI = {
    // header / static
    title: { ko: '컨베이어 위의 침팬지', en: 'Chimps on the Conveyor' },
    hudCash: { ko: '현금', en: 'Cash' }, hudDebt: { ko: '은행 대출', en: 'Bank loan' },
    hudLevel: { ko: '통과한 작업 수에 따라 자동으로 오릅니다', en: 'Rises automatically with the number of work orders you pass' },
    loading: { ko: '준비 중…', en: 'Getting ready…' },
    skipAnim: { ko: '애니 생략', en: 'Skip animation' },
    rawMode: { ko: '날것 모드', en: 'Raw mode' },
    rawModeTip: { ko: '침팬지 잡담을 정리하지 않고 그대로 다음 침팬지에게 넘깁니다', en: 'Pass chimp chatter along untrimmed' },
    sandbox: { ko: '샌드박스', en: 'Sandbox' }, hint: { ko: '힌트', en: 'Hint' }, reset: { ko: '진행 초기화', en: 'Reset progress' },
    resetTip: { ko: '진행 초기화', en: 'Reset progress' },
    sbBatchLabel: { ko: '배치 (한 줄에 한 건, "입력 => 목표", 최대 10건. 입력 안의 줄바꿈은 \\n으로)', en: 'Batch (one item per line, "input => target", up to 10; use \\n for line breaks inside an input)' },
    sbChimps: { ko: '침팬지 수', en: 'Chimps' }, sbMatch: { ko: '채점', en: 'Scoring' }, sbApply: { ko: '적용', en: 'Apply' },
    btnPrev: { ko: '◀ 이전', en: '◀ Prev' }, btnNext: { ko: '다음 ▶', en: 'Next ▶' }, btnPrevTip: { ko: '이전 작업', en: 'Previous work order' }, btnNextTip: { ko: '다음 작업', en: 'Next work order' },
    btnClear: { ko: '지시 지우기', en: 'Clear' },
    run: { ko: '▶ 가동', en: '▶ Run' }, runAgain: { ko: '▶ 다시 가동', en: '▶ Run again' }, stop: { ko: '■ 정지', en: '■ Stop' },
    // boot / model
    noWebgpuTitle: { ko: 'WebGPU가 없습니다', en: 'No WebGPU' },
    noWebgpuText: { ko: '이 게임은 브라우저 안에서 소형 LLM을 직접 돌립니다.\n최신 Chrome 또는 Edge(데스크톱)에서 열어 주세요.\nFirefox/Safari는 아직 지원이 불안정합니다.', en: 'This game runs a small LLM inside your browser.\nPlease open it in a recent desktop Chrome or Edge.\nFirefox/Safari support is still shaky.' },
    noWebgpuStatus: { ko: 'WebGPU 미지원', en: 'WebGPU unavailable' },
    noModelTitle: { ko: '침팬지 모델을 찾을 수 없습니다', en: 'Chimp model not found' },
    noModelText: { ko: id => `WebLLM 목록에 ${id}가 없습니다. 라이브러리 버전을 확인해 주세요.`, en: id => `${id} is not in the WebLLM model list. Check the library version.` },
    companyName: { ko: '침팬지 컨베이어 주식회사', en: 'Chimp Conveyor Inc.' },
    clockIn: { ko: '출근하기', en: 'Clock in' },
    clockingIn: { ko: '침팬지 출근 중…', en: 'Chimps clocking in…' },
    chimpsReady: { ko: '침팬지 대기 중', en: 'Chimps ready' },
    clockInFailed: { ko: '출근 실패', en: 'Failed to clock in' },
    modelFailTitle: { ko: '침팬지가 출근하다 넘어졌습니다', en: 'The chimps tripped on the way in' },
    modelFailText: { ko: msg => `모델을 불러오지 못했습니다.\n${msg}\n\n네트워크 상태나 GPU 메모리를 확인해 주세요.`, en: msg => `Could not load the model.\n${msg}\n\nCheck your network and GPU memory.` },
    retry: { ko: '다시 시도', en: 'Retry' },
    // knobs
    knobPrompt: { ko: n => `지시서 ${n}자`, en: n => `Instruction ${n} chars` },
    knobFocus: { ko: n => `집중력 ${n}`, en: n => `Focus ${n}` },
    knobTokens: { ko: n => `출력 용지 ${n}토큰`, en: n => `Paper ${n} tokens` },
    // sandbox
    sbFormat: { ko: '한 줄에 한 건, "입력 => 목표" 형식으로 적어 주세요.', en: 'One item per line, in the form "input => target".' },
    sbApplied: { ko: (n, st) => `샌드박스 배치 ${n}건을 적용했습니다.${st ? ` 역: ${st}` : ''}`, en: (n, st) => `Applied a sandbox batch of ${n}.${st ? ` Station: ${st}` : ''}` },
    testLine: { ko: '시험 라인', en: 'Test line' },
    levelIndex: { ko: (i, n) => `작업 ${i}/${n}`, en: (i, n) => `Order ${i}/${n}` },
    lockedFlavor: { ko: '이전 작업을 통과하면 해금됩니다.', en: 'Pass the previous work order to unlock.' },
    chimp: { ko: n => `침팬지 ${n}`, en: n => `Chimp ${n}` },
    roleWorker: { ko: ' · 작업', en: ' · works' }, roleClerk: { ko: ' · 서기', en: ' · clerk' },
    worker: { ko: '작업', en: 'works' }, clerk: { ko: '서기', en: 'clerk' },
    emptyOutput: { ko: '(빈 출력)', en: '(empty output)' },
    samplesTitle: { ko: '전표', en: 'Tickets' },
    ticketNote: { ko: '전표는 램프에 달려 함께 흐릅니다. 공정마다 같은 전표를 읽고 자기 일만 합니다.\n', en: 'The ticket travels clipped to the lamp. Every station reads the same ticket and does only its own job.\n' },
    machineNote: { ko: (l, v, a) => `기계: ${l} · 듣는 말: ${v} · ${a}\n`, en: (l, v, a) => `Machine: ${l} · hears: ${v} · ${a}\n` },
    batchNote: { ko: n => `× ${n}장`, en: n => `× ${n} tickets` },
    queueLabels: { ko: ['지금', '다음', '그다음'], en: ['now', 'next', 'then'] },
    queueMore: { ko: n => `… ${n}장 더`, en: n => `… ${n} more` },
    workTitle: { ko: '재공품', en: 'Workpiece' },
    lampName: { ko: '벽걸이 램프', en: 'Wall lamp' },
    exampleDone: { ko: '완성 예시 (전표 1)', en: 'Finished example (ticket 1)' },
    inspectTitle: { ko: '검수함', en: 'Inspection' },
    copy: { ko: '가동 기록 복사', en: 'Copy run log' }, copyTip: { ko: '릴레이 기록 복사', en: 'Copy the run log' },
    badgeSandbox: { ko: (c, t, started) => (started ? `${c}/${t}` : `${t}건`), en: (c, t, started) => (started ? `${c}/${t}` : `${t} items`) },
    badgePass: { ko: (c, p, t, started) => (started ? `${c}/${t} · ≥${p}` : `≥${p}/${t}`), en: (c, p, t, started) => (started ? `${c}/${t} · ≥${p}` : `≥${p}/${t}`) },
    tipInput: { ko: '입력', en: 'input' }, tipExpect: { ko: '기대', en: 'expected' }, tipOutput: { ko: '출력', en: 'output' },
    // ledger
    ledgerTest: { ko: '시험 라인', en: 'Test line' }, ledgerItems: { ko: (n, m) => `${n}건 · ${m}`, en: (n, m) => `${n} items · ${m}` },
    ledgerResult: { ko: '결과', en: 'Result' }, ledgerHits: { ko: '공정 적중', en: 'Station hits' },
    ledgerPass: { ko: '합격선', en: 'Pass line' }, ledgerPrice: { ko: '납품가', en: 'Unit price' }, ledgerMaterial: { ko: '원재료', en: 'Materials' },
    ledgerRevenue: { ko: '매출', en: 'Revenue' }, ledgerProfit: { ko: '손익', en: 'Profit' }, ledgerVerdict: { ko: '판정', en: 'Verdict' }, ledgerCash: { ko: '현금', en: 'Cash' },
    placeholder: { ko: (k, n) => `침팬지 ${k}에게 내릴 지시 (${n}자)`, en: (k, n) => `Instruction for chimp ${k} (${n} chars)` },
    // run
    locked: { ko: '이 작업은 아직 잠겨 있습니다.', en: 'This work order is still locked.' },
    needAll: { ko: '모든 침팬지에게 지시를 내려야 합니다.', en: 'Every chimp needs an instruction.' },
    noMaterialMoney: { ko: w => `원재료 값 ${w}이 없습니다.`, en: w => `You cannot afford ${w} of materials.` },
    ticketN: { ko: (i, n) => `전표 ${i}/${n}`, en: (i, n) => `Ticket ${i}/${n}` },
    error: { ko: m => `오류: ${m}`, en: m => `Error: ${m}` },
    trimmed: { ko: '잡담을 정리했습니다', en: 'Trimmed the chatter' },
    aborted: { ko: '중단됨', en: 'Stopped' },
    chimpDown: { ko: w => `침팬지가 쓰러졌습니다. 원재료 ${w}은 이미 녹았습니다.`, en: w => `A chimp collapsed. The ${w} of materials are already gone.` },
    tierPerfect: { ko: '전량 합격!', en: 'Perfect batch!' }, tierPass: { ko: '합격', en: 'Pass' }, tierClose: { ko: '아깝다', en: 'So close' }, tierDisaster: { ko: '대참사', en: 'Disaster' },
    stopped: { ko: n => `컨베이어를 멈췄습니다. ${n}건까지의 결과만 남았습니다.`, en: n => `Conveyor stopped. Only the first ${n} tickets count.` },
    leveledUp: { ko: '현장 숙련도가 올랐습니다. 지시서가 길어지고 집중력과 출력 용지가 늘어납니다.', en: 'Floor skill went up: longer instructions, more focus, more output paper.' },
    // transcript / report
    transcriptHead: { ko: (dept, title) => `🏭 컨베이어 위의 침팬지 — [${dept}] ${title}`, en: (dept, title) => `🏭 Chimps on the Conveyor — [${dept}] ${title}` },
    transcriptChimp: { ko: (i, p) => `[침팬지 ${i}] "${p}"`, en: (i, p) => `[Chimp ${i}] "${p}"` },
    transcriptVerdict: { ko: (f, exp) => `     판정: ${f}${exp ? ` (기대: ${exp})` : ''}`, en: (f, exp) => `     verdict: ${f}${exp ? ` (expected: ${exp})` : ''}` },
    transcriptExpected: { ko: e => `     (기대: ${e})`, en: e => `     (expected: ${e})` },
    transcriptResult: { ko: (l, c, t, p) => `결과: ${l} ${c}/${t} (합격선 ${p})`, en: (l, c, t, p) => `Result: ${l} ${c}/${t} (pass at ${p})` },
    transcriptProfit: { ko: (r, m, p) => `손익: 매출 ${r} − 원재료 ${m} = ${p}`, en: (r, m, p) => `Profit: revenue ${r} − materials ${m} = ${p}` },
    transcriptKnobs: { ko: (lv, pl, t, tk, id) => `숙련도 Lv.${lv} · 지시서 ${pl}자 · 집중력 t=${t} · 출력 ${tk}토큰 · ${id}`, en: (lv, pl, t, tk, id) => `Skill Lv.${lv} · instruction ${pl} chars · focus t=${t} · output ${tk} tokens · ${id}` },
    reportTitle: { ko: '연간 결산', en: 'Annual report' },
    reportBody: { ko: (s, debt, rate, net, verdict) => `총매출 ${s.rev}\n원재료 ${s.mat}\n침팬지 임금 ₩0\n은행 대출 ${debt}\n가동 ${s.runs}회 · 전표 ${s.items}장 중 ${s.correct}장 정답 (${rate}%)\n\n순이익 ${net}\n\n${verdict}`, en: (s, debt, rate, net, verdict) => `Total revenue ${s.rev}\nMaterials ${s.mat}\nChimp wages ₩0\nBank loan ${debt}\n${s.runs} runs · ${s.correct} of ${s.items} tickets correct (${rate}%)\n\nNet profit ${net}\n\n${verdict}` },
    keepRolling: { ko: '계속 굴리기', en: 'Keep rolling' },
    loanNeeded: { ko: '현금이 원재료 값에도 못 미칩니다.', en: 'Cash does not even cover materials.' },
    loanButton: { ko: w => `🏦 대출 ${w}`, en: w => `🏦 Borrow ${w}` },
    loanTaken: { ko: '은행이 "AI 혁신 기업"이라며 기꺼이 빌려줬습니다. 부채가 늘었습니다.', en: 'The bank happily lent to an "AI innovation company". Your debt grew.' },
    resetConfirm: { ko: '진행(현금, 부채, 통과 기록, 숙련도)을 모두 초기화할까요? 모델 캐시는 남습니다.', en: 'Reset all progress (cash, debt, passes, skill)? The model cache stays.' },
    newYear: { ko: '새 회계연도가 시작됐습니다.', en: 'A new fiscal year begins.' },
    hintConfirm: { ko: '힌트를 넘어 예시 지시서를 볼까요? (별은 그대로 받을 수 있습니다)', en: 'Skip the hint and see the example instructions? (Stars are unaffected.)' },
    hintExample: { ko: '예시 지시서: ', en: 'Example instructions: ' },
    hintPrefix: { ko: h => `힌트: ${h}`, en: h => `Hint: ${h}` },
    noHint: { ko: '이 작업에는 힌트가 없습니다.', en: 'No hint for this work order.' },
    copied: { ko: '릴레이 기록을 복사했습니다.', en: 'Run log copied.' },
    copyBlocked: { ko: '클립보드 접근이 막혔습니다. 아래 기록을 직접 복사하세요.', en: 'Clipboard access is blocked. Copy the log below by hand.' },
    langToggle: { ko: 'EN', en: 'KO' },
    menu: { ko: '메뉴', en: 'Menu' }, settings: { ko: '설정', en: 'Settings' }, home: { ko: '← 허브', en: '← Hub' },
    resetProgress: { ko: '진행 초기화', en: 'Reset progress' },
};

export function t(key, ...args) {
    const e = UI[key];
    if (!e) return key;
    const v = e[current] ?? e.en;
    return typeof v === 'function' ? v(...args) : v;
}
