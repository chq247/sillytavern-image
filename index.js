import {
    eventSource,
    event_types,
    getCurrentChatId,
    saveSettingsDebounced,
    systemUserName,
} from '../../../../script.js';
import {
    extension_settings,
    getContext,
    renderExtensionTemplateAsync,
} from '../../../extensions.js';
import { MEDIA_DISPLAY, MEDIA_SOURCE, MEDIA_TYPE } from '../../../constants.js';
import { getMessageTimeStamp } from '../../../RossAscends-mods.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { saveBase64AsFile } from '../../../utils.js';
import {
    buildApiUrl,
    buildAuthHeaders,
    describeApiError,
    normalizeGenerationResponse,
} from './api.js';

const MODULE_NAME = 'cli_proxy_image_direct';
const EXTENSION_FOLDER = decodeURIComponent(new URL('.', import.meta.url).pathname.split('/').filter(Boolean).at(-1));
const EXTENSION_PATH = `third-party/${EXTENSION_FOLDER}`;
const CLIENT_TIMEOUT_MS = 190_000;
const CONNECTION_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const DEFAULT_SETTINGS = Object.freeze({
    base_url: '',
    auth_mode: 'x-api-key',
    persist_api_key: false,
    api_key: '',
    model: 'gpt-image-2',
    size: '1024x1024',
    quality: 'low',
    output_format: 'png',
});

let generationInProgress = false;
let activeGenerationController = null;
let volatileApiKey = '';

function getSettings() {
    extension_settings[MODULE_NAME] ??= {};
    const settings = extension_settings[MODULE_NAME];
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (settings[key] === undefined) settings[key] = value;
    }
    return settings;
}

function getApiKey() {
    const settings = getSettings();
    return settings.persist_api_key ? String(settings.api_key || '') : volatileApiKey;
}

function storeApiKey(value) {
    const settings = getSettings();
    const key = String(value || '');
    if (settings.persist_api_key) {
        settings.api_key = key;
        volatileApiKey = '';
    } else {
        volatileApiKey = key;
        if (settings.api_key) settings.api_key = '';
    }
    saveSettingsDebounced();
}

function hasGroupChat(context) {
    return context.groupId !== undefined && context.groupId !== null && String(context.groupId) !== '';
}

function getProxyRequest(resource) {
    const settings = getSettings();
    const url = buildApiUrl(settings.base_url, resource);
    const parsedUrl = new URL(url);
    if (location.protocol === 'https:' && parsedUrl.protocol === 'http:') {
        throw new Error('HTTPS SillyTavern cannot call an HTTP CLIProxy. Use HTTPS for CLIProxy too.');
    }

    return {
        url,
        headers: buildAuthHeaders(getApiKey(), settings.auth_mode),
    };
}

async function requestImage(prompt) {
    if (generationInProgress) throw new Error('An image is already being generated in this tab.');

    generationInProgress = true;
    const controller = new AbortController();
    activeGenerationController = controller;
    const timeout = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    setBusyState(true);

    try {
        const settings = getSettings();
        const proxy = getProxyRequest('images/generations');
        const response = await fetch(proxy.url, {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
            headers: {
                ...proxy.headers,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                prompt,
                model: settings.model,
                size: settings.size,
                quality: settings.quality,
                output_format: settings.output_format,
                n: 1,
                response_format: 'b64_json',
            }),
            signal: controller.signal,
        });

        const payload = await readJsonResponse(response);
        if (!response.ok) throw new Error(describeApiError(payload, response.status));
        return normalizeGenerationResponse(payload, settings.output_format);
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error('Image generation was cancelled or timed out.');
        }
        if (error instanceof TypeError) {
            throw new Error('Browser could not reach CLIProxy. Check CORS, HTTPS mixed-content rules, URL, and network access.');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
        if (activeGenerationController === controller) activeGenerationController = null;
        generationInProgress = false;
        setBusyState(false);
    }
}

async function readJsonResponse(response) {
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        throw new Error('CLIProxy response exceeded the 64 MB safety limit.');
    }

    if (!response.body?.getReader) {
        const text = await response.text();
        if (new Blob([text]).size > MAX_RESPONSE_BYTES) {
            throw new Error('CLIProxy response exceeded the 64 MB safety limit.');
        }
        return parseJson(text, response.status);
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > MAX_RESPONSE_BYTES) {
                await reader.cancel();
                throw new Error('CLIProxy response exceeded the 64 MB safety limit.');
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock?.();
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return parseJson(new TextDecoder().decode(bytes), response.status);
}

