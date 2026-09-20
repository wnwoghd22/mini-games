// llm.js — thin wrapper around WebLLM (on-device, WebGPU). One fixed small model.
import { CreateMLCEngine, prebuiltAppConfig }
    from 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';

const SYSTEM_PROMPT = [
    '너는 공장 컨베이어 라인에서 일하는 침팬지 직원이다. 지시를 그대로 수행하고 결과만 출력한다.',
    '설명, 인사, 따옴표, 마크다운을 붙이지 않는다.',
    'You are a chimp worker on a factory conveyor line. Follow the instruction and output only the result.',
    'No explanations, no greetings, no quotes, no markdown.',
].join('\n');

let engine = null;
let engineModelId = null;
let initPromise = null;

export function hasWebGPU() {
    return typeof navigator !== 'undefined' && !!navigator.gpu;
}

export function modelInfo(modelId) {
    const m = prebuiltAppConfig.model_list.find(x => x.model_id === modelId);
    return m ? { id: modelId, vramMB: Math.round(m.vram_required_MB ?? 0) } : null;
}

export function currentModelId() {
    return engineModelId;
}

export function isReady() {
    return !!engine;
}

/** Load a model. onProgress receives { progress: 0..1, text, timeElapsed }. Concurrent calls share the promise. */
export async function init(modelId, onProgress) {
    if (engine && engineModelId === modelId) return engine;
    if (initPromise) await initPromise.catch(() => { });
    if (engine && engineModelId === modelId) return engine;

    initPromise = (async () => {
        if (engine) {
            try { await engine.unload(); } catch { /* ignore */ }
            engine = null;
            engineModelId = null;
        }
        const e = await CreateMLCEngine(modelId, {
            initProgressCallback: report => onProgress?.(report),
        });
        engine = e;
        engineModelId = modelId;
        return e;
    })();

    try {
        return await initPromise;
    } finally {
        initPromise = null;
    }
}

/**
 * The previous chimp's output is always the main `Input:`. Memory upgrades add reference blocks
 * AFTER it, labelled as references, so "Output the input exactly as it is." keeps working.
 */
function buildUserMessage({ prompt, input, context }) {
    const parts = [prompt, `Input:\n${input}`];
    if (context?.originalInput !== undefined) {
        parts.push(`(Reference - original work order, not the input:\n${context.originalInput})`);
    }
    if (context?.prevPrompt !== undefined) {
        parts.push(`(Reference - previous chimp's instruction, not the input:\n${context.prevPrompt})`);
    }
    parts.push('Output:');
    return parts.join('\n\n');
}

/**
 * Run one chimp. Streams the text so far through onToken(text). Resolves with the full raw text.
 * Rejects with AbortError when signal aborts.
 */
export async function generate({ prompt, input, context, signal, onToken, maxTokens = 64, temperature = 0.5 }) {
    if (!engine) throw new Error('engine not loaded');
    if (signal?.aborted) throw abortError();

    const stream = await engine.chat.completions.create({
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserMessage({ prompt, input, context }) },
        ],
        stream: true,
        temperature,
        top_p: 0.95,
        max_tokens: maxTokens,
        stop: ['\nInput:', '\n입력:', '\n\n\n'],
    });

    let text = '';
    const onAbort = () => { try { engine.interruptGenerate(); } catch { /* ignore */ } };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
        for await (const chunk of stream) {
            if (signal?.aborted) break;
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (!delta) continue;
            text += delta;
            onToken?.(text);
        }
    } finally {
        signal?.removeEventListener('abort', onAbort);
    }
    if (signal?.aborted) throw abortError();
    return text;
}

export function abort() {
    try { engine?.interruptGenerate(); } catch { /* ignore */ }
}

function abortError() {
    const e = new Error('aborted');
    e.name = 'AbortError';
    return e;
}
