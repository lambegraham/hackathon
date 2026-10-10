import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const generateContent = vi.hoisted(() => vi.fn());
vi.mock('@google/genai', () => ({ GoogleGenAI: class {
        models = { generateContent };
    } }));
import { POST as converse } from '@/app/api/converse/route';
import { POST as feedback } from '@/app/api/feedback/route';
import { POST as transcribe } from '@/app/api/transcribe/route';
import { POST as speak } from '@/app/api/speak/route';
import { GET as status } from '@/app/api/status/route';
import { resetRateLimit } from './http';
import { validateWav } from './gradium';
const input = {
    scenarioId: 'interview', difficulty: 'neutral', messages: [{
            role: 'user', content: 'I built a project.'
        }]
};
const request = (body: unknown, headers: Record<string, string> = {}) => new Request('http://localhost/api/converse', {
    method: 'POST', headers: {
        'content-type': 'application/json', ...headers
    }, body: JSON.stringify(body)
});
function wav(seconds = 1) {
    const bytes = new Uint8Array(44 + 16000 * 2 * seconds);
    const view = new DataView(bytes.buffer);
    const str = (offset: number, s: string) => Array.from(s).forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    str(0, 'RIFF');
    view.setUint32(4, bytes.length - 8, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    str(36, 'data');
    view.setUint32(40, bytes.length - 44, true);
    return bytes;
}
describe('WAV boundaries', () => {
    it('rejects incomplete trailing chunks even when RIFF size matches', () => {
        const source = wav();
        const bytes = new Uint8Array(source.length + 2);
        bytes.set(source);
        new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
        expect(() => validateWav(bytes)).toThrow();
    });
    it('rejects invalid byte rate and unsupported encoded audio', () => {
        const bytes = wav();
        const view = new DataView(bytes.buffer);
        view.setUint32(28, 1, true);
        expect(() => validateWav(bytes)).toThrow();
        view.setUint32(28, 32000, true);
        view.setUint16(20, 3, true);
        expect(() => validateWav(bytes)).toThrow();
    });
});
describe('coach API', () => {
    beforeEach(() => {
        resetRateLimit();
        vi.restoreAllMocks();
        generateContent.mockReset();
        process.env.GEMINI_API_KEY = 'test';
        process.env.GRADIUM_API_KEY = 'test';
        vi.stubEnv('GEMINI_MODEL', undefined);
    });
    afterEach(() => vi.unstubAllEnvs());
    it.each([undefined, 'event-model-override'])('uses the upgraded default or configured model (%s) for conversation and feedback', async (model) => {
        vi.stubEnv('GEMINI_MODEL', model);
        generateContent.mockResolvedValueOnce({ text: 'Tell me more.' }).mockResolvedValueOnce({ text: JSON.stringify({
            summary: 'Clear example.', strengths: ['Specific', 'Concise'], improvements: ['Add impact', 'Explain decisions'], suggestedResponse: 'I built the feature.'
        }) });
        expect((await converse(request(input))).status).toBe(200);
        expect((await feedback(request(input))).status).toBe(200);
        for (const [call] of generateContent.mock.calls) {
            expect(call.model).toBe(model ?? 'gemini-3.8-flash');
        }
    });
    it('passes full history to Gemini and returns reply', async () => {
        generateContent.mockResolvedValue({ text: 'What was your contribution?' });
        const response = await converse(request(input));
        expect(await response.json()).toEqual({ reply: 'What was your contribution?' });
        expect(generateContent.mock.calls[0][0].contents).toEqual([{
                role: 'user', parts: [{ text: 'I built a project.' }]
            }]);
    });
    it('rejects invalid scenario and overlong history', async () => {
        expect((await converse(request({
            ...input, scenarioId: 'bad'
        }))).status).toBe(400);
        expect((await converse(request({
            ...input, messages: [{
                    role: 'user', content: 'a'.repeat(4001)
                }]
        }))).status).toBe(400);
    });
    it('rejects cross-origin requests', async () => {
        expect((await converse(request(input, { origin: 'https://evil.test' }))).status).toBe(403);
        expect(generateContent).not.toHaveBeenCalled();
    });
    it('returns actionable config error without provider call', async () => {
        delete process.env.GEMINI_API_KEY;
        const r = await converse(request(input));
        expect(r.status).toBe(503);
        expect(await r.json()).toEqual({ error: 'GEMINI_API_KEY is not configured.' });
    });
    it('sanitizes provider errors', async () => {
        generateContent.mockRejectedValue(new Error('secret token'));
        const r = await converse(request(input));
        expect(r.status).toBe(502);
        expect(JSON.stringify(await r.json())).not.toContain('secret');
    });
    it('validates structured feedback', async () => {
        const report = {
            summary: 'Clear example.', strengths: ['Specific', 'Concise'], improvements: ['Add impact', 'Explain decisions'], suggestedResponse: 'I built the feature and measured its impact.'
        };
        generateContent.mockResolvedValue({ text: JSON.stringify(report) });
        expect(await (await feedback(request(input))).json()).toEqual(report);
        generateContent.mockResolvedValue({ text: '{}' });
        expect((await feedback(request(input))).status).toBe(502);
    });
    it('transcribes WAV NDJSON and surfaces upstream error events', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"type":"text","text":"hello"}\n{"type":"text","text":"world"}\n'));
        const req = () => new Request('http://localhost/api/transcribe', {
            method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav()
        });
        expect(await (await transcribe(req())).json()).toEqual({ text: 'hello world' });
        expect(String(fetchMock.mock.calls[0][0])).toContain('speech/asr');
        fetchMock.mockResolvedValue(new Response('{"type":"error","message":"secret"}\n'));
        expect((await transcribe(req())).status).toBe(502);
    });
    it('rejects malformed and long audio', async () => {
        for (const body of [new Uint8Array(45), wav(61)]) {
            const r = await transcribe(new Request('http://localhost/api/transcribe', {
                method: 'POST', headers: { 'content-type': 'audio/wav' }, body
            }));
            expect(r.status).toBe(400);
        }
    });
    it('returns synthesized WAV and rejects bad output', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(wav()));
        const response = await speak(request({ text: 'Hello' }));
        expect(response.headers.get('content-type')).toBe('audio/wav');
        expect((await response.arrayBuffer()).byteLength).toBe(wav().length);
        fetchMock.mockResolvedValue(new Response('not audio'));
        expect((await speak(request({ text: 'Hello' }))).status).toBe(502);
    });
    it('retains assistant turns and accepts finished feedback', async () => {
        const messages = [{
                role: 'user', content: 'My experience'
            }, {
                role: 'assistant', content: 'Tell me more.'
            }];
        generateContent.mockResolvedValue({ text: 'Hello' });
        expect((await converse(request({
            ...input, messages
        }))).status).toBe(400);
        generateContent.mockResolvedValue({ text: JSON.stringify({
                summary: 'Good', strengths: ['Clear', 'Specific'], improvements: ['Impact', 'Details'], suggestedResponse: 'Better answer'
            }) });
        expect((await feedback(request({
            ...input, messages
        }))).status).toBe(200);
        expect(generateContent.mock.calls[0][0].contents[1].role).toBe('model');
    });
    it('rejects missing custom context, bad JSON and oversized requests', async () => {
        expect((await converse(request({
            ...input, scenarioId: 'custom'
        }))).status).toBe(400);
        expect((await converse(new Request('http://localhost/api/converse', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{'
        }))).status).toBe(400);
        expect((await converse(request(input, { 'content-length': '70000' }))).status).toBe(413);
        expect((await speak(request({ text: 'a'.repeat(2001) }))).status).toBe(400);
    });
    it('rejects empty or overlong model replies', async () => {
        generateContent.mockResolvedValue({ text: '' });
        expect((await converse(request(input))).status).toBe(502);
        generateContent.mockResolvedValue({ text: 'a'.repeat(2001) });
        expect((await converse(request(input))).status).toBe(502);
    });
    it('rejects audio MIME mismatch, missing speech and upstream HTTP failures', async () => {
        expect((await transcribe(request({}))).status).toBe(415);
        const req = () => new Request('http://localhost/api/transcribe', {
            method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav()
        });
        const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(''));
        expect((await transcribe(req())).status).toBe(422);
        f.mockResolvedValue(new Response('secret', { status: 401 }));
        expect((await transcribe(req())).status).toBe(502);
        delete process.env.GRADIUM_API_KEY;
        expect((await transcribe(req())).status).toBe(503);
    });
    it('returns only provider presence and rate limits', async () => {
        expect(await (await status()).json()).toEqual({
            gemini: true, gradium: true
        });
        generateContent.mockResolvedValue({ text: 'Hello' });
        for (let i = 0; i < 60; i++)
            await converse(request(input));
        expect((await converse(request(input))).status).toBe(429);
    });
});
