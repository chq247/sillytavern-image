import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEFAULT_GENERATION_TIMEOUT_MINUTES,
    MAX_GENERATION_TIMEOUT_MINUTES,
    MIN_GENERATION_TIMEOUT_MINUTES,
    getGenerationTimeoutMilliseconds,
    normalizeGenerationTimeoutMinutes,
} from './timeout.js';

test('generation timeout defaults to ten minutes', () => {
    assert.equal(DEFAULT_GENERATION_TIMEOUT_MINUTES, 10);
    assert.equal(normalizeGenerationTimeoutMinutes(undefined), 10);
    assert.equal(normalizeGenerationTimeoutMinutes(''), 10);
    assert.equal(normalizeGenerationTimeoutMinutes('not-a-number'), 10);
});

test('generation timeout accepts whole minutes and rounds fractional values', () => {
    assert.equal(normalizeGenerationTimeoutMinutes('15'), 15);
    assert.equal(normalizeGenerationTimeoutMinutes(3.6), 4);
});

test('generation timeout is clamped to the supported range', () => {
    assert.equal(normalizeGenerationTimeoutMinutes(0), MIN_GENERATION_TIMEOUT_MINUTES);
    assert.equal(normalizeGenerationTimeoutMinutes(999), MAX_GENERATION_TIMEOUT_MINUTES);
});

test('generation timeout converts minutes to milliseconds', () => {
    assert.equal(getGenerationTimeoutMilliseconds(10), 600_000);
});
