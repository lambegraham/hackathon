import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as issueToken } from '@/app/api/wispr/token/route';
import { GET, POST as saveLine } from '@/app/api/transcripts/route';
import { resetRateLimit } from './http';
import { setTranscriptStore, upsertLine, type StoredTranscript, type TranscriptStore } from './transcript-store';

const fetchMock = vi.fn<typeof fetch>();
const sessionId = '11111111-1111-4111-8111-111111111111';
const request = (url: string, init: RequestInit = {}, host = '127.0.0.1:3000') =>
    new Request(url, { ...init, headers: { host, origin: `http://${host}`, 'content-type': 'application/json', ...init.headers } });

function memoryStore() {
    const sessions = new Map<string, StoredTranscript>();
    const store: TranscriptStore = {
        async read(id) { return sessions.get(id) ?? null; },
        async save(session) { sessions.set(session.sessionId, session); }
    };
    return { store, sessions };
}

describe('Wispr token', () => {
    beforeEach(() => {
        resetRateLimit();
        vi.stubEnv('WISPR_API_KEY', 'fl-server-secret');
        vi.stubEnv('WISPR_LANGUAGE', 'de');
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
    });
    afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

    it('mints a client token and does not return the org key', async () => {
        fetchMock.mockResolvedValue(Response.json({ access_token: 'client-jwt', expires_in: 3600 }));
        const response = await issueToken(request('http://127.0.0.1:3000/api/wispr/token', {
            method: 'POST', body: JSON.stringify({ sessionId })
        }));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.accessToken).toBe('client-jwt');
        expect(body.language).toEqual(['de']);
        expect(body.socketUrl).toBe('wss://platform-api.wisprflow.ai/api/v1/dash/client_ws');
        expect(JSON.stringify(body)).not.toContain('fl-server-secret');
        expect(fetchMock).toHaveBeenCalledWith('https://platform-api.wisprflow.ai/api/v1/dash/generate_access_token', expect.objectContaining({
            method: 'POST',
            headers: { authorization: 'Bearer fl-server-secret', 'content-type': 'application/json' }
        }));
    });

    it('refuses a missing key and a public host', async () => {
        vi.stubEnv('WISPR_API_KEY', '');
        expect((await issueToken(request('http://127.0.0.1:3000/api/wispr/token', { method: 'POST', body: JSON.stringify({ sessionId }) }))).status).toBe(503);
        vi.stubEnv('WISPR_API_KEY', 'fl-server-secret');
        expect((await issueToken(request('http://127.0.0.1:3000/api/wispr/token', { method: 'POST', body: JSON.stringify({ sessionId }) }, 'example.com'))).status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('saved transcripts', () => {
    const memory = memoryStore();
    beforeEach(() => {
        resetRateLimit();
        memory.sessions.clear();
        setTranscriptStore(memory.store);
        vi.stubEnv('WISPR_LANGUAGE', 'de');
    });
    afterEach(() => vi.unstubAllEnvs());

    it('stores a streaming line and then locks the final text', async () => {
        const first = await saveLine(request('http://127.0.0.1:3000/api/transcripts', {
            method: 'POST', body: JSON.stringify({ sessionId, lineId: 'line-1', text: 'Grüezi', final: false, detectedLanguage: 'de' })
        }));
        expect(first.status).toBe(200);
        const updated = await saveLine(request('http://127.0.0.1:3000/api/transcripts', {
            method: 'POST', body: JSON.stringify({ sessionId, lineId: 'line-1', text: 'Grüezi, wie gaht s?', final: true, detectedLanguage: 'de' })
        }));
        expect((await updated.json()).lines[0].text).toBe('Grüezi, wie gaht s?');
        const locked = await saveLine(request('http://127.0.0.1:3000/api/transcripts', {
            method: 'POST', body: JSON.stringify({ sessionId, lineId: 'line-1', text: 'changed', final: true })
        }));
        expect(locked.status).toBe(409);
        const saved = await GET(request(`http://127.0.0.1:3000/api/transcripts?sessionId=${sessionId}`));
        expect((await saved.json()).lines).toHaveLength(1);
    });

    it('numbers nothing into a missing session', async () => {
        expect((await GET(request(`http://127.0.0.1:3000/api/transcripts?sessionId=${sessionId}`))).status).toBe(404);
    });

    it('keeps an unfinished line replaceable', () => {
        const once = upsertLine(null, sessionId, 'de', { id: 'a', text: 'one', final: false, detectedLanguage: null, updatedAt: '2026-10-10T10:00:00.000Z' });
        const twice = upsertLine(once, sessionId, 'de', { id: 'a', text: 'one two', final: false, detectedLanguage: 'de', updatedAt: '2026-10-10T10:00:01.000Z' });
        expect(twice.lines).toHaveLength(1);
        expect(twice.lines[0].text).toBe('one two');
    });
});
