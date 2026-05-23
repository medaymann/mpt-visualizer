/**
 * keccak-256 known-answer tests. Vectors confirmed against pycryptodome's
 * Keccak (digest_bits=256), which is the pre-NIST Keccak Ethereum uses.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { keccak256Hex } from '../src/engine/keccak.js';

const enc = (s) => new TextEncoder().encode(s);

test('keccak: empty input', () => {
    assert.strictEqual(
        keccak256Hex(enc('')),
        'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
    );
});

test('keccak: "abc"', () => {
    assert.strictEqual(
        keccak256Hex(enc('abc')),
        '4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45'
    );
});

test('keccak: rate boundary (135 bytes, single padded block)', () => {
    assert.strictEqual(
        keccak256Hex(enc('a'.repeat(135))),
        '34367dc248bbd832f4e3e69dfaac2f92638bd0bbd18f2912ba4ef454919cf446'
    );
});

test('keccak: rate boundary (136 bytes, full block + pad block)', () => {
    assert.strictEqual(
        keccak256Hex(enc('a'.repeat(136))),
        'a6c4d403279fe3e0af03729caada8374b5ca54d8065329a3ebcaeb4b60aa386e'
    );
});

test('keccak: multi-block (200 bytes)', () => {
    assert.strictEqual(
        keccak256Hex(enc('a'.repeat(200))),
        '96ea54061def936c4be90b518992fdc6f12f535068a256229aca54267b4d084d'
    );
});

test('keccak: accepts number[] as well as Uint8Array', () => {
    const viaArray = keccak256Hex([0x61, 0x62, 0x63]); // "abc"
    const viaTyped = keccak256Hex(enc('abc'));
    assert.strictEqual(viaArray, viaTyped);
});
