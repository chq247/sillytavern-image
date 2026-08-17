import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildApiUrl,
    buildAuthHeaders,
    buildGenerationRequestBody,
    describeApiError,
    getGrokAspectRatio,
    getGrokResolution,
    isGrokImageModel,
    normalizeGenerationResponse,
} from './api.js';

const PNG_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const WEBP_SIGNATURE = 'UklGRgAAAABXRUJQ';
const JPEG_HEADER = '/9j/4AAQSkZJRg';

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

test('isGrokImageModel recognizes grok model ids only', () => {
    assert.equal(isGrokImageModel('grok-imagine-image'), true);
    assert.equal(isGrokImageModel('Grok-Imagine-Image-Pro'), true);
    assert.equal(isGrokImageModel('gpt-image-2'), false);
    assert.equal(isGrokImageModel(''), false);
});

test('buildGenerationRequestBody keeps the gpt-image payload for non-grok models', () => {
    assert.deepEqual(
        buildGenerationRequestBody({
            model: 'gpt-image-2',
            size: '1024x1024',
            quality: 'low',
            output_format: 'png',
        }, 'a cat'),
        {
            prompt: 'a cat',
            model: 'gpt-image-2',
            response_format: 'b64_json',
            size: '1024x1024',
            quality: 'low',
            output_format: 'png',
            n: 1,
        },
    );
});

test('buildGenerationRequestBody maps grok-imagine models to aspect ratio and resolution', () => {
    assert.deepEqual(
        buildGenerationRequestBody({
            model: 'grok-imagine-image',
            size: '1024x1536',
            quality: 'high',
            output_format: 'webp',
        }, 'a cat'),
        {
            prompt: 'a cat',
            model: 'grok-imagine-image',
            response_format: 'b64_json',
            aspect_ratio: '2:3',
            resolution: '2k',
        },
    );
});

test('buildGenerationRequestBody sends no sizing fields for non-imagine grok models', () => {
    assert.deepEqual(
        buildGenerationRequestBody({
            model: 'grok-2-image',
            size: '1024x1024',
            quality: 'low',
            output_format: 'png',
        }, 'a cat'),
        {
            prompt: 'a cat',
            model: 'grok-2-image',
            response_format: 'b64_json',
        },
    );
});

test('grok aspect ratios map to the closest supported xAI ratio', () => {
    assert.equal(getGrokAspectRatio('1024x1024'), '1:1');
    assert.equal(getGrokAspectRatio('1024x1536'), '2:3');
    assert.equal(getGrokAspectRatio('1536x1024'), '3:2');
    assert.equal(getGrokAspectRatio('1920x1088'), '16:9');
    assert.equal(getGrokAspectRatio('1088x1920'), '9:16');
    assert.equal(getGrokAspectRatio('720x1280'), '9:16');
    assert.equal(getGrokAspectRatio('not-a-size'), '1:1');
});

test('grok resolution follows the 1296x864 area threshold', () => {
    assert.equal(getGrokResolution('1024x1024'), '1k');
    assert.equal(getGrokResolution('1280x720'), '1k');
    assert.equal(getGrokResolution('1920x1088'), '2k');
    assert.equal(getGrokResolution('1088x1920'), '2k');
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

test('normalizeGenerationResponse accepts raw JPEG data with a jpeg fallback', () => {
    assert.deepEqual(
        normalizeGenerationResponse({ data: [{ b64_json: JPEG_HEADER }] }, 'jpeg'),
        { format: 'jpeg', data: JPEG_HEADER, revised_prompt: null, usage: null },
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