function parseJson(text, status) {
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`CLIProxy returned a non-JSON response (${status}).`);
    }
}

async function generateAndPost(prompt) {
    const normalizedPrompt = String(prompt || '').trim();
    if (!normalizedPrompt) {
        toastr.warning('Enter an image prompt first.', 'CLIProxy Plus Image');
        return '';
    }

    const initialContext = getContext();
    const hasSelectedConversation = hasGroupChat(initialContext)
        || (initialContext.characterId !== undefined && initialContext.characterId !== null);
    const chatId = getCurrentChatId();
    if (!hasSelectedConversation || chatId === undefined || chatId === null || chatId === '') {
        toastr.warning('Open a character or group chat before generating an image.', 'CLIProxy Plus Image');
        return '';
    }

    toastr.info('Generating an image through CLIProxyAPI...', 'CLIProxy Plus Image');
    const result = await requestImage(normalizedPrompt);
    const context = getContext();
    if (chatId !== getCurrentChatId()) {
        throw new Error('The active chat changed while the image was being generated.');
    }

    const characterName = hasGroupChat(context) ? String(context.groupId) : context.name2;
    const filename = `cli_proxy_plus_${Date.now()}`;
    const imageUrl = await saveBase64AsFile(result.data, characterName, filename, result.format);
    await appendImageMessage(context, normalizedPrompt, imageUrl);
    toastr.success('Image generated.', 'CLIProxy Plus Image');
    return imageUrl;
}

async function appendImageMessage(context, prompt, imageUrl) {
    const message = {
        name: hasGroupChat(context) ? systemUserName : (context.name2 || 'Assistant'),
        is_user: false,
        is_system: false,
        send_date: getMessageTimeStamp(),
        mes: `Generated image: ${prompt}`,
        extra: {
            media: [{
                url: imageUrl,
                type: MEDIA_TYPE.IMAGE,
                title: prompt,
                source: MEDIA_SOURCE.GENERATED,
            }],
            media_display: MEDIA_DISPLAY.GALLERY,
            media_index: 0,
            inline_image: false,
        },
    };

    context.chat.push(message);
    const messageId = context.chat.length - 1;
    await eventSource.emit(event_types.MESSAGE_RECEIVED, messageId, 'extension');
    context.addOneMessage(message);
    await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, messageId, 'extension');
    await context.saveChat();
    setTimeout(() => context.scrollOnMediaLoad?.(), 100);
}

function setBusyState(isBusy) {
    $('#cli_proxy_image_direct_generate').prop('disabled', isBusy);
    $('#cli_proxy_image_direct_prompt').prop('disabled', isBusy);
    $('#cli_proxy_image_direct_cancel').prop('disabled', !isBusy);
}

function setStatus(message, className = '') {
    $('#cli_proxy_image_direct_status')
        .text(message)
        .removeClass('success failure warning')
        .addClass(className);
}

function refreshConfigurationStatus() {
    try {
        const settings = getSettings();
        const url = buildApiUrl(settings.base_url, 'images/generations');
        if (!getApiKey()) {
            setStatus('Enter a CLIProxy client API key.', 'warning');
            return;
        }
        const parsedUrl = new URL(url);
        if (location.protocol === 'https:' && parsedUrl.protocol === 'http:') {
            setStatus('Blocked mixed content: use HTTPS for CLIProxy.', 'failure');
            return;
        }
        if (parsedUrl.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname)) {
            setStatus('Warning: the key and prompts will cross the network over plaintext HTTP.', 'warning');
            return;
        }
        setStatus('Configuration is ready. Use Test connection to verify it.', 'success');
    } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), 'failure');
    }
}

