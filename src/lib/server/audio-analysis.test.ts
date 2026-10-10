import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const createInteraction = vi.hoisted(() => vi.fn());
vi.mock('@google/genai', () => ({ GoogleGenAI: class { interactions = { create: createInteraction }; } }));
import { POST } from '@/app/api/analyse-audio/route';
import { resetRateLimit } from './http';
function wav(seconds = 1) {
    const bytes = Buffer.alloc(44 + seconds * 32000);
    bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
    return bytes;
}
function request(body = wav(), headers: Record<string, string> = {}) {
    return new Request('http://localhost/api/analyse-audio', { method: 'POST', headers: { 'content-type': 'audio/wav', ...headers }, body });
}
const result = { transcript: 'Um, I built this.', fillers: [{ word: 'Um', startSeconds: 0.1, endSeconds: 0.3 }] };
function output(annotations: unknown[] = [{ type: 'word_info', text: 'Um', start_offset: '0.1s', end_offset: '0.3s' }]) {
    return { status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: result.transcript, annotations }] }] };
}
describe('audio analysis API', () => {
    beforeEach(() => { resetRateLimit(); createInteraction.mockReset(); vi.stubEnv('GEMINI_API_KEY', 'test'); vi.stubEnv('GEMINI_AUDIO_MODEL', undefined); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
    it('sends actual audio and returns literal timestamped observations', async () => {
        createInteraction.mockResolvedValue(output());
        const response = await POST(request());
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ model: 'gemini-3.5-transcribe', ...result });
        const call = createInteraction.mock.calls[0][0];
        expect(call.input[0]).toEqual({ type: 'audio', mime_type: 'audio/wav', data: wav().toString('base64') });
        expect(call.store).toBe(false);
        expect(call.generation_config.transcription_config.mode).toEqual({ type: 'verbatim', timestamp_granularities: ['word'] });
        expect(createInteraction.mock.calls[0][1].timeout_ms).toBe(90000);
        expect(response.headers.get('cache-control')).toBe('no-store');
    });
    it('honours the separate audio model override', async () => {
        vi.stubEnv('GEMINI_AUDIO_MODEL', 'test-audio-model');
        createInteraction.mockResolvedValue(output());
        const response = await POST(request());
        expect((await response.json()).model).toBe('test-audio-model');
    });
    it('keeps usable fillers when word alignment includes point timestamps and overlap', async () => {
        createInteraction.mockResolvedValue(output([
            { type: 'word_info', text: 'Um', start_offset: '0s', end_offset: '0s' },
            { type: 'word_info', text: 'I', start_offset: '0.1s', end_offset: '0.1s' },
            { type: 'word_info', text: 'built', start_offset: '0.2s', end_offset: '0.5s' },
            { type: 'word_info', text: 'uh', start_offset: '0.3s', end_offset: '0.6s' },
            { type: 'word_info', text: 'um', start_offset: '0.4s', end_offset: '0.7s' },
        ]));
        const response = await POST(request());
        expect(response.status).toBe(200);
        expect((await response.json()).fillers).toEqual([
            { word: 'Um', startSeconds: 0, endSeconds: 0 },
            { word: 'uh', startSeconds: 0.3, endSeconds: 0.6 },
            { word: 'um', startSeconds: 0.4, endSeconds: 0.7 },
        ]);
    });
    it('accepts the zero-duration ordinary word reproduced in a real Gemini response', async () => {
        createInteraction.mockResolvedValue(output([
            { type: 'word_info', text: 'Um', start_offset: '0.1s', end_offset: '0.3s' },
            { text: 'a', start_offset: '14.800s', end_offset: '14.800s', type: 'word_info', start_index: 239, end_index: 240 },
        ]));
        const response = await POST(request(wav(28)));
        expect(response.status).toBe(200);
        expect((await response.json()).fillers).toEqual(result.fillers);
    });
    it.each([
        [{ type: 'word_info', text: 'Um', start_offset: '0.1s', end_offset: '2s' }],
        [{ type: 'word_info', text: 'Um', start_offset: '0.3s', end_offset: '0.1s' }],
        [{ type: 'word_info', text: 'Um', start_offset: '-1s', end_offset: '0.1s' }],
        [{ type: 'word_info', text: 'Um', start_offset: '0.1s' }],
        [{ type: 'word_info', text: 'Um', start_offset: 'NaNs', end_offset: '0.2s' }],
        [{ type: 'word_info', text: 'Um', start_offset: '0.3s', end_offset: '0.4s' }, { type: 'word_info', text: 'I', start_offset: '0.2s', end_offset: '0.5s' }],
        [],
    ].map(annotations => ({ annotations })))('rejects missing or invalid word timing', async ({ annotations }) => {
        createInteraction.mockResolvedValue(output(annotations));
        expect((await POST(request())).status).toBe(502);
    });
    it('logs bounded schema diagnostics without transcript or provider content', async () => {
        createInteraction.mockResolvedValue({ status: 'completed', private: 'secret provider text', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'private transcript', annotations: [{ type: 'word_info', text: 'private word', start_offset: 'bad', end_offset: '0.2s' }] }] }] });
        expect((await POST(request())).status).toBe(502);
        expect(console.warn).toHaveBeenCalledWith('Audio analysis validation failed', {
            code: 'schema_validation', issueCount: 1,
            issues: [{ code: 'invalid_format', path: 'steps.0.content.0.annotations.0.start_offset' }],
        });
        expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/private|secret/);
    });
    it('logs only a fixed code for invalid timing', async () => {
        createInteraction.mockResolvedValue(output([{ type: 'word_info', text: 'private word', start_offset: '0.3s', end_offset: '0.1s' }]));
        expect((await POST(request())).status).toBe(502);
        expect(console.warn).toHaveBeenCalledWith('Audio analysis validation failed', { code: 'invalid_word_timestamps' });
    });
    it('rejects incomplete output', async () => {
        for (const value of [undefined, { status: 'failed' }, { status: 'completed' }]) {
            createInteraction.mockResolvedValue(value);
            expect((await POST(request())).status).toBe(502);
        }
    });
    it('returns no fillers for completed silent audio', async () => {
        createInteraction.mockResolvedValue({ status: 'completed', steps: [] });
        const response = await POST(request());
        expect(await response.json()).toMatchObject({ transcript: '', fillers: [] });
    });
    it('keeps ordinary words and elongated fillers distinct', async () => {
        createInteraction.mockResolvedValue(output([
            { type: 'word_info', text: 'Ummm,', start_offset: '0.1s', end_offset: '0.3s' },
            { type: 'word_info', text: 'like', start_offset: '0.4s', end_offset: '0.5s' },
            { type: 'word_info', text: 'uhhh', start_offset: '0.6s', end_offset: '0.8s' },
        ]));
        const response = await POST(request());
        expect((await response.json()).fillers.map((item: { word: string }) => item.word)).toEqual(['Ummm,', 'uhhh']);
    });
    it('returns provider failure without revealing its message', async () => {
        createInteraction.mockRejectedValue(new Error('secret provider text'));
        const response = await POST(request());
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain('secret provider text');
    });
    it('requires a server API key', async () => {
        vi.stubEnv('GEMINI_API_KEY', undefined);
        expect((await POST(request())).status).toBe(503);
    });
    it('rejects cross-origin requests before contacting Gemini', async () => {
        expect((await POST(request(wav(), { origin: 'https://attacker.test' }))).status).toBe(403);
        expect(createInteraction).not.toHaveBeenCalled();
    });
    it('rate limits requests before contacting Gemini', async () => {
        for (let i = 0; i < 60; i++) await POST(request(Buffer.alloc(1)));
        expect((await POST(request())).status).toBe(429);
        expect(createInteraction).not.toHaveBeenCalled();
    });
    it('rejects oversized and invalid audio before contacting Gemini', async () => {
        expect((await POST(request(wav(61)))).status).toBe(413);
        expect((await POST(request(wav(), { 'content-type': 'application/json' }))).status).toBe(415);
        expect((await POST(request(Buffer.from('bad')))).status).toBe(400);
        const stereo = wav(); stereo.writeUInt16LE(2, 22);
        expect((await POST(request(stereo))).status).toBe(400);
        expect(createInteraction).not.toHaveBeenCalled();
    });
});
