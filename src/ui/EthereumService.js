/**
 * EthereumService
 *
 * Custom mode is computed entirely in-browser by the JS trie engine
 * (src/engine), so it works on a static deploy with no backend.
 *
 * Ethereum-block mode still needs the Rust backend: it fetches the block via
 * JSON-RPC, rebuilds the transactions trie, and verifies the root against
 * block.transactionsRoot. When no backend is configured/reachable that mode is
 * disabled (see App.js graceful degradation).
 *
 * The pure helpers (rlpEncodeInt, normalizeBlockId) remain exported so the
 * client-side test suite can still validate them without booting the backend.
 */

import { buildTrieResponse } from '../engine/mpt.js';

// Ethereum mode targets this backend. Override via window.MPT_BACKEND; defaults
// to the local dev backend. If it isn't running, getBlock surfaces a clear
// "can't reach backend" error.
const BACKEND_BASE = (typeof window !== 'undefined' && window.MPT_BACKEND) || 'http://localhost:8081';

// --- pure helpers kept for tests ---------------------------------------------

export function rlpEncodeInt(n) {
    if (n === 0) return "80";
    const bytes = [];
    let x = n;
    while (x > 0) {
        bytes.unshift(x & 0xff);
        x = x >>> 8;
    }
    return rlpEncodeBytes(bytes);
}

function rlpEncodeBytes(bytes) {
    if (bytes.length === 1 && bytes[0] < 0x80) {
        return bytes[0].toString(16).padStart(2, '0');
    }
    if (bytes.length <= 55) {
        const prefix = (0x80 + bytes.length).toString(16).padStart(2, '0');
        return prefix + bytes.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    const lenBytes = [];
    let l = bytes.length;
    while (l > 0) { lenBytes.unshift(l & 0xff); l = l >>> 8; }
    const prefix = (0xb7 + lenBytes.length).toString(16).padStart(2, '0');
    const lenHex = lenBytes.map(b => b.toString(16).padStart(2, '0')).join('');
    return prefix + lenHex + bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function normalizeBlockId(input) {
    const s = input.trim();
    if (!s) throw new Error("Empty block identifier");
    if (s === "latest" || s === "earliest" || s === "pending" || s === "finalized" || s === "safe") return s;
    if (s.startsWith("0x") && s.length === 66) return s;
    const n = s.startsWith("0x") ? parseInt(s, 16) : parseInt(s, 10);
    if (Number.isNaN(n) || n < 0) throw new Error(`Invalid block identifier: ${input}`);
    return "0x" + n.toString(16);
}

// --- backend client ----------------------------------------------------------

/**
 * Convert backend ViewNode (tagged JSON) into the in-memory MPT node shape
 * (LeafNode/ExtensionNode/BranchNode) consumed by the Renderer.
 */
function viewToMpt(view, prefixNibbles = []) {
    if (!view) return null;
    if (view.type === 'leaf') {
        const restNibbles = hexToNibbles(view.path);
        const fullNibbles = prefixNibbles.concat(restNibbles);
        // Convert nibble array back to hex string (the original entry key).
        const entryKey = fullNibbles.map(n => n.toString(16)).join('');
        return {
            type: 'leaf',
            restOfKey: restNibbles,
            value: view.value,
            entryKey,
            hash: view.hash ?? null,
        };
    }
    if (view.type === 'extension') {
        const segNibbles = hexToNibbles(view.path);
        return {
            type: 'extension',
            keySegment: segNibbles,
            child: viewToMpt(view.child, prefixNibbles.concat(segNibbles)),
            hash: view.hash ?? null,
        };
    }
    // branch
    const children = new Array(16).fill(null);
    (view.children || []).forEach((c, i) => {
        children[i] = viewToMpt(c, prefixNibbles.concat([i]));
    });
    return {
        type: 'branch',
        children,
        value: view.value ?? null,
        hash: view.hash ?? null,
    };
}

function hexToNibbles(hex) {
    const out = [];
    for (const ch of hex || '') out.push(parseInt(ch, 16));
    return out;
}

export class EthereumService {
    constructor(baseUrl = BACKEND_BASE) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    /**
     * @param {string} blockId
     * @returns {Promise<{ root: object|null, meta: object, computedRoot: string, verified: boolean }>}
     */
    async getBlock(blockId) {
        const body = await this._fetch(
            `${this.baseUrl}/api/block/${encodeURIComponent(blockId.trim())}`,
            { method: 'GET' }
        );
        return {
            root: viewToMpt(body.root),
            meta: {
                number: body.meta.number,
                hash: body.meta.hash,
                txCount: body.meta.tx_count,
                gasUsed: body.meta.gas_used,
                timestamp: body.meta.timestamp,
                transactionsRoot: body.meta.transactions_root
            },
            computedRoot: body.computed_root,
            verified: body.verified
        };
    }

    /**
     * Build a trie from arbitrary hex-keyed entries (custom mode). Computed
     * in-browser by the JS engine — no backend needed. Async-shaped so callers
     * stay unchanged.
     * @param {Object<string,string>} entries
     * @returns {Promise<{ root: object|null, computedRoot: string, nodeCount: number }>}
     */
    async buildTrie(entries) {
        const body = buildTrieResponse(entries);
        return {
            root: viewToMpt(body.root),
            computedRoot: body.computed_root,
            nodeCount: body.node_count
        };
    }

    async _fetch(url, init) {
        let res;
        try {
            res = await fetch(url, init);
        } catch (e) {
            throw new Error(`Cannot reach backend at ${this.baseUrl} — is it running?`);
        }
        const body = await res.json().catch(() => null);
        if (!res.ok) {
            const msg = body && body.error ? body.error : `HTTP ${res.status}`;
            throw new Error(msg);
        }
        return body;
    }
}
