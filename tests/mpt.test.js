/**
 * Validates the MPT implementation (mpt.js) by comparing its output against
 * spec-derived JSON fixtures (fixtures.json derived from trie_spec.py).
 */

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { MPT } from '../src/core/mpt.js';

const fixturesPath = path.join(process.cwd(), 'tests', 'fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

for (const [scenarioName, data] of Object.entries(fixtures)) {
    test(scenarioName, () => {
        const mpt = new MPT();
        mpt.insertBulk(data.input);
        const actual = mpt.toJSON();
        assert.deepStrictEqual(actual, data.expected);
    });
}