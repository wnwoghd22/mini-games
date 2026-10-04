// storage.js — tiny namespaced localStorage facade. Every access is guarded.
const PREFIX = 'chimp-conveyor:v5:';

export function load(key, fallback) {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
}

export function save(key, value) {
    try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch { /* quota / private mode: ignore */ }
}

export function remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}
