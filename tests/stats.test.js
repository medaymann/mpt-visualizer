/**
 * Tests for countNodes — the stats function backing MPTVisualizer.getStats.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { MPT } from '../src/core/mpt.js';
import { countNodes } from '../src/core/stats.js';

test('stats: empty trie', () => {
    assert.deepStrictEqual(countNodes(null), { leaves: 0, branches: 0, extensions: 0, total: 0 });
});

test('stats: single insert produces 1 leaf', () => {
    const mpt = new MPT();
    mpt.insert('1234', 'a');
    assert.deepStrictEqual(countNodes(mpt.getRoot()), { leaves: 1, branches: 0, extensions: 0, total: 1 });
});

test('stats: two divergent keys → branch + 2 leaves', () => {
    const mpt = new MPT();
    mpt.insertBulk({ 'a': '1', 'b': '2' });
    assert.deepStrictEqual(countNodes(mpt.getRoot()), { leaves: 2, branches: 1, extensions: 0, total: 3 });
});

test('stats: shared prefix → extension + branch + 2 leaves', () => {
    const mpt = new MPT();
    mpt.insertBulk({ 'abcd1': 'x', 'abcd2': 'y' });
    const s = countNodes(mpt.getRoot());
    assert.strictEqual(s.leaves, 2);
    assert.strictEqual(s.branches, 1);
    assert.strictEqual(s.extensions, 1);
    assert.strictEqual(s.total, 4);
});

test('stats: total equals sum of parts', () => {
    const mpt = new MPT();
    mpt.insertBulk({ '1234': 'a', '1235': 'b', '12ab': 'c', 'cafe': 'd', 'beef': 'e' });
    const s = countNodes(mpt.getRoot());
    assert.strictEqual(s.total, s.leaves + s.branches + s.extensions);
});
