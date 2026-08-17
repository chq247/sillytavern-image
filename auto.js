/**
 * Pure helpers for automatic post-reply image generation.
 *
 * This module deliberately has no browser or SillyTavern imports. The browser
 * adapter passes the current snapshot (settings, received message, busy flags)
 * into `isAutoGenerationEligible` and owns the actual generation call.
 */

import { CONTEXT_MODES } from './context.js';

export const AUTO_CONTEXT_MODES = Object.freeze([
    CONTEXT_MODES.SCENE,
    CONTEXT_MODES.LAST,
    CONTEXT_MODES.CHARACTER,
    CONTEXT_MODES.FACE,
    CONTEXT_MODES.USER,
    CONTEXT_MODES.BACKGROUND,
]);

export const AUTO_COOLDOWN_OPTIONS = Object.freeze([0, 15, 30, 60, 120, 300, 600]);
export const DEFAULT_AUTO_CONTEXT_MODE = CONTEXT_MODES.CHARACTER;
export const DEFAULT_AUTO_COOLDOWN_SECONDS = 60;

/**
 * Normalize a saved auto-generation prompt source. Unlike the manual context
 * mode, empty or unsupported values fall back to the default instead of
 * throwing, because auto generation is never started by explicit user input.
 *
 * @param {unknown} value Saved mode value.
 * @returns {string} One of AUTO_CONTEXT_MODES.
 */
export function normalizeAutoContextMode(value) {
    const mode = String(value ?? '').trim().toLowerCase();
    return AUTO_CONTEXT_MODES.includes(mode) ? mode : DEFAULT_AUTO_CONTEXT_MODE;
}

export function normalizeAutoCooldownSeconds(value) {
    const seconds = Number(value);
    return AUTO_COOLDOWN_OPTIONS.includes(seconds) ? seconds : DEFAULT_AUTO_COOLDOWN_SECONDS;
}

/**
 * Decide whether a received chat message should start an automatic generation.
 * All rejection reasons are silent by design: auto failures must never block
 * or spam the normal chat flow.
 *
 * @param {object} options
 * @param {boolean} [options.enabled] Auto-generation master switch.
 * @param {boolean} [options.busy] A manual or automatic generation is running or scheduled.
 * @param {unknown} [options.type] SillyTavern message event type
 * (`normal`, `continue`, `swipe`, `first_message`, `extension`, ...).
 * @param {unknown} [options.message] The received chat message object.
 * @param {number} [options.now] Current epoch milliseconds.
 * @param {number} [options.lastGenerationAt] Epoch milliseconds of the last auto trigger.
 * @param {number} [options.cooldownSeconds] Minimum interval between auto generations.
 * @param {boolean} [options.allowFirstMessage] Trigger for a chat's first message.
 * @returns {boolean}
 */
export function isAutoGenerationEligible({
    enabled = false,
    busy = false,
    type = '',
    message = null,
    now = Date.now(),
    lastGenerationAt = 0,
    cooldownSeconds = DEFAULT_AUTO_COOLDOWN_SECONDS,
    allowFirstMessage = false,
} = {}) {
    if (!enabled) return false;
    if (busy) return false;

    const eventType = String(type || '');
    if (eventType === 'extension') return false;
    if (eventType === 'first_message' && !allowFirstMessage) return false;

    if (!message || typeof message !== 'object') return false;
    if (message.is_user || message.is_system) return false;
    if (Array.isArray(message.extra?.media) && message.extra.media.length > 0) return false;
    if (!String(message.mes ?? '').trim()) return false;

    if (cooldownSeconds > 0 && now - lastGenerationAt < cooldownSeconds * 1000) return false;
    return true;
}
