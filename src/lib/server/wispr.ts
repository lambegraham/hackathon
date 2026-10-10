import { z } from 'zod';
import { ApiError, requireKey } from './http';

export const WISPR_SOCKET_URL = 'wss://platform-api.wisprflow.ai/api/v1/dash/client_ws';
const TOKEN_URL = 'https://platform-api.wisprflow.ai/api/v1/dash/generate_access_token';

const tokenSchema = z.object({
    access_token: z.string().trim().min(1).max(4096),
    expires_in: z.number().int().positive().max(86400)
});

/** Wispr documents two-letter ISO 639-1 codes. Swiss German is not one of them; `de` is the code that covers German speech. */
export function wisprLanguage() {
    const value = process.env.WISPR_LANGUAGE || 'de';
    if (!/^[a-z]{2}$/.test(value))
        throw new ApiError(500, 'WISPR_LANGUAGE must be a two-letter language code.');
    return value;
}

export function requireLocalDemo(request: Request) {
    const url = new URL(request.url);
    const authority = request.headers.get('host') ?? url.host;
    if (!['http:', 'https:'].includes(url.protocol) ||
        !/^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i.test(authority)) {
        throw new ApiError(403, 'Live transcription is available locally. A public deployment needs authentication.');
    }
}

export async function issueWisprToken(sessionId: string, signal?: AbortSignal) {
    const key = requireKey('WISPR_API_KEY');
    const language = wisprLanguage();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 10000);
    try {
        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
            body: JSON.stringify({ client_id: sessionId, duration_secs: 3600 }),
            signal: controller.signal
        });
        if (!response.ok)
            throw new ApiError(502, 'Wispr could not start a transcription session. Please try again.');
        const parsed = tokenSchema.safeParse(await response.json());
        if (!parsed.success || parsed.data.access_token === key)
            throw new ApiError(502, 'Wispr could not start a transcription session. Please try again.');
        return {
            accessToken: parsed.data.access_token,
            expiresIn: parsed.data.expires_in,
            socketUrl: WISPR_SOCKET_URL,
            language: [language],
            context: {
                app: { name: 'AnyResets', type: 'other' as const },
                dictionary_context: ['Grüezi', 'Merci vilmal', 'gäl', 'luege']
            }
        };
    }
    catch (error) {
        if (error instanceof ApiError)
            throw error;
        throw new ApiError(502, 'Wispr could not start a transcription session. Please try again.');
    }
    finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
    }
}
