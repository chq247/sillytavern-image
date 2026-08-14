import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CONTEXT_ERROR_CODES,
    CONTEXT_MODES,
    CONTEXT_MODE_VALUES,
    cleanGeneratedPrompt,
    contextModeRequiresPrompt,
    normalizeContextMode,
    resolveContextPrompt,
} from './context.js';

const CHAT = [
    { is_system: true, mes: 'System-only instruction' },
    { is_user: true, name: 'User', mes: 'We enter a rain-soaked neon street.' },
    { is_user: false, name: 'Mage', mes: 'She raises a silver staff beneath the signs.' },
];

function expectCode(code) {
    return error => {
        assert.equal(error?.name, 'ContextPromptError');
        assert.equal(error?.code, code);
        return true;
    };
}

test('exports the complete stable set of canonical context modes', () => {
    assert.deepEqual(CONTEXT_MODE_VALUES, [
        'free',
        'extend',
        'scene',
        'last',
        'raw_last',
        'character',
        'face',
        'user',
        'background',
    ]);
    assert.equal(new Set(CONTEXT_MODE_VALUES).size, Object.keys(CONTEXT_MODES).length);
});

test('normalizes canonical values, punctuation, case, and documented aliases', () => {
    const cases = new Map([
        [undefined, CONTEXT_MODES.FREE],
        ['', CONTEXT_MODES.FREE],
        [' DIRECT ', CONTEXT_MODES.FREE],
        ['free-extended', CONTEXT_MODES.EXTEND],
        ['scenario', CONTEXT_MODES.SCENE],
        ['whole story', CONTEXT_MODES.SCENE],
        ['now', CONTEXT_MODES.LAST],
        ['last-message', CONTEXT_MODES.LAST],
        ['raw', CONTEXT_MODES.RAW_LAST],
        ['raw last', CONTEXT_MODES.RAW_LAST],
        ['last-raw', CONTEXT_MODES.RAW_LAST],
        ['char', CONTEXT_MODES.CHARACTER],
        ['yourself', CONTEXT_MODES.CHARACTER],
        ['portrait', CONTEXT_MODES.FACE],
        ['selfie', CONTEXT_MODES.FACE],
        ['me', CONTEXT_MODES.USER],
        ['myself', CONTEXT_MODES.USER],
        ['bg', CONTEXT_MODES.BACKGROUND],
        ['environment', CONTEXT_MODES.BACKGROUND],
    ]);

    for (const [input, expected] of cases) {
        assert.equal(normalizeContextMode(input), expected, String(input));
    }
    assert.throws(() => normalizeContextMode('unknown-mode'), expectCode(CONTEXT_ERROR_CODES.INVALID_MODE));
});

test('only free and extend modes require an explicit user prompt', () => {
    assert.equal(contextModeRequiresPrompt('free'), true);
    assert.equal(contextModeRequiresPrompt('direct'), true);
    assert.equal(contextModeRequiresPrompt('extend'), true);
    for (const mode of CONTEXT_MODE_VALUES.filter(value => !['free', 'extend'].includes(value))) {
        assert.equal(contextModeRequiresPrompt(mode), false, mode);
    }
});

test('free mode returns the trimmed user prompt without invoking an LLM', async () => {
    let calls = 0;
    const result = await resolveContextPrompt({
        mode: 'direct',
        userPrompt: '  watercolor moonlit castle  ',
        chat: CHAT,
        generatePrompt: () => calls++,
    });
    assert.equal(result, 'watercolor moonlit castle');
    assert.equal(calls, 0);
});

test('free and extend report a stable error code when the user prompt is empty', async () => {
    await assert.rejects(
        resolveContextPrompt({ mode: 'free', userPrompt: '   ' }),
        expectCode(CONTEXT_ERROR_CODES.PROMPT_REQUIRED),
    );
    await assert.rejects(
        resolveContextPrompt({ mode: 'extend', userPrompt: null, generatePrompt: async () => 'unused' }),
        expectCode(CONTEXT_ERROR_CODES.PROMPT_REQUIRED),
    );
});

