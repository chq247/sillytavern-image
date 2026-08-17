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

const MODELS = [
    'gpt-image-2',
    'gpt-image-1.5',
    'codex/gpt-image-2',
    'codex/gpt-image-1.5',
    'grok-imagine-image',
    'grok-imagine-image-pro',
];

const AUTO_CONTEXT_MODES = [
    'character',
    'face',
    'scene',
    'last',
    'user',
    'background',
];

const AUTO_COOLDOWN_OPTIONS = [
    '0',
    '15',
    '30',
    '60',
    '120',
    '300',
    '600',
];

test('settings offer every requested common image size exactly once', async () => {
    const settingsHtml = await readFile(new URL('./settings.html', import.meta.url), 'utf8');

    for (const size of REQUESTED_SIZES) {
        const matches = settingsHtml.match(new RegExp(`<option value="${size}"`, 'g')) || [];
        assert.equal(matches.length, 1, `expected one option for ${size}`);
    }
});

test('model selector offers the gpt-image and grok image models exactly once', async () => {
    const settingsHtml = await readFile(new URL('./settings.html', import.meta.url), 'utf8');
    const selector = settingsHtml.match(
        /<select\s+id="cli_proxy_image_direct_model"[^>]*>([\s\S]*?)<\/select>/,
    );

    assert.ok(selector, 'expected the model selector');

    const optionValues = [...selector[1].matchAll(/<option\s+value="([^"]+)"/g)]
        .map((match) => match[1]);

    assert.deepEqual(optionValues, MODELS);
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

test('auto generation toggle, collapsed options block, and both auto selects exist', async () => {
    const settingsHtml = await readFile(new URL('./settings.html', import.meta.url), 'utf8');

    assert.match(settingsHtml, /<input\s+id="cli_proxy_image_direct_auto_generate"\s+type="checkbox">/);
    assert.match(settingsHtml, /<div\s+id="cli_proxy_image_direct_auto_options"\s+hidden>/);
    assert.match(settingsHtml, /<input\s+id="cli_proxy_image_direct_auto_first_message"\s+type="checkbox">/);

    const autoModeSelect = settingsHtml.match(
        /<select\s+id="cli_proxy_image_direct_auto_context_mode"[^>]*>([\s\S]*?)<\/select>/,
    );
    assert.ok(autoModeSelect, 'expected the auto prompt source selector');
    const autoModeValues = [...autoModeSelect[1].matchAll(/<option\s+value="([^"]+)"/g)]
        .map((match) => match[1]);
    assert.deepEqual(autoModeValues, AUTO_CONTEXT_MODES);

    const cooldownSelect = settingsHtml.match(
        /<select\s+id="cli_proxy_image_direct_auto_cooldown"[^>]*>([\s\S]*?)<\/select>/,
    );
    assert.ok(cooldownSelect, 'expected the auto cooldown selector');
    const cooldownValues = [...cooldownSelect[1].matchAll(/<option\s+value="([^"]+)"/g)]
        .map((match) => match[1]);
    assert.deepEqual(cooldownValues, AUTO_COOLDOWN_OPTIONS);
});
