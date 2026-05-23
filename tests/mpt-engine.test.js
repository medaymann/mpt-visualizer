/**
 * MPT engine tests. The expected roots below were captured from the Rust
 * backend (POST /api/trie/build) and confirmed byte-identical, so these lock
 * the JS port to canonical behavior. If the Rust trie ever changes, these
 * will catch any drift in the JS engine.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
    build, rootHashHex, decodeHexKey, buildTrieResponse,
} from '../src/engine/mpt.js';

const enc = (s) => Array.from(new TextEncoder().encode(s));

function rootOf(dict) {
    return buildTrieResponse(dict).computed_root;
}

test('mpt: empty trie root matches the well-known spec value', () => {
    assert.strictEqual(
        '0x' + rootHashHex(build([])),
        '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421'
    );
});

// Roots confirmed against the Rust backend.
const EXPECTED = {
    branching: {
        dict: { '1234': 'alice', '1235': 'bob', '12ab': 'carol', 'cafe': 'dave' },
        root: '0x0b8fe82941d627d12266eb37e5116bed92701e06ae5fb188c835a4796aada225',
    },
    extensionSplit: {
        dict: { 'abcd1': 'one', 'abcd2': 'two', 'abef3': 'three' },
        root: '0xf27cc30c35527d16eac00b7c1e1ae537168fbbaab5758a777719968c4c988b21',
    },
    wideBranch: {
        dict: { '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', 'a': 'ten', 'f': 'fif' },
        root: '0x188aa251c77d08eaec196800e28d3808e84bc524539be4d8119a154666e95ec6',
    },
    deepChain: {
        dict: { '0000000000': 'deep-a', '0000000001': 'deep-b' },
        root: '0x375f8ea3ffd055a45b15937270d7a5c65cd680e799aef2068f010646d082a0dd',
    },
    prefixOverlap: {
        dict: { 'aa': 'A', 'aaaa': 'AA', 'aaaaaa': 'AAA' },
        root: '0x95ad8ed802fa2675f1c0b2c5135cf7b33c2c608b503d5ccfa6a4e2a848ac8390',
    },
};

for (const [name, { dict, root }] of Object.entries(EXPECTED)) {
    test(`mpt: ${name} root matches Rust backend`, () => {
        assert.strictEqual(rootOf(dict), root);
    });
}

test('mpt: root is independent of insertion order', () => {
    const a = rootOf({ '1a': '1', '2b': '2', '3c': '3' });
    // Re-order keys.
    const b = rootOf({ '3c': '3', '1a': '1', '2b': '2' });
    assert.strictEqual(a, b);
});

test('mpt: updating a key overwrites its value (last write wins)', () => {
    const once = rootOf({ ab: 'v2' });
    // Build with the same key twice — final value should win and match `once`.
    const entries = [
        [decodeHexKey('ab'), enc('v1')],
        [decodeHexKey('ab'), enc('v2')],
    ];
    assert.strictEqual('0x' + rootHashHex(build(entries)), once);
});

test('mpt: odd-length hex keys are accepted (left-padded)', () => {
    // "abc" -> bytes [0x0a, 0xbc]; should not throw and should be deterministic.
    const r1 = rootOf({ abc: 'x' });
    const r2 = rootOf({ '0abc': 'x' }); // same after padding
    assert.strictEqual(r1, r2);
});

test('mpt: 0x-prefixed keys equal their bare form', () => {
    assert.strictEqual(rootOf({ '0x1234': 'a' }), rootOf({ '1234': 'a' }));
});

test('mpt: buildTrieResponse reports node_count and a view tree', () => {
    const res = buildTrieResponse(EXPECTED.extensionSplit.dict);
    assert.strictEqual(res.node_count, 7);
    assert.ok(res.root && res.root.type === 'extension');
    // Every node carries a 64-hex-char keccak hash.
    const walk = (n) => {
        if (!n) return;
        assert.match(n.hash, /^[0-9a-f]{64}$/);
        if (n.type === 'extension') walk(n.child);
        if (n.type === 'branch') n.children.forEach(walk);
    };
    walk(res.root);
});

test('mpt: empty entries yields null root and empty-trie hash', () => {
    const res = buildTrieResponse({});
    assert.strictEqual(res.root, null);
    assert.strictEqual(
        res.computed_root,
        '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421'
    );
});
