import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AUTO_CONTEXT_MODES,
    AUTO_COOLDOWN_OPTIONS,
    DEFAULT_AUTO_COOLDOWN_SECONDS,
    DEFAULT_AUTO_CONTEXT_MODE,
    isAutoGenerationEligible,
    normalizeAutoContextMode,
    normalizeAutoCooldownSeconds,
} from './auto.js';

const CHARACTER_MESSAGE = { mes: '她站在雨夜的霓虹街道上', is_user: false, is_system: false };
const NOW = 1_000_000;

function eligible(overrides = {}) {
    return isAutoGenerationEligible({
        enabled: true,
        type: 'normal',
        message: CHARACTER_MESSAGE,
        now: NOW,
        lastGenerationAt: 0,
        cooldownSeconds: 60,
        ...overrides,
    });
}

test('auto context modes cover the six context-backed sources only', () => {
    assert.deepEqual([...AUTO_CONTEXT_MODES], ['scene', 'last', 'character', 'face', 'user', 'background']);
    for (const excluded of ['free', 'extend', 'raw_last']) {
        assert.ok(!AUTO_CONTEXT_MODES.includes(excluded), `${excluded} must not be an auto mode`);
    }
});

test('normalizeAutoContextMode keeps valid modes and falls back to character', () => {
    assert.equal(normalizeAutoContextMode('scene'), 'scene');
    assert.equal(normalizeAutoContextMode('  CHARACTER '), 'character');
    assert.equal(normalizeAutoContextMode('free'), DEFAULT_AUTO_CONTEXT_MODE);
    assert.equal(normalizeAutoContextMode(''), DEFAULT_AUTO_CONTEXT_MODE);
    assert.equal(normalizeAutoContextMode(undefined), DEFAULT_AUTO_CONTEXT_MODE);
});

test('normalizeAutoCooldownSeconds keeps listed values and falls back to 60', () => {
    assert.equal(normalizeAutoCooldownSeconds(0), 0);
    assert.equal(normalizeAutoCooldownSeconds(300), 300);
    assert.equal(normalizeAutoCooldownSeconds('120'), 120);
    assert.equal(normalizeAutoCooldownSeconds(45), DEFAULT_AUTO_COOLDOWN_SECONDS);
    assert.equal(normalizeAutoCooldownSeconds('not-a-number'), DEFAULT_AUTO_COOLDOWN_SECONDS);
    assert.deepEqual([...AUTO_COOLDOWN_OPTIONS], [0, 15, 30, 60, 120, 300, 600]);
});

test('a normal character message is eligible', () => {
    assert.equal(eligible(), true);
});

test('auto generation stays silent when disabled or busy', () => {
    assert.equal(eligible({ enabled: false }), false);
    assert.equal(eligible({ busy: true }), false);
});

test('extension and unapproved first messages never trigger', () => {
    assert.equal(eligible({ type: 'extension' }), false);
    assert.equal(eligible({ type: 'first_message' }), false);
    assert.equal(eligible({ type: 'first_message', allowFirstMessage: true }), true);
});

test('user, system, media, and empty messages never trigger', () => {
    assert.equal(eligible({ message: { ...CHARACTER_MESSAGE, is_user: true } }), false);
    assert.equal(eligible({ message: { ...CHARACTER_MESSAGE, is_system: true } }), false);
    assert.equal(
        eligible({ message: { ...CHARACTER_MESSAGE, extra: { media: [{ url: 'x' }] } } }),
        false,
    );
    assert.equal(eligible({ message: { ...CHARACTER_MESSAGE, mes: '   ' } }), false);
    assert.equal(eligible({ message: null }), false);
});

test('cooldown suppresses triggers until it elapses', () => {
    assert.equal(eligible({ lastGenerationAt: NOW - 30_000 }), false);
    assert.equal(eligible({ lastGenerationAt: NOW - 60_000 }), true);
    assert.equal(eligible({ lastGenerationAt: NOW - 30_000, cooldownSeconds: 0 }), true);
});
