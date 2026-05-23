/**
 * RLP encoder tests — mirrors the Rust backend's rlp.rs unit tests, plus a few
 * extra canonical vectors from the Ethereum yellow paper.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { encodeBytes, encodeList, encodeInt } from '../src/engine/rlp.js';

const hex = (arr) => arr.map(b => b.toString(16).padStart(2, '0')).join('');
const enc = (s) => Array.from(new TextEncoder().encode(s));

test('rlp: encodeInt canonical', () => {
    assert.deepStrictEqual(encodeInt(0), [0x80]);
    assert.deepStrictEqual(encodeInt(1), [0x01]);
    assert.deepStrictEqual(encodeInt(127), [0x7f]);
    assert.deepStrictEqual(encodeInt(128), [0x81, 0x80]);
    assert.deepStrictEqual(encodeInt(1024), [0x82, 0x04, 0x00]);
});

test('rlp: empty list is 0xc0', () => {
    assert.deepStrictEqual(encodeList([]), [0xc0]);
});

test('rlp: short string "dog"', () => {
    assert.deepStrictEqual(encodeBytes(enc('dog')), [0x83, 0x64, 0x6f, 0x67]);
});

test('rlp: single byte < 0x80 is itself', () => {
    assert.deepStrictEqual(encodeBytes([0x00]), [0x00]);
    assert.deepStrictEqual(encodeBytes([0x7f]), [0x7f]);
});

test('rlp: empty bytes is 0x80', () => {
    assert.deepStrictEqual(encodeBytes([]), [0x80]);
});

test('rlp: 55-byte string uses short form (0xb7), 56 uses long form (0xb8)', () => {
    const s55 = new Array(55).fill(0x61);
    const s56 = new Array(56).fill(0x61);
    assert.strictEqual(encodeBytes(s55)[0], 0x80 + 55);
    assert.strictEqual(encodeBytes(s56)[0], 0xb8); // 0xb7 + 1 length byte
    assert.strictEqual(encodeBytes(s56)[1], 56);
});

test('rlp: list of two strings ["cat","dog"]', () => {
    const out = encodeList([encodeBytes(enc('cat')), encodeBytes(enc('dog'))]);
    // 0xc8 (list len 8) 83 cat 83 dog
    assert.strictEqual(hex(out), 'c88363617483646f67');
});
