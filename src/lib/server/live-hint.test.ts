import { beforeEach, describe, expect, it, vi } from 'vitest';
const generateContent = vi.hoisted(() => vi.fn());
vi.mock('@google/genai', async importOriginal => ({
    ...(await importOriginal<typeof import('@google/genai')>()),
    GoogleGenAI: class { models = { generateContent }; }
}));
import { POST as liveHint } from '@/app/api/live-hint/route';
import { resetRateLimit } from './http';
import { LIVE_HINT_INSTRUCTIONS, verifyKeywords } from './live-hint';

const items = [
    { id: 'a', kind: 'canDo', text: 'Led a team of 4 volunteers for a hackathon' },
    { id: 'b', kind: 'hardSkill', text: 'Built a Django web app used by 30 students' },
    { id: 'c', kind: 'improve', text: 'Not shown in your documents: measurable results' },
];
const body = (over: Record<string, unknown> = {}) => ({
    scenarioId: 'interview', difficulty: 'neutral', target: 'Backend engineer, team lead track', items, usedItemIds: [],
    messages: [{ role: 'assistant', content: 'Tell me about a time you led a team.' }], ...over
});
const post = (payload: unknown) => new Request('http://localhost/api/live-hint', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
const output = (over: Record<string, unknown>) => ({ text: JSON.stringify({ type: 'mention', itemId: 'a', hint: 'Good moment to mention: you led 4 volunteers.', keywords: ['team of 4', 'hackathon'], ...over }) });

beforeEach(() => { resetRateLimit(); generateContent.mockReset(); process.env.GEMINI_API_KEY = 'test-key'; });

describe('live hint', () => {
    it('returns a mention with verified keywords', async () => {
        generateContent.mockResolvedValue(output({ keywords: ['team of 4', 'invented skill', 'hackathon'] }));
        const response = await liveHint(post(body()));
        expect(await response.json()).toEqual({ comment: { kind: 'mention', text: 'Good moment to mention: you led 4 volunteers.', keywords: ['team of 4', 'hackathon'], itemId: 'a' } });
    });

    it('sends only the confirmed item fields, the target and the dialogue as data', async () => {
        generateContent.mockResolvedValue(output({ type: 'none' }));
        await liveHint(post(body()));
        const call = generateContent.mock.calls[0][0];
        const text = call.contents[0].parts[0].text;
        expect(text).toContain('Backend engineer');
        expect(text).toContain('Led a team of 4');
        expect(call.config.systemInstruction).toBe(LIVE_HINT_INSTRUCTIONS);
        expect(call.config.systemInstruction).not.toContain('Backend engineer');
    });

    it('skips items already suggested and returns null when none are left', async () => {
        generateContent.mockResolvedValue(output({ type: 'none' }));
        await liveHint(post(body({ usedItemIds: ['a'] })));
        expect(generateContent.mock.calls[0][0].contents[0].parts[0].text).not.toContain('"id":"a"');
        generateContent.mockClear();
        const response = await liveHint(post(body({ usedItemIds: ['a', 'b', 'c'] })));
        expect(await response.json()).toEqual({ comment: null });
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('returns null for none, unknown items, used items, long text and mismatched types', async () => {
        for (const reply of [
            output({ type: 'none' }), output({ itemId: 'zzz' }), output({ hint: 'x'.repeat(161) }), output({ hint: '' }),
            output({ type: 'beware', itemId: 'a', hint: 'Careful: do not mention this.' }),
            output({ type: 'mention', itemId: 'c', hint: 'Good moment to mention: no results.' }),
        ]) {
            generateContent.mockResolvedValueOnce(reply);
            expect(await (await liveHint(post(body()))).json()).toEqual({ comment: null });
        }
    });

    it('allows a beware comment for improve items', async () => {
        generateContent.mockResolvedValue(output({ type: 'beware', itemId: 'c', hint: 'Careful: they may ask for measurable results.', keywords: ['measurable results'] }));
        const result = await (await liveHint(post(body()))).json();
        expect(result.comment).toMatchObject({ kind: 'beware', itemId: 'c', keywords: ['measurable results'] });
    });

    it('fails with 502 on malformed output and 400 on bad input', async () => {
        generateContent.mockResolvedValue({ text: 'nope' });
        expect((await liveHint(post(body()))).status).toBe(502);
        expect((await liveHint(post(body({ items: [] })))).status).toBe(400);
        expect((await liveHint(post(body({ messages: [{ role: 'user', content: 'Hi' }] })))).status).toBe(400);
        expect((await liveHint(post(body({ items: [{ id: 'a', kind: 'canDo', text: 'x', evidence: 'leak' }] })))).status).toBe(400);
    });
});

describe('keyword check', () => {
    it('keeps only words from the item text', () => {
        expect(verifyKeywords(['Django app', 'Kubernetes', 'django'], 'Built a Django web app')).toEqual(['Django app', 'django']);
    });
});
