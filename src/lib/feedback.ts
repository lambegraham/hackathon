import { z } from 'zod';
import type { AssessmentDimension } from './contracts';

export const ASSESSMENT_DIMENSIONS: { id: AssessmentDimension; label: string; description: string }[] = [
    { id: 'clarity', label: 'Clarity', description: 'How clearly your words convey your main point.' },
    { id: 'structure', label: 'Structure', description: 'How well your answer follows a coherent sequence.' },
    { id: 'specificity', label: 'Specificity', description: 'How concrete your examples, details, and outcomes are.' },
    { id: 'relevance', label: 'Relevance', description: 'How directly your answer addresses the conversation.' }
];

const assessmentItemSchema = z.object({
    score: z.number().int().min(1).max(5),
    evidence: z.string().trim().min(1).max(400),
    action: z.string().trim().min(1).max(500)
}).strict();

const scoreSchema = z.number().int().min(1).max(5).nullable();
export const coachingSchema = z.object({
    rubricVersion: z.literal('interview-coach-v1'),
    answerReviews: z.array(z.object({
        messageIndex: z.number().int().min(0).max(39),
        question: z.string().trim().min(1).max(2000),
        scores: z.object({ clarity: scoreSchema, structure: scoreSchema, specificity: scoreSchema, relevance: scoreSchema }).strict(),
        evidence: z.string().trim().min(1).max(400),
        feedback: z.string().trim().min(1).max(1000)
    }).strict()).min(1).max(40),
    priority: z.string().trim().min(1).max(800),
    drill: z.string().trim().min(1).max(1500),
    nextGoal: z.string().trim().min(1).max(800),
    progress: z.object({
        previousSessionId: z.string().trim().min(1).max(100).optional(),
        changes: z.array(z.object({
            dimension: z.enum(['clarity','structure','specificity','relevance']),
            direction: z.enum(['improved','declined','unchanged']),
            currentEvidence: z.string().trim().min(1).max(400),
            previousEvidence: z.string().trim().min(1).max(400),
            explanation: z.string().trim().min(1).max(1000)
        }).strict()).max(4)
    }).strict()
}).strict();

export const reportSchema = z.object({
    coaching: coachingSchema.optional(),
    summary: z.string().trim().min(1).max(2000),
    strengths: z.tuple([z.string().trim().min(1).max(1000), z.string().trim().min(1).max(1000)]),
    improvements: z.tuple([z.string().trim().min(1).max(1000), z.string().trim().min(1).max(1000)]),
    suggestedResponse: z.string().trim().min(1).max(4000),
    assessment: z.object({
        clarity: assessmentItemSchema,
        structure: assessmentItemSchema,
        specificity: assessmentItemSchema,
        relevance: assessmentItemSchema
    }).strict().optional()
}).strict();
