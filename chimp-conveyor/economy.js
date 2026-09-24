// economy.js — deliberately simple, 악덕업주 edition. No DOM.
// Chimps are not paid. Each run burns 원재료 (material). Every correct item pays revenue/BATCH_SIZE.
// Running out of cash offers a bank loan; debt shows up in the final report.

import { PROGRESSION, WORK_ORDERS, BATCH_SIZE, PASS_COUNT } from './puzzles.js';

import { tr, lang } from './i18n.js';

export const MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';   // the one and only chimp
export const STARTING_CASH = 3000;       // "사장이 소액 현금통에서 꺼내 준 돈"
export const LOAN_AMOUNT = 5000;
export { BATCH_SIZE, PASS_COUNT };

export function newCompany() {
    return {
        cash: STARTING_CASH,
        debt: 0,
        passed: {},           // { [workOrderId]: { stars, bestCorrect } }
        stats: { revenue: 0, material: 0, runs: 0, items: 0, correct: 0 },
        introSeen: false,
        reportSeen: false,
    };
}

/** Number of campaign work orders passed = the player's level. */
export function levelOf(company) {
    return WORK_ORDERS.filter(w => company.passed[w.id]).length;
}

/** Knobs in effect at a given level. Clamped to the table. */
export function progressionFor(level) {
    const i = Math.max(0, Math.min(PROGRESSION.length - 1, level));
    return { ...PROGRESSION[i] };
}

/** Revenue for a run: paid per correct item. */
export function payout(correct, total, revenue) {
    if (!total) return 0;
    return Math.round(revenue * correct / total);
}

export function isPass(correct) {
    return correct >= PASS_COUNT;
}

export function needsLoan(company, materialCost) {
    return company.cash < materialCost;
}

export function takeLoan(company) {
    return { ...company, cash: company.cash + LOAN_AMOUNT, debt: company.debt + LOAN_AMOUNT };
}

export function chargeMaterial(company, materialCost) {
    return {
        ...company,
        cash: company.cash - materialCost,
        stats: { ...company.stats, material: company.stats.material + materialCost, runs: company.stats.runs + 1 },
    };
}

export function addRevenue(company, revenue, { items = 0, correct = 0 } = {}) {
    return {
        ...company,
        cash: company.cash + revenue,
        stats: {
            ...company.stats,
            revenue: company.stats.revenue + revenue,
            items: company.stats.items + items,
            correct: company.stats.correct + correct,
        },
    };
}

/** Net result for the final report: what's left after paying back the bank and the boss's float. */
export function netProfit(company) {
    return company.cash - company.debt - STARTING_CASH;
}

export function verdict(net) {
    if (net >= 30000) return tr('사장: "봤지? 침팬지가 답이었어. 다음 분기엔 나도 침팬지로 교체할 거야." (교체 안 함)', 'Boss: "See? Chimps were the answer. Next quarter I\'ll replace myself with one too." (He won\'t.)');
    if (net >= 0) return tr('흑자. 원재료 값 겨우 뽑았습니다. 사장은 이걸 사보에 \'혁신\'이라고 실었습니다.', 'In the black, barely covering materials. The company newsletter calls it "innovation".');
    if (net >= -30000) return tr('적자. 사장: "침팬지 탓이야." 침팬지: "..." 침팬지는 여전히 무급입니다.', 'In the red. Boss: "The chimps\' fault." Chimps: "..." The chimps remain unpaid.');
    return tr('은행이 공장을 가져갔습니다. 침팬지들은 은행에 재취업했습니다. 사장은 아직 이력서를 쓰고 있습니다.', 'The bank took the factory. The chimps now work at the bank. The boss is still writing his résumé.');
}

export function formatWon(n) {
    const sign = n < 0 ? '-' : '';
    return `${sign}₩${Math.abs(Math.round(n)).toLocaleString(lang() === 'ko' ? 'ko-KR' : 'en-US')}`;
}