async function testConnection() {
    const button = $('#cli_proxy_image_direct_test');
    button.prop('disabled', true);
    setStatus('Testing CLIProxy connection...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);

    try {
        const proxy = getProxyRequest('models');
        const response = await fetch(proxy.url, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
            headers: {
                ...proxy.headers,
                'Accept': 'application/json',
            },
            signal: controller.signal,
        });
        const payload = await readJsonResponse(response);
        if (!response.ok) throw new Error(describeApiError(payload, response.status));

        const modelIds = Array.isArray(payload?.data)
            ? payload.data.map(model => String(model?.id || '')).filter(Boolean)
            : [];
        const imageModels = modelIds.filter(id => /^(?:codex\/)?gpt-image-/i.test(id));
        if (!imageModels.length) {
            setStatus('Connected, but no gpt-image model was advertised.', 'warning');
            return;
        }
        setStatus(`Connected. Image models: ${imageModels.join(', ')}`, 'success');
    } catch (error) {
        const message = error?.name === 'AbortError'
            ? 'Connection test timed out.'
            : error instanceof TypeError
                ? 'Browser request failed. Check CORS, HTTPS, URL, and network access.'
                : error instanceof Error ? error.message : String(error);
        setStatus(message, 'failure');
    } finally {
        clearTimeout(timeout);
        button.prop('disabled', false);
    }
}

function bindSettings() {
    const settings = getSettings();
    $('#cli_proxy_image_direct_base_url').val(settings.base_url).on('input', function () {
        settings.base_url = String($(this).val());
        saveSettingsDebounced();
        refreshConfigurationStatus();
    });
    $('#cli_proxy_image_direct_auth_mode').val(settings.auth_mode).on('change', function () {
        settings.auth_mode = String($(this).val());
        saveSettingsDebounced();
        refreshConfigurationStatus();
    });
    $('#cli_proxy_image_direct_api_key').val(getApiKey()).on('input', function () {
        storeApiKey($(this).val());
        refreshConfigurationStatus();
    });
    $('#cli_proxy_image_direct_persist_key').prop('checked', settings.persist_api_key).on('change', function () {
        const key = String($('#cli_proxy_image_direct_api_key').val() || '');
        settings.persist_api_key = Boolean($(this).prop('checked'));
        if (settings.persist_api_key) {
            settings.api_key = key;
            volatileApiKey = '';
        } else {
            settings.api_key = '';
            volatileApiKey = key;
        }
        saveSettingsDebounced();
    });
    $('#cli_proxy_image_direct_clear_key').on('click', () => {
        settings.api_key = '';
        volatileApiKey = '';
        $('#cli_proxy_image_direct_api_key').val('');
        saveSettingsDebounced();
        refreshConfigurationStatus();
    });
    $('#cli_proxy_image_direct_model').val(settings.model).on('change', function () {
        settings.model = String($(this).val());
        saveSettingsDebounced();
    });
    $('#cli_proxy_image_direct_size').val(settings.size).on('change', function () {
        settings.size = String($(this).val());
        saveSettingsDebounced();
    });
    $('#cli_proxy_image_direct_quality').val(settings.quality).on('change', function () {
        settings.quality = String($(this).val());
        saveSettingsDebounced();
    });
    $('#cli_proxy_image_direct_format').val(settings.output_format).on('change', function () {
        settings.output_format = String($(this).val());
        saveSettingsDebounced();
    });
    $('#cli_proxy_image_direct_test').on('click', testConnection);
    $('#cli_proxy_image_direct_cancel').on('click', () => activeGenerationController?.abort());
    $('#cli_proxy_image_direct_generate').on('click', async () => {
        try {
            await generateAndPost($('#cli_proxy_image_direct_prompt').val());
        } catch (error) {
            console.error('[cli-proxy-image-direct] Generation failed:', error);
            toastr.error(
                error instanceof Error ? error.message : String(error),
                'CLIProxy Plus Image',
                { escapeHtml: true },
            );
        }
    });
}

function registerSlashCommand() {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'plus-image',
        aliases: ['pimg', 'cli-proxy-image'],
        returns: 'URL of the generated image, or an empty string if generation failed',
        helpString: '<code>/plus-image prompt</code> — generate an image by calling CLIProxyAPI directly from the browser.',
        unnamedArgumentList: [
            new SlashCommandArgument('prompt', [ARGUMENT_TYPE.STRING], true),
        ],
        callback: async (_args, value) => {
            try {
                return await generateAndPost(value);
            } catch (error) {
                console.error('[cli-proxy-image-direct] Generation failed:', error);
                toastr.error(
                    error instanceof Error ? error.message : String(error),
                    'CLIProxy Plus Image',
                    { escapeHtml: true },
                );
                return '';
            }
        },
    }));
}

jQuery(async () => {
    getSettings();
    const settingsHtml = await renderExtensionTemplateAsync(EXTENSION_PATH, 'settings');
    $('#extensions_settings2').append(settingsHtml);
    bindSettings();
    registerSlashCommand();
    refreshConfigurationStatus();
});