test('extend mode sends the user request to the injected LLM and cleans its reply', async () => {
    let capturedInstruction;
    let capturedMetadata;
    const result = await resolveContextPrompt({
        mode: 'extended',
        userPrompt: 'a clockwork fox',
        chat: CHAT,
        generatePrompt: async (instruction, metadata) => {
            capturedInstruction = instruction;
            capturedMetadata = metadata;
            return '```text\nPrompt: brass clockwork fox, studio lighting\n```';
        },
    });

    assert.match(capturedInstruction, /<image_request>\na clockwork fox\n<\/image_request>/);
    assert.equal(capturedMetadata.mode, CONTEXT_MODES.EXTEND);
    assert.deepEqual(capturedMetadata.chat, []);
    assert.equal(result, 'brass clockwork fox, studio lighting');
});

test('every context-backed LLM mode produces a distinct instruction and cleaned prompt', async () => {
    const modes = ['scene', 'last', 'character', 'face', 'user', 'background'];
    const instructions = new Map();

    for (const mode of modes) {
        const result = await resolveContextPrompt({
            mode,
            userPrompt: 'cinematic lighting',
            chat: CHAT,
            generatePrompt: async (instruction, metadata) => {
                instructions.set(mode, instruction);
                assert.equal(metadata.mode, mode);
                assert.equal(metadata.chat.length, 2);
                return `Image prompt: ${mode}, cinematic composition`;
            },
        });
        assert.equal(result, `${mode}, cinematic composition`);
        assert.match(instructions.get(mode), /<additional_image_requirements>\ncinematic lighting/);
    }

    assert.equal(new Set(instructions.values()).size, modes.length);
    assert.match(instructions.get('last'), /<last_chat_message>\nShe raises a silver staff beneath the signs\./);
    assert.match(instructions.get('background'), /Do not describe people, characters/i);
});

test('raw_last returns the last usable non-system message verbatim apart from edge whitespace', async () => {
    let calls = 0;
    const result = await resolveContextPrompt({
        mode: 'raw last',
        userPrompt: 'ignored for raw_last',
        chat: [
            { is_user: false, mes: ' Earlier message ' },
            { is_system: true, mes: 'Ignored system message' },
            { is_user: true, mes: '  "保留引号"\n保留换行  ' },
            { is_user: false, mes: '   ' },
        ],
        generatePrompt: () => calls++,
    });

    assert.equal(result, '"保留引号"\n保留换行');
    assert.equal(calls, 0);
});

test('context modes distinguish a missing chat array from a chat with no usable messages', async () => {
    await assert.rejects(
        resolveContextPrompt({ mode: 'scene', chat: null, generatePrompt: async () => 'unused' }),
        expectCode(CONTEXT_ERROR_CODES.CHAT_REQUIRED),
    );
    await assert.rejects(
        resolveContextPrompt({
            mode: 'raw_last',
            chat: [{ is_system: true, mes: 'system' }, { mes: '   ' }],
        }),
        expectCode(CONTEXT_ERROR_CODES.NO_USABLE_MESSAGES),
    );
});

test('LLM-backed modes report missing, failed, and empty generators with stable codes', async () => {
    await assert.rejects(
        resolveContextPrompt({ mode: 'scene', chat: CHAT }),
        expectCode(CONTEXT_ERROR_CODES.GENERATOR_REQUIRED),
    );

    const cause = new Error('upstream failed');
    await assert.rejects(
        resolveContextPrompt({
            mode: 'character',
            chat: CHAT,
            generatePrompt: async () => { throw cause; },
        }),
        error => {
            expectCode(CONTEXT_ERROR_CODES.GENERATION_FAILED)(error);
            assert.equal(error.cause, cause);
            return true;
        },
    );

    await assert.rejects(
        resolveContextPrompt({ mode: 'face', chat: CHAT, generatePrompt: async () => '```text\n  \n```' }),
        expectCode(CONTEXT_ERROR_CODES.EMPTY_GENERATED_PROMPT),
    );
});

test('cleanGeneratedPrompt removes common wrappers while preserving Unicode and internal quotes', () => {
    assert.equal(
        cleanGeneratedPrompt('```json\n{"prompt":"银发法师, 雨夜霓虹, cinematic lighting"}\n```'),
        '银发法师, 雨夜霓虹, cinematic lighting',
    );
    assert.equal(
        cleanGeneratedPrompt('“提示词：\n- 红色围巾\n- 写着 "OPEN" 的霓虹灯”'),
        '红色围巾, 写着 "OPEN" 的霓虹灯',
    );
    assert.equal(
        cleanGeneratedPrompt({ choices: [{ message: { content: 'Tags: forest  ,  mist,, dawn' } }] }),
        'forest, mist, dawn',
    );
    assert.equal(cleanGeneratedPrompt(null), '');
});
