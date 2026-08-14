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
    ui_language: 'auto',
    base_url: '',
    auth_mode: 'x-api-key',
    persist_api_key: false,
    api_key: '',
    model: 'gpt-image-2',
    size: '1024x1024',
    quality: 'low',
    output_format: 'png',
});
const TRANSLATIONS = Object.freeze({
    en: {
        title: 'CLIProxy Plus Image (Direct)',
        interface_language: 'Interface language',
        language_auto: 'Auto',
        language_chinese: '中文',
        language_english: 'English',
        security_notice: 'This extension sends requests directly from your browser. The API key is visible to browser scripts and DevTools. Use only a revocable CLIProxy client key—never a ChatGPT OAuth token or cookie.',
        base_url: 'CLIProxy Base URL',
        base_url_placeholder: 'https://proxy.example/v1',
        authentication: 'Authentication',
        auth_x_api_key: 'x-api-key (recommended)',
        auth_bearer: 'Authorization: Bearer',
        client_key: 'CLIProxy client key',
        client_key_placeholder: 'Client API key',
        remember_key: 'Remember key in SillyTavern settings (plaintext)',
        clear_key: 'Clear key',
        key_memory_hint: 'When “Remember” is off, the key stays only in page memory and is cleared on reload.',
        model: 'Model',
        size: 'Size',
        quality: 'Quality',
        quality_low: 'Low',
        quality_medium: 'Medium',
        quality_high: 'High',
        quality_auto: 'Auto',
        format: 'Format',
        prompt: 'Prompt',
        prompt_placeholder: 'Describe the image to generate',
        generate: 'Generate',
        cancel: 'Cancel',
        test_connection: 'Test connection',
        slash_command: 'Slash command:',
        enter_prompt: 'Enter an image prompt first.',
        open_chat: 'Open a character or group chat before generating an image.',
        generating: 'Generating an image through CLIProxyAPI...',
        generated: 'Image generated.',
        generated_message: 'Generated image: {prompt}',
        generation_in_progress: 'An image is already being generated in this tab.',
        generation_cancelled: 'Image generation was cancelled or timed out.',
        chat_changed: 'The active chat changed while the image was being generated.',
        browser_unreachable: 'Browser could not reach CLIProxy. Check CORS, HTTPS mixed-content rules, URL, and network access.',
        enter_key: 'Enter a CLIProxy client API key.',
        mixed_content: 'Blocked mixed content: use HTTPS for CLIProxy.',
        plaintext_warning: 'Warning: the key and prompts will cross the network over plaintext HTTP.',
        configuration_ready: 'Configuration is ready. Use Test connection to verify it.',
        testing_connection: 'Testing CLIProxy connection...',
        connected_no_models: 'Connected, but no gpt-image model was advertised.',
        connected_models: 'Connected. Image models: {models}',
        connection_timeout: 'Connection test timed out.',
        browser_request_failed: 'Browser request failed. Check CORS, HTTPS, URL, and network access.',
        slash_help: '<code>/plus-image prompt</code> — generate an image by calling CLIProxyAPI directly from the browser.',
        slash_returns: 'URL of the generated image, or an empty string if generation failed',
        error_invalid_url: 'CLIProxy Base URL is invalid.',
        error_url_protocol: 'CLIProxy Base URL must use HTTP or HTTPS.',
        error_url_credentials: 'Do not embed credentials in the CLIProxy Base URL.',
        error_key_required: 'CLIProxy API key is required.',
        error_auth_mode: 'Authentication mode must be x-api-key or bearer.',
    },
    zh: {
        title: 'CLIProxy Plus 生图（浏览器直连）',
        interface_language: '界面语言',
        language_auto: '自动',
        language_chinese: '中文',
        language_english: 'English',
        security_notice: '本扩展会从浏览器直接发送请求。API 密钥可被浏览器脚本和开发者工具读取。只能使用可随时轮换的 CLIProxy 客户端密钥，绝不要填写 ChatGPT OAuth Token 或 Cookie。',
        base_url: 'CLIProxy 基础地址',
        base_url_placeholder: 'https://proxy.example/v1',
        authentication: '认证方式',
        auth_x_api_key: 'x-api-key（推荐）',
        auth_bearer: 'Authorization: Bearer',
        client_key: 'CLIProxy 客户端密钥',
        client_key_placeholder: '客户端 API 密钥',
        remember_key: '将密钥记住到 SillyTavern 设置中（明文）',
        clear_key: '清除密钥',
        key_memory_hint: '未勾选“记住密钥”时，密钥只保存在当前页面内存中，刷新后清除。',
        model: '模型',
        size: '图片尺寸',
        quality: '图片质量',
        quality_low: '低',
        quality_medium: '中',
        quality_high: '高',
        quality_auto: '自动',
        format: '图片格式',
        prompt: '提示词',
        prompt_placeholder: '描述要生成的图片',
        generate: '生成图片',
        cancel: '取消',
        test_connection: '测试连接',
        slash_command: '斜杠命令：',
        enter_prompt: '请先输入图片提示词。',
        open_chat: '请先打开一个角色聊天或群聊。',
        generating: '正在通过 CLIProxyAPI 生成图片……',
        generated: '图片生成成功。',
        generated_message: '生成的图片：{prompt}',
        generation_in_progress: '当前标签页已有图片生成任务正在运行。',
        generation_cancelled: '图片生成已取消或超时。',
        chat_changed: '生成图片期间活动聊天发生了变化。',
        browser_unreachable: '浏览器无法连接 CLIProxy。请检查 CORS、HTTPS 混合内容限制、地址和网络连接。',
        enter_key: '请输入 CLIProxy 客户端 API 密钥。',
        mixed_content: '混合内容已被阻止：请同时为 CLIProxy 使用 HTTPS。',
        plaintext_warning: '警告：密钥和提示词将通过明文 HTTP 在网络上传输。',
        configuration_ready: '配置已就绪，请点击“测试连接”进行验证。',
        testing_connection: '正在测试 CLIProxy 连接……',
        connected_no_models: '连接成功，但模型列表中没有 gpt-image 模型。',
        connected_models: '连接成功。图片模型：{models}',
        connection_timeout: '连接测试超时。',
        browser_request_failed: '浏览器请求失败。请检查 CORS、HTTPS、地址和网络连接。',
        slash_help: '<code>/plus-image 提示词</code> — 从浏览器直接调用 CLIProxyAPI 生成图片。',
        slash_returns: '返回生成图片的 URL；生成失败时返回空字符串',
        error_invalid_url: 'CLIProxy 基础地址无效。',
        error_url_protocol: 'CLIProxy 基础地址必须使用 HTTP 或 HTTPS。',
        error_url_credentials: '不要在 CLIProxy 基础地址中嵌入用户名或密码。',
        error_key_required: '必须填写 CLIProxy API 密钥。',
        error_auth_mode: '认证方式必须是 x-api-key 或 bearer。',
    },
});
const KNOWN_ERROR_KEYS = Object.freeze({
    'CLIProxy Base URL is invalid.': 'error_invalid_url',
    'CLIProxy Base URL must use HTTP or HTTPS.': 'error_url_protocol',
    'Do not embed credentials in the CLIProxy Base URL.': 'error_url_credentials',
    'CLIProxy API key is required.': 'error_key_required',
    'Authentication mode must be x-api-key or bearer.': 'error_auth_mode',
});

