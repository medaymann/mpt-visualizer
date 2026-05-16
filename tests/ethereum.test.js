/**
 * Tests for the RLP encoder and block-id parser used by EthereumService.
 * Validates against canonical RLP values from the Ethereum yellow paper:
 *   - rlp(0)   = 0x80
 *   - rlp(1)   = 0x01      (single byte < 0x80, no prefix)
 *   - rlp(15)  = 0x0f
 *   - rlp(127) = 0x7f      (still single byte < 0x80)
 *   - rlp(128) = 0x8180    (0x81 = length-1 string prefix, then 0x80)
 *   - rlp(1024)= 0x820400  (0x82 = length-2 prefix, then 0x0400)
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { rlpEncodeInt, normalizeBlockId } from '../src/ui/EthereumService.js';

test('rlp: rlpEncodeInt(0) is "80"', () => {
    assert.strictEqual(rlpEncodeInt(0), '80');
});

test('rlp: small integers < 0x80 encode as themselves', () => {
    assert.strictEqual(rlpEncodeInt(1), '01');
    assert.strictEqual(rlpEncodeInt(15), '0f');
    assert.strictEqual(rlpEncodeInt(127), '7f');
});

test('rlp: 0x80 needs string prefix → "8180"', () => {
    assert.strictEqual(rlpEncodeInt(128), '8180');
});

test('rlp: multi-byte integers get length prefix', () => {
    assert.strictEqual(rlpEncodeInt(255), '81ff');
    assert.strictEqual(rlpEncodeInt(256), '820100');
    assert.strictEqual(rlpEncodeInt(1024), '820400');
});

test('rlp: encoded keys for tx indices 0..200 are all unique', () => {
    const seen = new Set();
    for (let i = 0; i <= 200; i++) {
        const k = rlpEncodeInt(i);
        assert.ok(!seen.has(k), `duplicate key for index ${i}: ${k}`);
        seen.add(k);
    }
});

test('rlp: encoded keys are valid hex', () => {
    for (let i = 0; i < 50; i++) {
        const k = rlpEncodeInt(i);
        assert.match(k, /^[0-9a-f]+$/, `index ${i} should be lowercase hex, got ${k}`);
        assert.strictEqual(k.length % 2, 0, `index ${i} hex length should be even`);
    }
});

test('block-id: passes through named tags', () => {
    for (const tag of ['latest', 'earliest', 'pending', 'finalized', 'safe']) {
        assert.strictEqual(normalizeBlockId(tag), tag);
    }
});

test('block-id: decimal number → 0x-hex', () => {
    assert.strictEqual(normalizeBlockId('0'), '0x0');
    assert.strictEqual(normalizeBlockId('1'), '0x1');
    assert.strictEqual(normalizeBlockId('18000000'), '0x112a880');
});

test('block-id: hex number passes through normalized', () => {
    assert.strictEqual(normalizeBlockId('0x1'), '0x1');
    assert.strictEqual(normalizeBlockId('0x112a880'), '0x112a880');
});

test('block-id: 32-byte block hash passes through as-is', () => {
    const h = '0x' + 'a'.repeat(64);
    assert.strictEqual(normalizeBlockId(h), h);
});

test('block-id: invalid input throws', () => {
    assert.throws(() => normalizeBlockId(''));
    assert.throws(() => normalizeBlockId('nonsense'));
    assert.throws(() => normalizeBlockId('-1'));
});

test('block-id: leading/trailing whitespace tolerated', () => {
    assert.strictEqual(normalizeBlockId('  42  '), '0x2a');
});
