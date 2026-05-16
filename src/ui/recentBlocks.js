/**
 * Recent-blocks history, persisted in localStorage.
 *
 * Stores a list of block numbers (decimal strings) the user has successfully
 * loaded, most-recent-first, deduplicated, capped at MAX entries.
 */

const STORAGE_KEY = 'mpt:recent-blocks';
const MAX = 8;

function safeRead() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

function safeWrite(list) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
        // localStorage may be disabled (private mode, etc.) — silently skip.
    }
}

export function load() {
    return safeRead();
}

export function push(blockNumber) {
    const id = String(blockNumber);
    const list = safeRead().filter(x => x !== id);
    list.unshift(id);
    const trimmed = list.slice(0, MAX);
    safeWrite(trimmed);
    return trimmed;
}

export function clear() {
    safeWrite([]);
    return [];
}
