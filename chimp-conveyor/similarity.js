// similarity.js — pure scoring functions for Chimp Conveyor.
// No DOM, no side effects. Imported by app.js and test.html.

/** Strip ``` fences (with optional language tag) and return the inner text. */
export function stripFences(text) {
    let t = String(text ?? '').trim();
    const fence = t.match(/^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?```$/);
    if (fence) t = fence[1].trim();
    return t;
}

/** Remove one layer of surrounding quotes/backticks if they wrap the whole string. */
export function stripWrappingQuotes(text) {
    let t = String(text ?? '').trim();
    const pairs = [['"', '"'], ["'", "'"], ['`', '`'], ['“', '”'], ['‘', '’'], ['「', '」'], ['『', '』']];
    for (const [o, c] of pairs) {
        if (t.length >= 2 && t.startsWith(o) && t.endsWith(c)) {
            t = t.slice(o.length, t.length - c.length).trim();
            break;
        }
    }
    return t;
}

/**
 * Normalize for comparison: fences/quotes stripped, lowercase, whitespace collapsed,
 * trailing sentence punctuation removed.
 */
export function normalize(text) {
    let t = stripFences(text);
    t = stripWrappingQuotes(t);
    t = t.toLowerCase();
    t = t.replace(/\s+/g, ' ').trim();
    t = t.replace(/\[\s+/g, '[').replace(/\s+\]/g, ']');
    t = t.replace(/[.。!！?？…]+$/g, '').trim();
    return t;
}

/** Case-preserving normalization (for exact matches where case matters). */
export function normalizeKeepCase(text) {
    let t = stripFences(text);
    t = stripWrappingQuotes(t);
    t = t.replace(/\s+/g, ' ').trim();
    t = t.replace(/\[\s+/g, '[').replace(/\s+\]/g, ']');
    return t;
}

export function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array(b.length + 1);
    let cur = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        cur[0] = i;
        const ca = a.charCodeAt(i - 1);
        for (let j = 1; j <= b.length; j++) {
            const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, cur] = [cur, prev];
    }
    return prev[b.length];
}

export function stringSimilarity(a, b) {
    const max = Math.max(a.length, b.length);
    if (max === 0) return 1;
    return 1 - levenshtein(a, b) / max;
}

export function tokens(text) {
    return normalize(text).split(/[\s,、，;；/|]+/).filter(Boolean);
}

export function jaccard(setA, setB) {
    const A = new Set(setA), B = new Set(setB);
    if (A.size === 0 && B.size === 0) return 1;
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return inter / (A.size + B.size - inter);
}

/** Split a list-like output into normalized items (comma / newline / bullet separated). */
export function listItems(text) {
    const t = stripFences(text);
    return t
        .split(/[\n,、，;；]+/)
        .map(s => s.replace(/^[\s\-*•\d.)]+/, '').trim())
        .map(s => normalize(s))
        .filter(Boolean);
}

/** Parse the first number in the text (supports negatives, decimals, thousands separators). */
export function firstNumber(text) {
    const t = stripFences(text).replace(/,(?=\d{3}\b)/g, '');
    const m = t.match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
}

/** Try to parse JSON from possibly-noisy output; returns undefined when it fails. */
export function tryParseJson(text) {
    let t = stripFences(text).trim();
    try { return JSON.parse(t); } catch { /* fall through */ }
    const start = t.search(/[{[]/);
    if (start < 0) return undefined;
    const endObj = t.lastIndexOf('}');
    const endArr = t.lastIndexOf(']');
    const end = Math.max(endObj, endArr);
    if (end <= start) return undefined;
    try { return JSON.parse(t.slice(start, end + 1)); } catch { return undefined; }
}

function jsonLeafMatches(a, b) {
    // Returns [matched, total] over leaf values of b (the target).
    if (b !== null && typeof b === 'object') {
        let matched = 0, total = 0;
        const keys = Array.isArray(b) ? b.map((_, i) => i) : Object.keys(b);
        for (const k of keys) {
            const [m, t] = jsonLeafMatches(a && typeof a === 'object' ? a[k] : undefined, b[k]);
            matched += m; total += t;
        }
        return [matched, Math.max(total, 1)];
    }
    // Lenient leaf compare: a one-element array counts as its element, numbers/strings compare
    // after normalization ("Busan" == "busan", 3 == "3").
    if (Array.isArray(a) && a.length === 1) a = a[0];
    const norm = v => normalize(typeof v === 'string' ? v : String(v));
    return [a !== undefined && a !== null && typeof a !== 'object' && norm(a) === norm(b) ? 1 : 0, 1];
}

/**
 * Score an output against a target for a given mode.
 * @returns {{score:number, detail:string}} score in [0,1]
 */
export function score(output, target, mode = 'exact') {
    const out = String(output ?? '');
    const tgt = String(target ?? '');
    switch (mode) {
        case 'exact': {
            if (normalizeKeepCase(out) === normalizeKeepCase(tgt)) return { score: 1, detail: '정확히 일치' };
            if (normalize(out) === normalize(tgt)) return { score: 0.9, detail: '대소문자만 다름' };
            const s = stringSimilarity(normalize(out), normalize(tgt));
            return { score: Math.min(s, 0.84), detail: `문자 유사도 ${(s * 100).toFixed(0)}%` };
        }
        case 'fuzzy': {
            const a = normalize(out), b = normalize(tgt);
            const s1 = stringSimilarity(a, b);
            const s2 = jaccard(tokens(out), tokens(tgt));
            const s = Math.max(s1, s2);
            return { score: s, detail: `문자 ${(s1 * 100).toFixed(0)}% / 단어 ${(s2 * 100).toFixed(0)}%` };
        }
        case 'set': {
            const A = listItems(out), B = listItems(tgt);
            const s = jaccard(A, B);
            const missing = B.filter(x => !A.includes(x));
            const extra = A.filter(x => !B.includes(x));
            const parts = [];
            if (missing.length) parts.push(`빠짐: ${missing.join(', ')}`);
            if (extra.length) parts.push(`군것질: ${extra.join(', ')}`);
            return { score: s, detail: parts.join(' · ') || '집합 일치' };
        }
        case 'number': {
            const a = firstNumber(out), b = firstNumber(tgt);
            if (a === null) return { score: 0, detail: '숫자를 찾을 수 없음' };
            if (a === b) {
                const clean = /^-?\d+(?:\.\d+)?$/.test(stripFences(out).replace(/,(?=\d{3}\b)/g, '').trim());
                return clean ? { score: 1, detail: '정답' } : { score: 0.9, detail: '정답이지만 군말이 붙음' };
            }
            const diff = Math.abs(a - b);
            const rel = b === 0 ? diff : diff / Math.abs(b);
            const s = Math.max(0, 0.5 - rel * 0.5);
            return { score: s, detail: `${a} (정답 ${b})` };
        }
        case 'json': {
            const a = tryParseJson(out), b = tryParseJson(tgt);
            if (b === undefined) return { score: 0, detail: '목표 JSON이 잘못됨' };
            if (a === undefined) return { score: 0, detail: 'JSON 파싱 실패' };
            const [m, t] = jsonLeafMatches(a, b);
            const extraKeys = (a && typeof a === 'object' && !Array.isArray(a) && b && typeof b === 'object')
                ? Object.keys(a).filter(k => !(k in b)).length : 0;
            let s = m / t;
            if (extraKeys) s *= 0.9;
            return { score: s, detail: `${m}/${t} 값 일치${extraKeys ? `, 불필요한 키 ${extraKeys}개` : ''}` };
        }
        default:
            throw new Error(`unknown match mode: ${mode}`);
    }
}

/** Grade tier from a 0..1 score and pass threshold. */
export function tier(s, threshold = 0.85) {
    if (s >= 0.999) return { key: 'perfect', label: '완벽!', emoji: '🎉' };
    if (s >= threshold) return { key: 'pass', label: '통과', emoji: '🍌' };
    if (s >= 0.5) return { key: 'close', label: '아깝다', emoji: '😅' };
    return { key: 'disaster', label: '대참사', emoji: '💥' };
}

/** Star count: 3 = pass with ≤60% of prompt budget, 2 = pass, 1 = ≥50%, 0 otherwise. */
export function stars(s, threshold, budgetUsedRatio) {
    if (s >= threshold) return budgetUsedRatio <= 0.6 ? 3 : 2;
    if (s >= 0.5) return 1;
    return 0;
}
