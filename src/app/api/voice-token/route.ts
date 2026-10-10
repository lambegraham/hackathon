import { z } from 'zod';
import { ApiError, handle, json, requireKey } from '@/lib/server/http';

export const runtime = 'nodejs';

const tokenSchema = z.object({
    token: z.string().trim().min(1).max(4096),
    expires_at: z.iso.datetime({ offset: true }).refine(value => Date.parse(value) > Date.now())
});
const failed = () => new ApiError(502, 'Gradium could not create a voice session. Please try again.');

function requireLocalHost(request: Request) {
    const url = new URL(request.url);
    const authority = request.headers.get('host') ?? url.host;
    // This demo has no accounts. Public deployments must authenticate token issuance.
    if (!['http:', 'https:'].includes(url.protocol) ||
        !/^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i.test(authority)) {
        throw new ApiError(403, 'Duplex voice is available locally. Public deployment requires authentication.');
    }
    try { new URL(`${url.protocol}//${authority}`); }
    catch { throw new ApiError(403, 'Duplex voice is available locally. Public deployment requires authentication.'); }
}

async function issueToken(request: Request) {
    const key = requireKey('GRADIUM_API_KEY');
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let rejectAbort!: (reason: ApiError) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const abort = () => {
        controller.abort();
        rejectAbort(failed());
        void reader?.cancel().catch(() => undefined);
    };
    request.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 10000);
    const consume = async () => {
        if (request.signal.aborted) throw failed();
        const response = await fetch('https://api.gradium.ai/api/api-keys/token', {
            method: 'GET', headers: { 'x-api-key': key }, signal: controller.signal
        });
        if (controller.signal.aborted || !response.ok || !response.body || Number(response.headers.get('content-length')) > 65536) {
            void response.body?.cancel().catch(() => undefined);
            throw failed();
        }
        reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            length += chunk.value.byteLength;
            if (length > 65536) { await reader.cancel(); throw failed(); }
            chunks.push(chunk.value);
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const result = tokenSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
        if (result.token === key) throw failed();
        return result;
    };
    try {
        return await Promise.race([consume(), aborted]);
    } catch {
        controller.abort();
        void reader?.cancel().catch(() => undefined);
        throw failed();
    } finally {
        clearTimeout(timer);
        request.signal.removeEventListener('abort', abort);
    }
}

export async function POST(request: Request) {
    return handle(request, async () => {
        requireLocalHost(request);
        return json(await issueToken(request));
    });
}
