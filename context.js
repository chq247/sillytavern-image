/**
 * Pure prompt-resolution helpers for context-aware image generation.
 *
 * This module deliberately has no browser or SillyTavern imports. Callers pass
 * the current chat snapshot and inject the LLM function used to expand a
 * context instruction into a text-to-image prompt.
 */

export const CONTEXT_MODES = Object.freeze({
    FREE: 'free',
    EXTEND: 'extend',
    SCENE: 'scene',
    LAST: 'last',
    RAW_LAST: 'raw_last',
    CHARACTER: 'character',
    FACE: 'face',
    USER: 'user',
    BACKGROUND: 'background',
});

export const CONTEXT_MODE_VALUES = Object.freeze(Object.values(CONTEXT_MODES));

export const CONTEXT_ERROR_CODES = Object.freeze({
    INVALID_MODE: 'CONTEXT_INVALID_MODE',
    PROMPT_REQUIRED: 'CONTEXT_PROMPT_REQUIRED',
    CHAT_REQUIRED: 'CONTEXT_CHAT_REQUIRED',
    NO_USABLE_MESSAGES: 'CONTEXT_NO_USABLE_MESSAGES',
    // Backwards-compatible singular spelling for early integration drafts.
    NO_USABLE_MESSAGE: 'CONTEXT_NO_USABLE_MESSAGES',
    GENERATOR_REQUIRED: 'CONTEXT_GENERATOR_REQUIRED',
    GENERATION_FAILED: 'CONTEXT_GENERATION_FAILED',
    EMPTY_GENERATED_PROMPT: 'CONTEXT_EMPTY_GENERATED_PROMPT',
});

const MODE_ALIASES = Object.freeze({
    free: CONTEXT_MODES.FREE,
    direct: CONTEXT_MODES.FREE,
    manual: CONTEXT_MODES.FREE,
    prompt: CONTEXT_MODES.FREE,

    extend: CONTEXT_MODES.EXTEND,
    extended: CONTEXT_MODES.EXTEND,
    free_extend: CONTEXT_MODES.EXTEND,
    free_extended: CONTEXT_MODES.EXTEND,

    scene: CONTEXT_MODES.SCENE,
    scenario: CONTEXT_MODES.SCENE,
    story: CONTEXT_MODES.SCENE,
    whole_story: CONTEXT_MODES.SCENE,

    last: CONTEXT_MODES.LAST,
    now: CONTEXT_MODES.LAST,
    last_message: CONTEXT_MODES.LAST,

    raw: CONTEXT_MODES.RAW_LAST,
    raw_last: CONTEXT_MODES.RAW_LAST,
    last_raw: CONTEXT_MODES.RAW_LAST,
    verbatim: CONTEXT_MODES.RAW_LAST,
    verbatim_last: CONTEXT_MODES.RAW_LAST,

    character: CONTEXT_MODES.CHARACTER,
    char: CONTEXT_MODES.CHARACTER,
    you: CONTEXT_MODES.CHARACTER,
    yourself: CONTEXT_MODES.CHARACTER,

    face: CONTEXT_MODES.FACE,
    portrait: CONTEXT_MODES.FACE,
    selfie: CONTEXT_MODES.FACE,

    user: CONTEXT_MODES.USER,
    me: CONTEXT_MODES.USER,
    myself: CONTEXT_MODES.USER,

    background: CONTEXT_MODES.BACKGROUND,
    bg: CONTEXT_MODES.BACKGROUND,
    scenery: CONTEXT_MODES.BACKGROUND,
    surroundings: CONTEXT_MODES.BACKGROUND,
    environment: CONTEXT_MODES.BACKGROUND,
});

