const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
const SUPPORTED_FORMATS = new Set(['png', 'jpeg', 'webp']);
const GROK_IMAGINE_RESOLUTION_THRESHOLD = 1296 * 864;
const GROK_ASPECT_RATIOS = new Map([
    ['1:1', 1],
    ['3:4', 3 / 4],
    ['4:3', 4 / 3],
    ['9:16', 9 / 16],
    ['16:9', 16 / 9],
    ['2:3', 2 / 3],
    ['3:2', 3 / 2],
    ['9:19.5', 9 / 19.5],
    ['19.5:9', 19.5 / 9],
    ['9:20', 9 / 20],
    ['20:9', 20 / 9],
    ['1:2', 1 / 2],
    ['2:1', 2 / 1],
]);

export function buildApiUrl(baseUrl, resource) {
    let url;
    try {
        url = new URL(String(baseUrl || '').trim());
    } catch {
        throw new Error('CLIProxy Base URL is invalid.');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('CLIProxy Base URL must use HTTP or HTTPS.');
    }

    if (url.username || url.password) {
        throw new Error('Do not embed credentials in the CLIProxy Base URL.');
    }

    let apiPath = url.pathname.replace(/\/+$/, '');
    apiPath = apiPath.replace(/\/v1\/(?:models|images\/generations)$/i, '/v1');
    if (!/\/v1$/i.test(apiPath)) {
        apiPath = `${apiPath}/v1`;
    }

    const normalizedResource = String(resource || '').replace(/^\/+/, '');
    url.pathname = `${apiPath}/${normalizedResource}`.replace(/\/{2,}/g, '/');
    url.search = '';
    url.hash = '';
    return url.toString();
}

export function buildAuthHeaders(apiKey, authMode = 'x-api-key') {
    const key = String(apiKey || '').trim();
    if (!key) throw new Error('CLIProxy API key is required.');

    if (authMode === 'x-api-key') return { 'x-api-key': key };
    if (authMode === 'bearer') return { Authorization: `Bearer ${key}` };
    throw new Error('Authentication mode must be x-api-key or bearer.');
}

export function isGrokImageModel(model) {
    return /^grok/i.test(String(model || '').trim());
}

export function isGrokImagineModel(model) {
    return /grok-imagine/i.test(String(model || '').trim());
}

function parseImageSize(size) {
    const match = /^(\d+)\s*x\s*(\d+)$/i.exec(String(size || '').trim());
    if (!match) return { width: 1024, height: 1024 };
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return { width: 1024, height: 1024 };
    }
    return { width, height };
}

export function getGrokAspectRatio(size) {
    const { width, height } = parseImageSize(size);
    const aspectRatio = width / height;
    let closest = '1:1';
    let minDiff = Number.POSITIVE_INFINITY;
    for (const [label, ratio] of GROK_ASPECT_RATIOS) {
        const diff = Math.abs(aspectRatio - ratio);
        if (diff < minDiff) {
            minDiff = diff;
            closest = label;
        }
    }
    return closest;
}

export function getGrokResolution(size) {
    const { width, height } = parseImageSize(size);
    return width * height > GROK_IMAGINE_RESOLUTION_THRESHOLD ? '2k' : '1k';
}

export function buildGenerationRequestBody(settings, prompt) {
    const model = String(settings?.model || '').trim();
    const body = {
        prompt: String(prompt || ''),
        model,
        response_format: 'b64_json',
    };

    if (isGrokImageModel(model)) {
        if (isGrokImagineModel(model)) {
            body.aspect_ratio = getGrokAspectRatio(settings?.size);
            body.resolution = getGrokResolution(settings?.size);
        }
        return body;
    }

    body.size = settings?.size;
    body.quality = settings?.quality;
    body.output_format = settings?.output_format;
    body.n = 1;
    return body;
}

export function normalizeGenerationResponse(payload, fallbackFormat = 'png') {
    const choice = payload?.data?.[0];
    if (!choice || typeof choice !== 'object') {
        throw new Error('CLIProxy response did not contain data[0].');
    }

    if (typeof choice.b64_json !== 'string' || !choice.b64_json) {
        if (typeof choice.url === 'string' && choice.url) {
            throw new Error('CLIProxy returned an image URL; this extension only accepts base64 image data.');
        }
        throw new Error('CLIProxy response did not contain base64 image data.');
    }

    const dataUrlMatch = choice.b64_json.match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/is);
    const format = normalizeImageFormat(dataUrlMatch?.[1] || fallbackFormat);
    const data = normalizeBase64Image(dataUrlMatch?.[2] || choice.b64_json, format);
    return {
        format,
        data,
        revised_prompt: choice.revised_prompt ?? null,
        usage: payload?.usage ?? null,
    };
}

export function describeApiError(payload, status) {
    const rawError = payload?.error;
    const detail = typeof rawError === 'string'
        ? rawError
        : rawError?.message || payload?.message || '';
    const suffix = detail ? ` ${String(detail).slice(0, 300)}` : '';
    return `CLIProxy request failed (${status}).${suffix}`;
}

function normalizeBase64Image(value, format) {
    const normalized = String(value).replace(/\s+/g, '');
    if (!normalized || normalized.length % 4 === 1 || !/^[a-z0-9+/]*={0,2}$/i.test(normalized)) {
        throw new Error('CLIProxy returned invalid base64 image data.');
    }

    const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
    const decodedBytes = Math.floor(normalized.length * 3 / 4) - padding;
    if (decodedBytes > MAX_IMAGE_BYTES) {
        throw new Error('Generated image exceeded the 40 MB safety limit.');
    }

    let binaryHeader;
    try {
        const prefix = normalized.slice(0, 32);
        binaryHeader = atob(prefix + '='.repeat((4 - prefix.length % 4) % 4));
    } catch {
        throw new Error('CLIProxy returned invalid base64 image data.');
    }

    const bytes = Uint8Array.from(binaryHeader, character => character.charCodeAt(0));
    assertImageSignature(bytes, format);
    return normalized;
}

function normalizeImageFormat(format) {
    const normalized = String(format).toLowerCase().split(';')[0];
    if (normalized === 'jpg') return 'jpeg';
    if (SUPPORTED_FORMATS.has(normalized)) return normalized;
    throw new Error(`Unsupported generated image format: ${normalized || 'unknown'}.`);
}

function assertImageSignature(bytes, format) {
    const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
    const matches = format === 'png'
        ? bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === 'PNG'
            && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
        : format === 'jpeg'
            ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
            : format === 'webp'
                ? bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
                : false;

    if (!matches) {
        throw new Error(`Generated image data does not match the declared ${format} format.`);
    }
}
