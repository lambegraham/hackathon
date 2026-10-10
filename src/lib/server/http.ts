import { z } from 'zod';
export class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}
let windowStart = Date.now();
let count = 0;
export function resetRateLimit() {
    windowStart = Date.now();
    count = 0;
}
export function guard(request: Request) {
    const origin = request.headers.get('origin');
    const url = new URL(request.url);
    // Next normalizes loopback URLs to localhost; Host retains the browser's authority.
    const expectedOrigin = `${url.protocol}//${request.headers.get('host') ?? url.host}`;
    if ((origin && origin !== expectedOrigin) || request.headers.get('sec-fetch-site') === 'cross-site')
        throw new ApiError(403, 'Only same-origin requests are allowed.');
    if (Date.now() - windowStart >= 60000)
        resetRateLimit();
    count += 1;
    if (count > 60)
        throw new ApiError(429, 'Too many requests. Please wait a minute.');
}
export async function readLimited(request: Request, max: number) {
    const length = Number(request.headers.get('content-length'));
    if (length > max)
        throw new ApiError(413, 'Request is too large.');
    if (!request.body)
        throw new ApiError(400, 'Request body is required.');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        size += value.byteLength;
        if (size > max) {
            await reader.cancel();
            throw new ApiError(413, 'Request is too large.');
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
export async function readJson<T>(request: Request, schema: z.ZodType<T>, maxBytes = 65536) {
    if (!request.headers.get('content-type')?.includes('application/json'))
        throw new ApiError(415, 'Expected application/json.');
    const bytes = await readLimited(request, maxBytes);
    try {
        return schema.parse(JSON.parse(new TextDecoder().decode(bytes)));
    }
    catch {
        throw new ApiError(400, 'Invalid request. Check the scenario, messages, and text length.');
    }
}
export function json(body: unknown) {
    return Response.json(body, { headers: { 'cache-control': 'no-store' } });
}
export async function handle(request: Request, action: () => Promise<Response>) {
    try {
        guard(request);
        return await action();
    }
    catch (error) {
        return Response.json({ error: error instanceof ApiError ? error.message : 'The service could not complete the request. Please try again.' }, {
            status: error instanceof ApiError ? error.status : 502, headers: { 'cache-control': 'no-store' }
        });
    }
}
export function requireKey(name: string) {
    const value = process.env[name];
    if (!value)
        throw new ApiError(503, `${name} is not configured.`);
    return value;
}
