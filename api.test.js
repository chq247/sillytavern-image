import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildApiUrl,
    buildAuthHeaders,
    describeApiError,
    normalizeGenerationResponse,
} from './api.js';

const PNG_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const WEBP_SIGNATURE = 'UklGRgAAAABXRUJQ';

test('buildApiUrl accepts host, v1, and full endpoint forms', () => {
    assert.equal(
        buildApiUrl('http://127.0.0.1:8317', 'models'),
        'http://127.0.0.1:8317/v1/models',
    );
    assert.equal(
        buildApiUrl('https://proxy.example/v1', 'images/generations'),
        'https://proxy.example/v1/images/generations',
    );
    assert.equal(
        buildApiUrl('https://proxy.example/v1/images/generations', 'models'),
        'https://proxy.example/v1/models',
    );
    assert.throws(
        () => buildApiUrl('https://user:secret@proxy.example/v1', 'models'),
        /Do not embed credentials/,
    );
});

test('buildAuthHeaders supports the two explicit authentication modes', () => {
    assert.deepEqual(buildAuthHeaders('secret'), { 'x-api-key': 'secret' });
    assert.deepEqual(buildAuthHeaders('secret', 'bearer'), { Authorization: 'Bearer secret' });
    assert.throws(() => buildAuthHeaders('', 'x-api-key'), /key is required/);
});

test('normalizeGenerationResponse validates PNG and data-URL WebP images', () => {
    assert.deepEqual(
        normalizeGenerationResponse({ data: [{ b64_json: PNG_PIXEL }] }, 'png'),
        { format: 'png', data: PNG_PIXEL, revised_prompt: null, usage: null },
    );
    assert.deepEqual(
        normalizeGenerationResponse({
            data: [{ b64_json: `data:image/webp;base64,${WEBP_SIGNATURE}` }],
            usage: { images: 1 },
        }),
        {
            format: 'webp',
            data: WEBP_SIGNATURE,
            revised_prompt: null,
            usage: { images: 1 },
        },
    );
});

test('normalizeGenerationResponse rejects forged data and image URLs', () => {
    assert.throws(
        () => normalizeGenerationResponse({ data: [{ b64_json: 'aGVsbG8=' }] }),
        /does not match the declared png format/,
    );
    assert.throws(
        () => normalizeGenerationResponse({ data: [{ url: 'https://images.example/result.png' }] }),
        /only accepts base64 image data/,
    );
});

test('describeApiError returns a bounded useful message', () => {
    assert.equal(
        describeApiError({ error: { message: 'Invalid API key' } }, 401),
        'CLIProxy request failed (401). Invalid API key',
    );
    assert.ok(describeApiError({ error: 'x'.repeat(1000) }, 400).length < 350);
});
