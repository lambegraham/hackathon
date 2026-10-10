import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const generateContent = vi.hoisted(() => vi.fn());
vi.mock('@google/genai', async importOriginal => ({
    ...(await importOriginal<typeof import('@google/genai')>()),
    GoogleGenAI: class { models = { generateContent }; }
}));
import { POST } from '@/app/api/feedback/route';
import { reportSchema } from '@/lib/feedback';
import { resetRateLimit } from './http';

const evidence = 'I built a project.';
const observation = { topic: 'personal_ownership', kind: 'strength', evidence, detail: 'You explicitly named your own contribution.', action: 'Keep naming your specific contribution in the opening sentence.' };
const report = {
    summary: 'A clear contribution needs more context.', strengths: ['Direct opening.', 'Names ownership.'],
    improvements: ['Explain context.', 'Describe actual impact.'], suggestedResponse: 'I built a project to [add actual purpose].',
    assessment: Object.fromEntries(['clarity', 'structure', 'specificity', 'relevance'].map(key => [key, { score: 3, evidence, action: 'Describe the actual outcome.' }])),
    coaching: {
        rubricVersion: 'interview-coach-v1',
        answerReviews: [{ messageIndex: 1, question: 'What did you build?', scores: { clarity: 3, structure: 2, specificity: 2, relevance: 3 }, evidence, feedback: 'Explain what your project did.' }],
        priority: 'Give concrete context.', drill: 'Retell your answer with one project detail.', nextGoal: 'Include one actual outcome.', progress: { changes: [] }
    },
    observations: [observation]
};
const request = () => new Request('http://localhost/api/feedback', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scenarioId: 'interview', difficulty: 'neutral', messages: [
        { role: 'assistant', content: 'What did you build?' }, { role: 'user', content: evidence }
    ] })
});
async function submit(value: unknown) {
    generateContent.mockResolvedValue({ text: JSON.stringify(value) });
    return POST(request());
}
describe('grounded recurring coaching observations', () => {
    beforeEach(() => { resetRateLimit(); generateContent.mockReset(); vi.stubEnv('GEMINI_API_KEY', 'test'); });
    afterEach(() => vi.unstubAllEnvs());
    it('returns the complete report with grounded observations', async () => {
        const response = await submit(report);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(report);
        expect(generateContent.mock.calls[0][0].config.responseJsonSchema.required).toContain('observations');
    });
    it('accepts legacy saved reports while requiring observations in new model output', async () => {
        const legacy = { ...report, observations: undefined };
        expect(reportSchema.safeParse(legacy).success).toBe(true);
        expect((await submit(legacy)).status).toBe(502);
    });
    it('accepts empty observations when evidence is sparse', async () => {
        expect((await submit({ ...report, observations: [] })).status).toBe(200);
    });
    it.each(['Invented result.', 'What did you build?'])('rejects fabricated or assistant-only evidence: %s', invalidEvidence => {
        return expect(submit({ ...report, observations: [{ ...observation, evidence: invalidEvidence }] }).then(r => r.status)).resolves.toBe(502);
    });
    it('rejects repeated topic and kind to avoid counting a theme twice per session', async () => {
        expect((await submit({ ...report, observations: [observation, { ...observation, evidence: 'a project' }] })).status).toBe(502);
    });
    it('allows strengths and improvement for the same topic with distinct evidence', async () => {
        expect((await submit({ ...report, observations: [observation, { ...observation, kind: 'improvement', evidence: 'a project', detail: 'Your personal contribution needs more detail.' }] })).status).toBe(200);
    });
    it.each([
        { ...observation, topic: 'personality' }, { ...observation, kind: 'diagnosis' },
        { ...observation, evidence: ' ' }, { ...observation, evidence: 'x'.repeat(401) },
        { ...observation, detail: 'x'.repeat(1001) }, { ...observation, action: 'x'.repeat(801) },
        { ...observation, detail: '' }, { ...observation, action: '' }
    ])('rejects invalid or excessive observation detail', value => {
        expect(reportSchema.safeParse({ ...report, observations: [value] }).success).toBe(false);
    });
    it('bounds observations to eight', () => {
        expect(reportSchema.safeParse({ ...report, observations: Array(9).fill(observation) }).success).toBe(false);
    });
});