const MODE_INSTRUCTIONS = Object.freeze({
    [CONTEXT_MODES.EXTEND]: [
        'Rewrite the image request below as one detailed, visually concrete text-to-image prompt.',
        'Preserve the requested subject and intent. Add useful visible details such as composition, environment, lighting, camera, and style.',
        'Return only the final image prompt, with no explanation, heading, quotation marks, or Markdown.',
    ].join(' '),
    [CONTEXT_MODES.SCENE]: [
        'Using the current chat as source material, describe the current scene as one standalone text-to-image prompt.',
        'Include the location, visible characters, physical appearances, actions, relative positions, composition, lighting, and atmosphere supported by the chat.',
        'Do not continue the story or include dialogue, thoughts, or other non-visual details.',
        'Return only the final image prompt, with no explanation, heading, quotation marks, or Markdown.',
    ].join(' '),
    [CONTEXT_MODES.LAST]: [
        'Turn only the last usable chat message into one standalone text-to-image prompt.',
        'Describe visible subjects, actions, environment, composition, lighting, and camera perspective.',
        'Ignore dialogue, thoughts, personality, scents, and other details that cannot be seen in a still image.',
        'Return only the final image prompt, with no explanation, heading, quotation marks, or Markdown.',
    ].join(' '),
    [CONTEXT_MODES.CHARACTER]: [
        'Using the current chat as source material, describe the main assistant character as a detailed full-body portrait.',
        'Include visible species or race, gender presentation, age, clothing, occupation cues, hair, face, body, and distinctive physical features supported by the chat.',
        'Exclude personality, thoughts, dialogue, scents, and actions that are not useful to a still portrait.',
        'Return only the final image prompt, with no explanation, heading, quotation marks, or Markdown.',
    ].join(' '),
    [CONTEXT_MODES.FACE]: [
        'Using the current chat as source material, describe the main assistant character as a detailed close-up facial portrait.',
        'Include visible species or race, age, facial features, expression, eyes, hair, hair accessories, and upper-body clothing supported by the chat.',
        'Do not describe anything below the upper body or include personality, thoughts, dialogue, or scents.',
        'Return only the final image prompt, with no explanation, heading, quotation marks, or Markdown.',
    ].join(' '),
    [CONTEXT_MODES.USER]: [
        'Using the current chat as source material, describe the user persona as a detailed full-body portrait.',
        'Include visible species or race, gender presentation, age, clothing, occupation cues, hair, face, body, and distinctive physical features supported by the chat.',
        'Exclude personality, thoughts, dialogue, scents, and actions that are not useful to a still portrait.',
        'Return only the final image prompt, with no explanation, heading, quotation marks, or Markdown.',
    ].join(' '),
    [CONTEXT_MODES.BACKGROUND]: [
        'Using the current chat as source material, describe only the current environment as one detailed background image prompt.',
        'Include location, architecture or landscape, time of day, weather, lighting, objects, depth, composition, and atmosphere supported by the chat.',
        'Do not describe people, characters, dialogue, thoughts, or other non-visual details.',
        'Return only the final image prompt, with no explanation, heading, quotation marks, or Markdown.',
    ].join(' '),
});

/**
 * Normalize a context mode or one of its documented aliases.
 * Empty values intentionally retain the backwards-compatible free mode.
 *
 * @param {unknown} mode Mode or alias.
 * @returns {string} Canonical mode.
 */
export function normalizeContextMode(mode) {
    if (mode === undefined || mode === null || String(mode).trim() === '') {
        return CONTEXT_MODES.FREE;
    }

    const key = String(mode)
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    const normalized = MODE_ALIASES[key];
    if (!normalized) {
        throw createContextError(
            CONTEXT_ERROR_CODES.INVALID_MODE,
            `Unsupported image context mode: ${String(mode)}`,
        );
    }
    return normalized;
}

/**
 * Whether the mode needs text supplied by the user to start generation.
 * Other modes may still use an optional user prompt as an extra constraint.
 *
 * @param {unknown} mode Mode or alias.
 * @returns {boolean}
 */
export function contextModeRequiresPrompt(mode) {
    const normalized = normalizeContextMode(mode);
    return normalized === CONTEXT_MODES.FREE || normalized === CONTEXT_MODES.EXTEND;
}