let generationInProgress = false;
let activeGenerationController = null;
let volatileApiKey = '';
let registeredSlashCommand = null;

function getLanguage() {
    const selected = String(getSettings().ui_language || 'auto').toLowerCase();
    if (selected === 'zh' || selected === 'en') return selected;
    const browserLanguage = document.documentElement.lang || navigator.language || 'en';
    return String(browserLanguage).toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function tr(key, replacements = {}) {
    const language = getLanguage();
    const template = TRANSLATIONS[language]?.[key] ?? TRANSLATIONS.en[key] ?? key;
    return String(template).replace(/\{([a-z0-9_]+)\}/gi, (_match, name) => String(replacements[name] ?? `{${name}}`));
}

function formatError(error) {
    const message = error instanceof Error ? error.message : String(error);
    const translationKey = KNOWN_ERROR_KEYS[message];
    return translationKey ? tr(translationKey) : message;
}

function applyTranslations() {
    const root = $('#cli_proxy_image_direct_settings');
    root.find('[data-cli-i18n]').each(function () {
        $(this).text(tr(String($(this).attr('data-cli-i18n'))));
    });
    root.find('[data-cli-i18n-placeholder]').each(function () {
        $(this).attr('placeholder', tr(String($(this).attr('data-cli-i18n-placeholder'))));
    });
    if (registeredSlashCommand) {
        registeredSlashCommand.helpString = tr('slash_help');
        registeredSlashCommand.returns = tr('slash_returns');
    }
}

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
        throw new Error(tr('mixed_content'));
    }

    return {
        url,
        headers: buildAuthHeaders(getApiKey(), settings.auth_mode),
    };
}

