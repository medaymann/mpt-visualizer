/**
 * Canonical Ethereum Merkle Patricia Trie — in-browser port of the Rust
 * backend's mpt.rs. Produces byte-identical keccak roots and a view tree that
 * matches the backend's /api/trie/build response shape:
 *   { root: ViewNode|null, computed_root: "0x...", node_count: number }
 *
 * Internal node shape:
 *   { type: 'leaf',      path: number[] (nibbles), value: number[] (bytes) }
 *   { type: 'extension', path: number[] (nibbles), child: Node }
 *   { type: 'branch',    children: (Node|null)[16], value: number[]|null }
 */

import { encodeBytes, encodeList } from './rlp.js';
import { keccak256, keccak256Hex } from './keccak.js';

// --- key decoding ------------------------------------------------------------

/**
 * Decode a hex key string (with or without 0x) to bytes. Odd-length input is
 * left-padded with a leading zero, matching the backend's decode_hex_key.
 * Empty string -> [].
 */
export function decodeHexKey(s) {
    s = s.replace(/^0x/i, '');
    if (s === '') return [];
    if (!/^[0-9a-fA-F]+$/.test(s)) {
        throw new Error(`invalid hex key: ${s}`);
    }
    if (s.length % 2 === 1) s = '0' + s;
    const out = [];
    for (let i = 0; i < s.length; i += 2) {
        out.push(parseInt(s.slice(i, i + 2), 16));
    }
    return out;
}

function toNibbles(bytes) {
    const out = [];
    for (const b of bytes) {
        out.push(b >> 4);
        out.push(b & 0x0f);
    }
    return out;
}

function commonPrefixLen(a, b) {
    let i = 0;
    const n = Math.min(a.length, b.length);
    while (i < n && a[i] === b[i]) i++;
    return i;
}

