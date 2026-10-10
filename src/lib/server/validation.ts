import { z } from 'zod';
import { speechMetadataSchema } from '@/lib/speech-schema';
import { reportSchema } from '@/lib/feedback';
export const tonalitySchema = z.enum(['calm', 'reassuring', 'empathic', 'friendly', 'confident', 'excited', 'neutral']);
export const userToneSchema = z.enum(['confident', 'calm', 'enthusiastic', 'neutral', 'hesitant', 'nervous', 'defensive', 'frustrated', 'upset']);
export const sessionSchema = z.object({
    scenarioId: z.enum(['interview', 'raise', 'relationship', 'feedback', 'flatmate', 'coldcall', 'bazaar', 'custom']), difficulty: z.enum(['friendly', 'neutral', 'challenging']), customScenario: z.string().trim().max(1500).optional(), tonality: z.union([tonalitySchema, z.literal('auto')]).optional(),
    messages: z.array(z.object({
        role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4000).refine(value => Boolean(value.trim())), speech: speechMetadataSchema.optional()
    }).strict()).min(1).max(40)
}).strict().refine(v => v.messages.some(m => m.role === 'user'), 'Provide at least one user answer.').refine(v => v.scenarioId !== 'custom' || Boolean(v.customScenario), 'Describe the custom scenario.').refine(v => v.messages.reduce((n, m) => n + m.content.length, 0) <= 24000, 'Conversation is too long.');
export const speakSchema = z.object({ text: z.string().trim().min(1).max(2000), tonality: tonalitySchema.optional(), voiceId: z.enum(['marshall', 'lainey']).optional(), format: z.enum(['wav', 'pcm']).default('wav') }).strict();
export const converseReplySchema = z.object({
    reply: z.string().trim().min(1).max(2000), userTone: userToneSchema, tonality: tonalitySchema
}).strict();
export const feedbackSchema = reportSchema.required({ assessment: true, coaching: true });
const targetRoleSchema = z.string().trim().max(300).optional();
const priorReportSchema = reportSchema.pick({ summary: true, assessment: true }).extend({ nextGoal: z.string().trim().max(800).optional() }).strict();
const previousSessionSchema = sessionSchema.safeExtend({ id: z.string().trim().min(1).max(100), targetRole: targetRoleSchema, report: priorReportSchema });
const normalized = (value?: string) => (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
export const feedbackInputSchema = sessionSchema.safeExtend({ targetRole: targetRoleSchema, previousSession: previousSessionSchema.optional() }).refine(input => {
    const previous = input.previousSession;
    return !previous || (previous.scenarioId === input.scenarioId && previous.difficulty === input.difficulty
        && normalized(previous.targetRole) === normalized(input.targetRole)
        && (input.scenarioId !== 'custom' || normalized(previous.customScenario) === normalized(input.customScenario)));
}, 'Prior session must have the same scenario, difficulty, target role and custom description.');
