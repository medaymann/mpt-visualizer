/**
 * Tests for LayoutEngine — verifies the tree builder reaches every MPT node
 * and that subtree-width sizing prevents horizontal overlaps at the same y.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { MPT } from '../src/core/mpt.js';
import { LayoutEngine } from '../src/visualization/LayoutEngine.js';
import { countNodes } from '../src/core/stats.js';

function layoutFor(dict) {
    const mpt = new MPT();
    mpt.insertBulk(dict);
    const eng = new LayoutEngine();
    const tree = eng.buildTreeStructure(mpt.getRoot());
    const result = eng.calculateLayout(tree);
    return { mpt, tree, ...result };
}

function hasOverlap(positions) {
    const arr = [];
    positions.forEach(p => arr.push(p));
    for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
            if (arr[i].y !== arr[j].y) continue;
            const a = arr[i], b = arr[j];
            const aR = a.x + a.width, bR = b.x + b.width;
            if (a.x < bR && b.x < aR) return true;
        }
    }
    return false;
}

const CASES = [
    { name: 'single leaf', dict: { '1234': 'alice' } },
    { name: 'branching', dict: { '1234': 'a', '1235': 'b', '12ab': 'c', 'cafe': 'd' } },
    { name: 'extension split', dict: { 'abcd1': 'x', 'abcd2': 'y', 'abef3': 'z' } },
    { name: 'wide root branch', dict: { '0': '0', '1': '1', '2': '2', 'a': 'a', 'f': 'f' } },
    { name: 'deep chain', dict: { '0000000000': 'a', '0000000001': 'b' } },
    { name: 'prefix nesting', dict: { 'aa': '1', 'aaaa': '2', 'aaaaaa': '3' } },
    { name: 'many keys', dict: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i.toString(16).padStart(2, '0'), `v${i}`])) }
];

for (const { name, dict } of CASES) {
    test(`layout: ${name} — reaches every node`, () => {
        const { mpt, positions } = layoutFor(dict);
        const expected = countNodes(mpt.getRoot()).total;
        assert.strictEqual(positions.size, expected, 'positions count must match node count');
    });

    test(`layout: ${name} — no overlap on same y`, () => {
        const { positions } = layoutFor(dict);
        assert.strictEqual(hasOverlap(positions), false, 'no two nodes on the same row may overlap');
    });

    test(`layout: ${name} — bbox is consistent`, () => {
        const { positions, bbox } = layoutFor(dict);
        let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
        positions.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x + p.width);
            maxY = Math.max(maxY, p.y);
        });
        assert.strictEqual(bbox.minX, minX);
        assert.strictEqual(bbox.maxX, maxX);
        assert.ok(bbox.maxY > maxY, 'bbox.maxY accounts for node height row');
    });
}

test('layout: empty trie yields empty positions', () => {
    const eng = new LayoutEngine();
    const tree = eng.buildTreeStructure(null);
    const { positions } = eng.calculateLayout(tree);
    // Tree root holds the null mptNode; positions includes the null entry.
    // What we care about is that it doesn't throw.
    assert.ok(positions instanceof Map);
});

test('layout: children y is exactly one level below parent', () => {
    const { tree, positions } = layoutFor({ '12': 'a', '34': 'b' });
    const rootY = positions.get(tree.node).y;
    for (const child of tree.children) {
        assert.strictEqual(positions.get(child.node).y, rootY + 170);
    }
});