async function requestImage(prompt) {
    if (generationInProgress) throw new Error(tr('generation_in_progress'));

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
            throw new Error(tr('generation_cancelled'));
        }
        if (error instanceof TypeError) {
            throw new Error(tr('browser_unreachable'));
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
        toastr.warning(tr('enter_prompt'), tr('title'), { escapeHtml: true });
        return '';
    }

    const initialContext = getContext();
    const hasSelectedConversation = hasGroupChat(initialContext)
        || (initialContext.characterId !== undefined && initialContext.characterId !== null);
    const chatId = getCurrentChatId();
    if (!hasSelectedConversation || chatId === undefined || chatId === null || chatId === '') {
        toastr.warning(tr('open_chat'), tr('title'), { escapeHtml: true });
        return '';
    }

    toastr.info(tr('generating'), tr('title'), { escapeHtml: true });
    const result = await requestImage(normalizedPrompt);
    const context = getContext();
    if (chatId !== getCurrentChatId()) {
        throw new Error(tr('chat_changed'));
    }

    const characterName = hasGroupChat(context) ? String(context.groupId) : context.name2;
    const filename = `cli_proxy_plus_${Date.now()}`;
    const imageUrl = await saveBase64AsFile(result.data, characterName, filename, result.format);
    await appendImageMessage(context, normalizedPrompt, imageUrl);
    toastr.success(tr('generated'), tr('title'), { escapeHtml: true });
    return imageUrl;
}

async function appendImageMessage(context, prompt, imageUrl) {
    const message = {
        name: hasGroupChat(context) ? systemUserName : (context.name2 || 'Assistant'),
        is_user: false,
        is_system: false,
        send_date: getMessageTimeStamp(),
        mes: tr('generated_message', { prompt }),
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
            setStatus(tr('enter_key'), 'warning');
            return;
        }
        const parsedUrl = new URL(url);
        if (location.protocol === 'https:' && parsedUrl.protocol === 'http:') {
            setStatus(tr('mixed_content'), 'failure');
            return;
        }
        if (parsedUrl.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname)) {
            setStatus(tr('plaintext_warning'), 'warning');
            return;
        }
        setStatus(tr('configuration_ready'), 'success');
    } catch (error) {
        setStatus(formatError(error), 'failure');
    }
}

async function testConnection() {
    const button = $('#cli_proxy_image_direct_test');
    button.prop('disabled', true);
    setStatus(tr('testing_connection'));
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
            setStatus(tr('connected_no_models'), 'warning');
            return;
        }
        setStatus(tr('connected_models', { models: imageModels.join(', ') }), 'success');
    } catch (error) {
        const message = error?.name === 'AbortError'
            ? tr('connection_timeout')
            : error instanceof TypeError
                ? tr('browser_request_failed')
                : formatError(error);
        setStatus(message, 'failure');
    } finally {
        clearTimeout(timeout);
        button.prop('disabled', false);
    }
}

function bindSettings() {
    const settings = getSettings();
    $('#cli_proxy_image_direct_language').val(settings.ui_language).on('change', function () {
        settings.ui_language = String($(this).val());
        saveSettingsDebounced();
        applyTranslations();
        refreshConfigurationStatus();
    });
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
                formatError(error),
                tr('title'),
                { escapeHtml: true },
            );
        }
    });
}

function registerSlashCommand() {
    registeredSlashCommand = SlashCommand.fromProps({
        name: 'plus-image',
        aliases: ['pimg', 'cli-proxy-image'],
        returns: tr('slash_returns'),
        helpString: tr('slash_help'),
        unnamedArgumentList: [
            new SlashCommandArgument('prompt', [ARGUMENT_TYPE.STRING], true),
        ],
        callback: async (_args, value) => {
            try {
                return await generateAndPost(value);
            } catch (error) {
                console.error('[cli-proxy-image-direct] Generation failed:', error);
                toastr.error(
                    formatError(error),
                    tr('title'),
                    { escapeHtml: true },
                );
                return '';
            }
        },
    });
    SlashCommandParser.addCommandObject(registeredSlashCommand);
}

jQuery(async () => {
    getSettings();
    const settingsHtml = await renderExtensionTemplateAsync(EXTENSION_PATH, 'settings');
    $('#extensions_settings2').append(settingsHtml);
    bindSettings();
    applyTranslations();
    registerSlashCommand();
    refreshConfigurationStatus();
});