function arrEq(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

// --- build / insert ----------------------------------------------------------

/** Build the trie from [keyBytes, valueBytes] pairs. */
export function build(entries) {
    let root = null; // null === Empty
    for (const [k, v] of entries) {
        root = insert(root, toNibbles(k), v.slice());
    }
    return root;
}

function insert(node, key, value) {
    if (node === null) {
        return { type: 'leaf', path: key.slice(), value };
    }

    if (node.type === 'leaf') {
        if (arrEq(node.path, key)) {
            return { type: 'leaf', path: node.path, value };
        }
        const cpl = commonPrefixLen(node.path, key);
        const children = new Array(16).fill(null);
        let branchValue = null;

        if (cpl < node.path.length) {
            const nib = node.path[cpl];
            const rest = node.path.slice(cpl + 1);
            children[nib] = { type: 'leaf', path: rest, value: node.value };
        } else {
            branchValue = node.value;
        }
        if (cpl < key.length) {
            const nib = key[cpl];
            const rest = key.slice(cpl + 1);
            children[nib] = { type: 'leaf', path: rest, value };
        } else {
            branchValue = value;
        }
        const branch = { type: 'branch', children, value: branchValue };
        if (cpl > 0) {
            return { type: 'extension', path: node.path.slice(0, cpl), child: branch };
        }
        return branch;
    }

    if (node.type === 'extension') {
        const cpl = commonPrefixLen(node.path, key);
        if (cpl === node.path.length) {
            const newChild = insert(node.child, key.slice(cpl), value);
            return { type: 'extension', path: node.path, child: newChild };
        }
        const children = new Array(16).fill(null);
        let branchValue = null;

        const oldNib = node.path[cpl];
        const oldRest = node.path.slice(cpl + 1);
        const oldSubtree = oldRest.length === 0
            ? node.child
            : { type: 'extension', path: oldRest, child: node.child };
        children[oldNib] = oldSubtree;

        if (cpl < key.length) {
            const newNib = key[cpl];
            const newRest = key.slice(cpl + 1);
            children[newNib] = { type: 'leaf', path: newRest, value };
        } else {
            branchValue = value;
        }
        const branch = { type: 'branch', children, value: branchValue };
        if (cpl > 0) {
            return { type: 'extension', path: node.path.slice(0, cpl), child: branch };
        }
        return branch;
    }

    // branch
    if (key.length === 0) {
        return { type: 'branch', children: node.children, value };
    }
    const nib = key[0];
    const rest = key.slice(1);
    const children = node.children.slice();
    children[nib] = insert(children[nib] ?? null, rest, value);
    return { type: 'branch', children, value: node.value };
}

// --- hashing -----------------------------------------------------------------

/** Hex-prefix encoding (yellow paper appendix C). */
function hexPrefix(nibbles, isLeaf) {
    const odd = nibbles.length % 2 === 1;
    const flag = (isLeaf ? 2 : 0) | (odd ? 1 : 0);
    const out = [];
    if (odd) {
        out.push((flag << 4) | nibbles[0]);
        for (let i = 1; i < nibbles.length; i += 2) {
            out.push((nibbles[i] << 4) | nibbles[i + 1]);
        }
    } else {
        out.push(flag << 4);
        for (let i = 0; i < nibbles.length; i += 2) {
            out.push((nibbles[i] << 4) | nibbles[i + 1]);
        }
    }
    return out;
}

function rlpOfNode(node) {
    if (node === null) return encodeBytes([]);
    if (node.type === 'leaf') {
        const hp = hexPrefix(node.path, true);
        return encodeList([encodeBytes(hp), encodeBytes(node.value)]);
    }
    if (node.type === 'extension') {
        const hp = hexPrefix(node.path, false);
        return encodeList([encodeBytes(hp), encodeForParent(node.child)]);
    }
    // branch
    const items = [];
    for (const c of node.children) {
        items.push(c ? encodeForParent(c) : encodeBytes([]));
    }
    items.push(encodeBytes(node.value ?? []));
    return encodeList(items);
}

function encodeForParent(node) {
    if (node === null) return encodeBytes([]);
    const raw = rlpOfNode(node);
    if (raw.length < 32) return raw;
    return encodeBytes(Array.from(keccak256(raw)));
}

/** 32-byte keccak root as a lowercase hex string (no 0x). */
export function rootHashHex(node) {
    if (node === null) return keccak256Hex(encodeBytes([]));
    return keccak256Hex(rlpOfNode(node));
}

function nodeHashHex(node) {
    return keccak256Hex(rlpOfNode(node));
}

// --- view tree ---------------------------------------------------------------

function nibblesToHex(nibbles) {
    return nibbles.map(n => n.toString(16)).join('');
}

/**
 * Convert internal Node -> backend-shaped ViewNode. `valueRender(bytes)` decides
 * how to display leaf/branch values.
 */
export function toView(node, valueRender) {
    if (node === null) return null;
    if (node.type === 'leaf') {
        return {
            type: 'leaf',
            path: nibblesToHex(node.path),
            value: valueRender(node.value),
            hash: nodeHashHex(node),
        };
    }
    if (node.type === 'extension') {
        const childView = toView(node.child, valueRender)
            ?? { type: 'leaf', path: '', value: '', hash: '' };
        return {
            type: 'extension',
            path: nibblesToHex(node.path),
            child: childView,
            hash: nodeHashHex(node),
        };
    }
    // branch
    const children = node.children.map(c => (c ? toView(c, valueRender) : null));
    return {
        type: 'branch',
        children,
        value: node.value !== null && node.value !== undefined ? valueRender(node.value) : undefined,
        hash: nodeHashHex(node),
    };
}

function countNodes(node) {
    if (node === null) return 0;
    if (node.type === 'leaf') return 1;
    if (node.type === 'extension') return 1 + countNodes(node.child);
    return 1 + node.children.reduce((acc, c) => acc + countNodes(c), 0);
}

// --- public API mirroring POST /api/trie/build -------------------------------

/**
 * Build a trie from { hexKey: utf8Value } entries and return the same shape the
 * backend's /api/trie/build endpoint returns.
 * @param {Object<string,string>} entriesDict
 */
export function buildTrieResponse(entriesDict) {
    const enc = new TextEncoder();
    const entries = [];
    // Map raw value bytes -> original string for display.
    const valueLookup = new Map();
    for (const [k, v] of Object.entries(entriesDict)) {
        const keyBytes = decodeHexKey(k);
        const valBytes = Array.from(enc.encode(v));
        entries.push([keyBytes, valBytes]);
        valueLookup.set(valBytes.join(','), v);
    }

    const root = build(entries);
    const computedHex = '0x' + rootHashHex(root);

    const dec = new TextDecoder('utf-8', { fatal: false });
    const valueRender = (bytes) => {
        const hit = valueLookup.get(bytes.join(','));
        if (hit !== undefined) return hit;
        // Fallback: try UTF-8, else hex (mirrors the backend).
        try {
            return dec.decode(Uint8Array.from(bytes));
        } catch {
            return '0x' + bytes.map(b => b.toString(16).padStart(2, '0')).join('');
        }
    };

    return {
        root: toView(root, valueRender),
        computed_root: computedHex,
        node_count: countNodes(root),
    };
}
