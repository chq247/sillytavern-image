export const MIN_GENERATION_TIMEOUT_MINUTES = 1;
export const MAX_GENERATION_TIMEOUT_MINUTES = 60;
export const DEFAULT_GENERATION_TIMEOUT_MINUTES = 10;

export function normalizeGenerationTimeoutMinutes(value) {
    if (value === null || value === undefined || String(value).trim() === '') {
        return DEFAULT_GENERATION_TIMEOUT_MINUTES;
    }

    const minutes = Number(value);
    if (!Number.isFinite(minutes)) return DEFAULT_GENERATION_TIMEOUT_MINUTES;

    return Math.min(
        MAX_GENERATION_TIMEOUT_MINUTES,
        Math.max(MIN_GENERATION_TIMEOUT_MINUTES, Math.round(minutes)),
    );
}

export function getGenerationTimeoutMilliseconds(value) {
    return normalizeGenerationTimeoutMinutes(value) * 60_000;
}
