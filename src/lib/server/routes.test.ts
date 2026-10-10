import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const generateContent = vi.hoisted(() => vi.fn());
vi.mock('@google/genai', () => ({ GoogleGenAI: class {
        models = { generateContent };
    }, ThinkingLevel: { LOW: 'LOW' } }));
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
const turn = (reply: string, extra: Record<string, unknown> = {}) => ({ text: JSON.stringify({ reply, userTone: 'neutral', tonality: 'friendly', ...extra }) });
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
        generateContent.mockResolvedValueOnce(turn('Tell me more.')).mockResolvedValueOnce({ text: JSON.stringify({
            summary: 'Clear example.', strengths: ['Specific', 'Concise'], improvements: ['Add impact', 'Explain decisions'], suggestedResponse: 'I built the feature.'
        }) });
        expect((await converse(request(input))).status).toBe(200);
        expect((await feedback(request(input))).status).toBe(200);
        for (const [call] of generateContent.mock.calls) {
            expect(call.model).toBe(model ?? 'gemini-3.8-flash');
        }
    });
    it('passes full history to Gemini and returns reply with detected tones', async () => {
        generateContent.mockResolvedValue(turn('What was your contribution?', { userTone: 'nervous', tonality: 'reassuring' }));
        const response = await converse(request(input));
        expect(await response.json()).toEqual({ reply: 'What was your contribution?', userTone: 'nervous', tonality: 'reassuring' });
        expect(generateContent.mock.calls[0][0].contents).toEqual([{
                role: 'user', parts: [{ text: 'I built a project.' }]
            }]);
        expect(generateContent.mock.calls[0][0].config.responseJsonSchema.required).toEqual(['reply', 'userTone', 'tonality']);
        // Default thinking can exhaust the token budget and truncate the JSON.
        expect(generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
    });
    it('lets the model choose tonality in auto mode but enforces a fixed one', async () => {
        generateContent.mockResolvedValue(turn('Go on.', { tonality: 'excited' }));
        expect((await (await converse(request({ ...input, tonality: 'auto' }))).json()).tonality).toBe('excited');
        expect(generateContent.mock.calls[0][0].config.systemInstruction).toContain('Choose the tonality');
        expect((await (await converse(request({ ...input, tonality: 'calm' }))).json()).tonality).toBe('calm');
        expect(generateContent.mock.calls[1][0].config.systemInstruction).toContain('Use the tonality "calm"');
        expect((await converse(request({ ...input, tonality: 'angry' }))).status).toBe(400);
    });
    it('rejects replies with unknown tones or without JSON', async () => {
        generateContent.mockResolvedValue(turn('Hi', { userTone: 'sarcastic' }));
        expect((await converse(request(input))).status).toBe(502);
        generateContent.mockResolvedValue({ text: 'Plain text reply' });
        expect((await converse(request(input))).status).toBe(502);
    });
    it.each([
        ['flatmate', 'flatmate'],
        ['coldcall', 'sales call'],
        ['bazaar', 'haggling'],
        ['relationship', 'break up']
    ])('accepts the %s wardrobe scenario and plays its role', async (scenarioId, role) => {
        generateContent.mockResolvedValue(turn('Go on.'));
        expect((await converse(request({ ...input, scenarioId }))).status).toBe(200);
        expect(generateContent.mock.calls[0][0].config.systemInstruction).toContain(role);
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
    it('accepts the browser host when Next normalizes loopback to localhost', async () => {
        generateContent.mockResolvedValue(turn('Tell me more.'));
        const r = new Request('http://localhost:3000/api/converse', {
            method: 'POST', headers: {
                'content-type': 'application/json', host: '127.0.0.1:3000',
                origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'same-origin'
            }, body: JSON.stringify(input)
        });
        expect((await converse(r)).status).toBe(200);
    });
    it.each([
        ['http://localhost:3000', 'same-origin'],
        ['http://127.0.0.1:3001', 'same-origin'],
        ['https://127.0.0.1:3000', 'same-origin'],
        ['http://127.0.0.1:3000', 'cross-site'],
        ['null', 'same-origin']
    ])('rejects mismatched browser origin or cross-site metadata (%s, %s)', async (origin, site) => {
        const r = new Request('http://localhost:3000/api/converse', {
            method: 'POST', headers: {
                'content-type': 'application/json', host: '127.0.0.1:3000',
                origin, 'sec-fetch-site': site, 'x-forwarded-host': 'evil.test'
            }, body: JSON.stringify(input)
        });
        expect((await converse(r)).status).toBe(403);
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
    it('picks the Gradium voice for the tonality, with env overrides', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(wav()));
        const voice = (i: number) => JSON.parse(String(fetchMock.mock.calls[i][1]?.body)).voice_id;
        await speak(request({ text: 'Hello' }));
        expect(voice(0)).toBe('YTpq7expH9539ERJ');
        await speak(request({ text: 'Hello', tonality: 'calm' }));
        expect(voice(1)).toBe('7c5UOKm7AiBgJADg');
        vi.stubEnv('GRADIUM_VOICE_CALM', 'my-studio-voice');
        await speak(request({ text: 'Hello', tonality: 'calm' }));
        expect(voice(2)).toBe('my-studio-voice');
        expect((await speak(request({ text: 'Hello', tonality: 'angry' }))).status).toBe(400);
    });
    it('finalizes Gradium streaming WAV lengths without accepting them as uploads', async () => {
        const bytes = wav();
        const view = new DataView(bytes.buffer);
        view.setUint32(4, 0xffffffff, true);
        view.setUint32(40, 0xffffffff, true);
        expect(() => validateWav(bytes)).toThrow();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(bytes));
        const response = await speak(request({ text: 'Hello' }));
        expect(response.status).toBe(200);
        const output = new Uint8Array(await response.arrayBuffer());
        expect(() => validateWav(output)).not.toThrow();
        expect(new DataView(output.buffer).getUint32(4, true)).toBe(output.length - 8);
        expect(new DataView(output.buffer).getUint32(40, true)).toBe(output.length - 44);
        expect(output.subarray(44)).toEqual(bytes.subarray(44));
    });
    it('retains assistant turns and accepts finished feedback', async () => {
        const messages = [{
                role: 'user', content: 'My experience'
            }, {
                role: 'assistant', content: 'Tell me more.'
            }];
        generateContent.mockResolvedValue(turn('Hello'));
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
        generateContent.mockResolvedValue(turn('a'.repeat(2001)));
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
        generateContent.mockResolvedValue(turn('Hello'));
        for (let i = 0; i < 60; i++)
            await converse(request(input));
        expect((await converse(request(input))).status).toBe(429);
    });
});
