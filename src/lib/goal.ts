import { z } from 'zod';
import { liveItemSchema, MAX_TARGET, normalizeForMatch } from './background';

/**
 * The goal tracker: the conversation target turned into a short, fixed checklist.
 * Points never change during a session; only their "covered" state does, and only forward.
 */
export const MIN_POINTS = 2;
export const MAX_POINTS = 6;
export type GoalPoint = { id: string; label: string; why: string; itemIds: string[] };
export type Coverage = Record<string, string>;

const scenarioEnum = z.enum(['interview', 'raise', 'relationship', 'feedback', 'flatmate', 'coldcall', 'bazaar', 'custom']);
const difficultyEnum = z.enum(['friendly', 'neutral', 'challenging']);

export const goalPlanRequestSchema = z.object({
  scenarioId: scenarioEnum,
  difficulty: difficultyEnum,
  customScenario: z.string().trim().max(1500).optional(),
  target: z.string().trim().min(10).max(MAX_TARGET),
  items: z.array(liveItemSchema).max(60).default([]),
}).strict();
export type GoalPlanRequest = z.infer<typeof goalPlanRequestSchema>;

export const goalPlanOutputSchema = z.object({
  points: z.array(z.object({
    label: z.string().trim().min(1).max(90),
    why: z.string().trim().max(220).default(''),
    itemIds: z.array(z.string().max(64)).max(6).default([]),
  }).strict()).min(1).max(10),
}).strict();

const pointRefSchema = z.object({ id: z.string().min(1).max(16), label: z.string().trim().min(1).max(90) }).strict();
export const goalCheckRequestSchema = z.object({
  target: z.string().trim().min(1).max(MAX_TARGET),
  points: z.array(pointRefSchema).min(1).max(MAX_POINTS),
  coveredIds: z.array(z.string().max(16)).max(MAX_POINTS).default([]),
  question: z.string().trim().max(4000).default(''),
  answer: z.string().trim().min(1).max(4000),
}).strict();
export type GoalCheckRequest = z.infer<typeof goalCheckRequestSchema>;

export const goalCheckOutputSchema = z.object({
  covered: z.array(z.object({ pointId: z.string().max(16), quote: z.string().trim().max(400) }).strict()).max(10),
}).strict();

export const goalForHintSchema = z.object({ label: z.string().trim().min(1).max(90), covered: z.boolean() }).strict();

/** True when the quote is really part of what the user said. */
export function quoteInAnswer(quote: string, answer: string) {
  const needle = normalizeForMatch(quote).replace(/^["'“”]+|["'“”.,!?]+$/g, '');
  return needle.split(' ').filter(Boolean).length >= 3 && normalizeForMatch(answer).includes(needle);
}

/**
 * The next point worth raising, decided in code so it is stable: the first uncovered point backed by profile
 * evidence, else the first uncovered point (a gap to prepare for). Null when everything is covered.
 */
export function nextPoint(points: GoalPoint[], covered: Coverage) {
  const open = points.filter(point => !covered[point.id]);
  return open.find(point => point.itemIds.length > 0) ?? open[0] ?? null;
}
