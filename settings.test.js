import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const REQUESTED_SIZES = [
    '512x512',
    '600x600',
    '512x768',
    '768x512',
    '960x540',
    '540x960',
    '1920x1088',
    '1088x1920',
    '1280x720',
    '720x1280',
];

const CONTEXT_MODES = [
    'free',
    'extend',
    'scene',
    'last',
    'raw_last',
    'character',
    'face',
    'user',
    'background',
];

test('settings offer every requested common image size exactly once', async () => {
    const settingsHtml = await readFile(new URL('./settings.html', import.meta.url), 'utf8');

    for (const size of REQUESTED_SIZES) {
        const matches = settingsHtml.match(new RegExp(`<option value="${size}"`, 'g')) || [];
        assert.equal(matches.length, 1, `expected one option for ${size}`);
    }
});

test('prompt source selector offers exactly the nine supported context modes', async () => {
    const settingsHtml = await readFile(new URL('./settings.html', import.meta.url), 'utf8');
    const selector = settingsHtml.match(
        /<select\s+id="cli_proxy_image_direct_context_mode"[^>]*>([\s\S]*?)<\/select>/,
    );

    assert.ok(selector, 'expected the prompt source selector');

    const optionValues = [...selector[1].matchAll(/<option\s+value="([^"]+)"/g)]
        .map((match) => match[1]);

    assert.deepEqual(optionValues, CONTEXT_MODES);
});