/**
 * Resolve a direct or context-aware image prompt.
 *
 * `generatePrompt` is only called for LLM-backed modes. It receives the quiet
 * instruction as its first argument and plain metadata as its second argument.
 * This keeps the module testable while allowing the browser adapter to call
 * SillyTavern's `generateQuietPrompt({ quietPrompt })`.
 *
 * @param {object} options
 * @param {unknown} [options.mode='free'] Mode or alias.
 * @param {unknown} [options.userPrompt=''] Optional user-entered prompt.
 * @param {unknown[]} [options.chat=[]] Current SillyTavern chat snapshot.
 * @param {(instruction:string, metadata:object)=>unknown|Promise<unknown>} [options.generatePrompt] Injected LLM generator.
 * @returns {Promise<string>} Final prompt ready for the image endpoint.
 */
export async function resolveContextPrompt({
    mode = CONTEXT_MODES.FREE,
    userPrompt = '',
    chat = [],
    generatePrompt,
} = {}) {
    const normalizedMode = normalizeContextMode(mode);
    const normalizedUserPrompt = String(userPrompt ?? '').trim();

    if (contextModeRequiresPrompt(normalizedMode) && !normalizedUserPrompt) {
        throw createContextError(
            CONTEXT_ERROR_CODES.PROMPT_REQUIRED,
            `A user prompt is required for ${normalizedMode} mode.`,
        );
    }

    if (normalizedMode === CONTEXT_MODES.FREE) {
        return normalizedUserPrompt;
    }

    if (normalizedMode === CONTEXT_MODES.EXTEND) {
        return generateAndCleanPrompt({
            mode: normalizedMode,
            instruction: appendDelimitedSection(MODE_INSTRUCTIONS[normalizedMode], 'image_request', normalizedUserPrompt),
            userPrompt: normalizedUserPrompt,
            chat: [],
            generatePrompt,
        });
    }

    const usableMessages = getUsableMessages(chat);
    const lastMessage = usableMessages.at(-1);

    if (normalizedMode === CONTEXT_MODES.RAW_LAST) {
        return lastMessage.text;
    }

    let instruction = MODE_INSTRUCTIONS[normalizedMode];
    if (normalizedMode === CONTEXT_MODES.LAST) {
        instruction = appendDelimitedSection(instruction, 'last_chat_message', lastMessage.text);
    }
    if (normalizedUserPrompt) {
        instruction = appendDelimitedSection(instruction, 'additional_image_requirements', normalizedUserPrompt);
    }

    return generateAndCleanPrompt({
        mode: normalizedMode,
        instruction,
        userPrompt: normalizedUserPrompt,
        chat: usableMessages,
        generatePrompt,
    });
}

/**
 * Clean common LLM wrappers without applying the built-in SD extension's
 * ASCII-only filter. Unicode prompts, including Chinese, are preserved.
 *
 * @param {unknown} response LLM response or a common structured wrapper.
 * @returns {string}
 */
