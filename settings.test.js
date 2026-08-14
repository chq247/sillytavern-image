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

test('settings offer every requested common image size exactly once', async () => {
    const settingsHtml = await readFile(new URL('./settings.html', import.meta.url), 'utf8');

    for (const size of REQUESTED_SIZES) {
        const matches = settingsHtml.match(new RegExp(`<option value="${size}"`, 'g')) || [];
        assert.equal(matches.length, 1, `expected one option for ${size}`);
    }
});
