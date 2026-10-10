import { beforeEach, describe, expect, it, vi } from 'vitest';
const generateContent = vi.hoisted(() => vi.fn());
vi.mock('@google/genai', async importOriginal => ({
    ...(await importOriginal<typeof import('@google/genai')>()),
    GoogleGenAI: class { models = { generateContent }; }
}));
import { POST as plan } from '@/app/api/goal-plan/route';
import { POST as check } from '@/app/api/goal-check/route';
import { resetRateLimit } from './http';

const post = (path: string, body: unknown) => new Request(`http://localhost/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const reply = (value: unknown) => ({ text: JSON.stringify(value) });
const items = [{ id: 'a', kind: 'canDo', text: 'Built a Django app used by 30 students' }, { id: 'b', kind: 'softSkill', text: 'Teaching assistant for 25 students' }];
const planBody = { scenarioId: 'interview', difficulty: 'neutral', target: 'Software engineering intern: Python/Django, tests, explain work to clinic staff.', items };
const checkBody = { target: planBody.target, points: [{ id: 'p1', label: 'Python and Django' }, { id: 'p2', label: 'Testing' }], coveredIds: [], question: 'What have you built?', answer: 'I built a Django app that 30 music students use to book rooms.' };

beforeEach(() => { resetRateLimit(); generateContent.mockReset(); process.env.GEMINI_API_KEY = 'test-key'; });

describe('goal plan', () => {
    it('returns numbered points and keeps only real item ids', async () => {
        generateContent.mockResolvedValue(reply({ points: [
            { label: 'Python and Django', why: 'Core stack', itemIds: ['a', 'zzz', 'a'] },
            { label: 'Testing and code review', why: 'Daily work', itemIds: [] },
            { label: 'python and django', why: 'duplicate', itemIds: [] },
            { label: 'Explaining to clinic staff', why: 'Users are not technical', itemIds: ['b'] },
        ] }));
        const response = await plan(post('goal-plan', planBody));
        expect(response.status).toBe(200);
        expect((await response.json()).points).toEqual([
            { id: 'p1', label: 'Python and Django', why: 'Core stack', itemIds: ['a'] },
            { id: 'p2', label: 'Testing and code review', why: 'Daily work', itemIds: [] },
            { id: 'p3', label: 'Explaining to clinic staff', why: 'Users are not technical', itemIds: ['b'] },
        ]);
        const call = generateContent.mock.calls[0][0];
        expect(call.contents[0].parts[0].text).toContain('Django app used by 30 students');
        expect(call.config.systemInstruction).not.toContain('clinic');
    });

    it('works without profile items, and caps the list at six', async () => {
        generateContent.mockResolvedValue(reply({ points: Array.from({ length: 9 }, (_, index) => ({ label: `Point ${index}`, why: '', itemIds: ['a'] })) }));
        const body = await (await plan(post('goal-plan', { ...planBody, items: [] }))).json();
        expect(body.points).toHaveLength(6);
        expect(body.points.every((point: { itemIds: string[] }) => point.itemIds.length === 0)).toBe(true);
    });

    it('rejects a too-short goal, bad output and a single-point plan', async () => {
        expect((await plan(post('goal-plan', { ...planBody, target: 'job' }))).status).toBe(400);
        generateContent.mockResolvedValueOnce({ text: 'nope' });
        expect((await plan(post('goal-plan', planBody))).status).toBe(502);
        generateContent.mockResolvedValueOnce(reply({ points: [{ label: 'Only one', why: '', itemIds: [] }] }));
        expect((await plan(post('goal-plan', planBody))).status).toBe(502);
    });
});

describe('goal check', () => {
    it('marks points covered only with a real quote from the answer', async () => {
        generateContent.mockResolvedValue(reply({ covered: [
            { pointId: 'p1', quote: 'built a Django app that 30 music students use' },
            { pointId: 'p2', quote: 'I wrote unit tests for everything' },
            { pointId: 'p9', quote: 'built a Django app' },
        ] }));
        expect(await (await check(post('goal-check', checkBody))).json()).toEqual({ covered: [{ pointId: 'p1', quote: 'built a Django app that 30 music students use' }] });
    });

    it('never re-covers or un-covers points and skips the call when all are covered', async () => {
        generateContent.mockResolvedValue(reply({ covered: [{ pointId: 'p1', quote: 'built a Django app' }] }));
        expect(await (await check(post('goal-check', { ...checkBody, coveredIds: ['p1'] }))).json()).toEqual({ covered: [] });
        expect(generateContent.mock.calls[0][0].contents[0].parts[0].text).not.toContain('"p1"');
        generateContent.mockClear();
        expect(await (await check(post('goal-check', { ...checkBody, coveredIds: ['p1', 'p2'] }))).json()).toEqual({ covered: [] });
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('fails clearly on bad output or input', async () => {
        generateContent.mockResolvedValue({ text: '{' });
        expect((await check(post('goal-check', checkBody))).status).toBe(502);
        expect((await check(post('goal-check', { ...checkBody, answer: '' }))).status).toBe(400);
        expect((await check(post('goal-check', { ...checkBody, points: [] }))).status).toBe(400);
    });
});
