import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/voice-token/route';
import { resetRateLimit } from './http';

const fetchMock = vi.fn<typeof fetch>();
const expiration = () => new Date(Date.now() + 60000).toISOString();
const request = (host = '127.0.0.1:3000', headers: Record<string, string> = {}, signal?: AbortSignal) =>
    new Request('http://localhost:3000/api/voice-token', { method: 'POST', headers: { host, origin: `http://${host}`, ...headers }, signal });

describe('duplex voice token endpoint', () => {
    beforeEach(() => {
        resetRateLimit();
        vi.stubEnv('GRADIUM_API_KEY', 'server-secret');
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
    });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

    it.each(['127.0.0.1:3000', 'localhost:3000', '[::1]:3000'])('issues a sanitized token for %s', async host => {
        const expires_at = expiration();
        fetchMock.mockResolvedValue(Response.json({ token: 'temporary-token', expires_at, api_key: 'server-secret' }));
        const response = await POST(request(host));
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual({ token: 'temporary-token', expires_at });
        expect(fetchMock).toHaveBeenCalledWith('https://api.gradium.ai/api/api-keys/token', expect.objectContaining({
            method: 'GET', headers: { 'x-api-key': 'server-secret' }, signal: expect.any(AbortSignal)
        }));
    });
    it.each(['example.com', 'localhost.evil.com', '127.0.0.2:3000', 'user@localhost:3000'])('blocks a nonlocal host %s', async host => {
        expect((await POST(request(host))).status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('rejects cross-origin access before issuing tokens', async () => {
        expect((await POST(request('localhost:3000', { origin: 'https://evil.com' }))).status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('uses the existing rate guard', async () => {
        for (let index = 0; index < 60; index++) await POST(request('example.com'));
        expect((await POST(request())).status).toBe(429);
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('rejects missing credentials', async () => {
        vi.stubEnv('GRADIUM_API_KEY', '');
        expect((await POST(request())).status).toBe(503);
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('accepts the request URL authority when Host is absent', async () => {
        fetchMock.mockResolvedValue(Response.json({ token: 'temporary', expires_at: expiration() }));
        expect((await POST(new Request('http://127.0.0.1:3000/api/voice-token', { method: 'POST' }))).status).toBe(200);
    });
    it('rejects a non-HTTP URL even with a local Host', async () => {
        expect((await POST(new Request('ftp://localhost/api/voice-token', { method: 'POST' }))).status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it.each([
        { token: '', expires_at: '2030-01-01T00:00:00Z' },
        { token: 'x'.repeat(4097), expires_at: '2030-01-01T00:00:00Z' },
        { token: 'server-secret', expires_at: '2030-01-01T00:00:00Z' },
        { token: 'temporary', expires_at: 'invalid' },
        { token: 'temporary', expires_at: '2000-01-01T00:00:00Z' }
    ])('rejects malformed or expired provider credentials', async payload => {
        fetchMock.mockResolvedValue(Response.json(payload));
        const response = await POST(request());
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain('server-secret');
    });
    it('bounds a streamed provider response without relying on content-length', async () => {
        fetchMock.mockResolvedValue(new Response(new ReadableStream({ start(controller) {
            controller.enqueue(new Uint8Array(65537)); controller.close();
        } })));
        expect((await POST(request())).status).toBe(502);
    });
    it('does not disclose upstream errors', async () => {
        fetchMock.mockResolvedValue(new Response('server-secret', { status: 403 }));
        const response = await POST(request());
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain('server-secret');
    });
    it.each([
        new Response('not json'),
        new Response(null),
        new Response('{}', { headers: { 'content-length': '65537' } })
    ])('rejects invalid provider response bodies', async body => {
        fetchMock.mockResolvedValue(body);
        expect((await POST(request())).status).toBe(502);
    });
    it('does not issue a token for an already cancelled request', async () => {
        const controller = new AbortController(); controller.abort();
        expect((await POST(request('localhost:3000', {}, controller.signal))).status).toBe(502);
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('times out a stalled fetch', async () => {
        vi.useFakeTimers();
        fetchMock.mockImplementation(() => new Promise(() => undefined));
        const pending = POST(request());
        await vi.advanceTimersByTimeAsync(10000);
        expect((await pending).status).toBe(502);
        expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    });
    it('times out a stalled response body and cancels its reader', async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel })));
        const pending = POST(request());
        await vi.advanceTimersByTimeAsync(10000);
        expect((await pending).status).toBe(502);
        expect(cancel).toHaveBeenCalled();
    });
    it('propagates request cancellation', async () => {
        const controller = new AbortController();
        fetchMock.mockImplementation(() => new Promise(() => undefined));
        const pending = POST(request('localhost:3000', {}, controller.signal));
        controller.abort();
        expect((await pending).status).toBe(502);
        expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    });
});
