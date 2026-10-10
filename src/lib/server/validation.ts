import { z } from 'zod';
export const sessionSchema = z.object({
    scenarioId: z.enum(['interview', 'raise', 'relationship', 'feedback', 'custom']), difficulty: z.enum(['friendly', 'neutral', 'challenging']), customScenario: z.string().trim().max(1500).optional(),
    messages: z.array(z.object({
        role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4000)
    }).strict()).min(1).max(40)
}).strict().refine(v => v.messages.some(m => m.role === 'user'), 'Provide at least one user answer.').refine(v => v.scenarioId !== 'custom' || Boolean(v.customScenario), 'Describe the custom scenario.').refine(v => v.messages.reduce((n, m) => n + m.content.length, 0) <= 24000, 'Conversation is too long.');
export const speakSchema = z.object({ text: z.string().trim().min(1).max(2000), voiceId: z.enum(['marshall', 'lainey']).optional(), format: z.enum(['wav', 'pcm']).default('wav') }).strict();
export const feedbackSchema = z.object({
    summary: z.string().trim().min(1).max(2000), strengths: z.tuple([z.string().min(1).max(1000), z.string().min(1).max(1000)]), improvements: z.tuple([z.string().min(1).max(1000), z.string().min(1).max(1000)]), suggestedResponse: z.string().trim().min(1).max(4000)
}).strict();