export function cleanGeneratedPrompt(response) {
    let text = extractGeneratedText(response).replace(/^\uFEFF/, '').trim();
    if (!text) return '';

    const fenced = text.match(/^```(?:json|text|markdown)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i);
    if (fenced) text = fenced[1].trim();

    const jsonText = extractJsonPrompt(text);
    if (jsonText !== null) text = jsonText.trim();

    text = stripWrappingQuotes(text.trim());
    text = stripPromptLabel(text);
    text = stripWrappingQuotes(text.trim());

    const lines = text
        .split(/\r?\n+/)
        .map(line => line.replace(/^\s*(?:[-*•]+|\d+[.)])\s+/, '').trim())
        .filter(Boolean);
    text = lines.join(lines.length > 1 ? ', ' : '');

    return text
        .replace(/\s+/gu, ' ')
        .replace(/\s*,\s*/g, ', ')
        .replace(/(?:,\s*){2,}/g, ', ')
        .replace(/^,\s*|,\s*$/g, '')
        .trim();
}

function getUsableMessages(chat) {
    if (!Array.isArray(chat)) {
        throw createContextError(
            CONTEXT_ERROR_CODES.CHAT_REQUIRED,
            'A chat array is required for this context mode.',
        );
    }

    const messages = chat
        .map((message, index) => normalizeMessage(message, index))
        .filter(Boolean);
    if (!messages.length) {
        throw createContextError(
            CONTEXT_ERROR_CODES.NO_USABLE_MESSAGES,
            'No non-system chat message with text is available for this context mode.',
        );
    }
    return messages;
}

function normalizeMessage(message, index) {
    if (typeof message === 'string') {
        const text = message.trim();
        return text ? { index, text, isUser: false, name: '' } : null;
    }
    if (!message || typeof message !== 'object' || message.is_system) return null;

    const candidate = typeof message.mes === 'string'
        ? message.mes
        : typeof message.text === 'string'
            ? message.text
            : typeof message.content === 'string'
                ? message.content
                : '';
    const text = candidate.trim();
    if (!text) return null;

    return {
        index,
        text,
        isUser: Boolean(message.is_user),
        name: typeof message.name === 'string' ? message.name : '',
    };
}

async function generateAndCleanPrompt({ mode, instruction, userPrompt, chat, generatePrompt }) {
    if (typeof generatePrompt !== 'function') {
        throw createContextError(
            CONTEXT_ERROR_CODES.GENERATOR_REQUIRED,
            `An LLM prompt generator is required for ${mode} mode.`,
        );
    }

    let response;
    try {
        response = await generatePrompt(instruction, {
            mode,
            userPrompt,
            chat,
        });
    } catch (cause) {
        throw createContextError(
            CONTEXT_ERROR_CODES.GENERATION_FAILED,
            `LLM prompt generation failed for ${mode} mode.`,
            cause,
        );
    }

    const prompt = cleanGeneratedPrompt(response);
    if (!prompt) {
        throw createContextError(
            CONTEXT_ERROR_CODES.EMPTY_GENERATED_PROMPT,
            `LLM prompt generation returned no usable text for ${mode} mode.`,
        );
    }
    return prompt;
}

function appendDelimitedSection(instruction, name, value) {
    return `${instruction}\n\n<${name}>\n${value}\n</${name}>`;
}

function extractGeneratedText(response) {
    if (typeof response === 'string') return response;
    if (!response || typeof response !== 'object') return '';

    for (const key of ['prompt', 'image_prompt', 'description', 'output_text', 'text', 'content']) {
        if (typeof response[key] === 'string') return response[key];
    }

    const messageContent = response.message?.content;
    if (typeof messageContent === 'string') return messageContent;
    const choiceContent = response.choices?.[0]?.message?.content ?? response.choices?.[0]?.text;
    if (typeof choiceContent === 'string') return choiceContent;
    return '';
}

function extractJsonPrompt(text) {
    if (!/^[\[{\"]/.test(text)) return null;
    try {
        const parsed = JSON.parse(text);
        const extracted = extractGeneratedText(parsed);
        return extracted || (typeof parsed === 'string' ? parsed : null);
    } catch {
        return null;
    }
}

function stripPromptLabel(text) {
    return text.replace(
        /^\s*(?:final\s+)?(?:image\s+prompt|prompt|description|tags?|图像提示词|图片提示词|提示词|关键词)\s*[:：]\s*/iu,
        '',
    );
}

function stripWrappingQuotes(text) {
    const quotePairs = [
        ['"', '"'],
        ["'", "'"],
        ['“', '”'],
        ['‘', '’'],
    ];
    for (const [open, close] of quotePairs) {
        if (text.length >= 2 && text.startsWith(open) && text.endsWith(close)) {
            return text.slice(open.length, -close.length).trim();
        }
    }
    return text;
}

function createContextError(code, message, cause) {
    const error = cause === undefined ? new Error(message) : new Error(message, { cause });
    error.name = 'ContextPromptError';
    error.code = code;
    return error;
}
