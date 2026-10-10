import { z } from 'zod';
import { liveItemSchema, MAX_TARGET } from './background';
import { goalForHintSchema } from './goal';

export const COMMENT_KINDS = ['mention', 'beware', 'filler', 'pace'] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];
/** One short live comment. Mention and beware come from the user's confirmed profile; filler and pace from measuring the answer. */
export type LiveComment = { kind: CommentKind; text: string; keywords: string[]; itemId?: string };

export const MAX_COMMENT_TEXT = 160;
export const liveHintRequestSchema = z.object({
  scenarioId: z.enum(['interview', 'raise', 'relationship', 'feedback', 'flatmate', 'coldcall', 'bazaar', 'custom']),
  difficulty: z.enum(['friendly', 'neutral', 'challenging']),
  customScenario: z.string().trim().max(1500).optional(),
  target: z.string().trim().max(MAX_TARGET).optional(),
  items: z.array(liveItemSchema).min(1).max(60),
  usedItemIds: z.array(z.string().max(64)).max(60).default([]),
  goals: z.array(goalForHintSchema).max(6).default([]),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4000) }).strict()).min(1).max(12),
}).strict().refine(request => request.messages.at(-1)?.role === 'assistant', 'The last message must be the counterpart’s.');
export type LiveHintRequest = z.infer<typeof liveHintRequestSchema>;

export const liveHintOutputSchema = z.object({
  type: z.enum(['mention', 'beware', 'none']),
  itemId: z.string().max(64).optional(),
  hint: z.string().trim().max(400).optional(),
  keywords: z.array(z.string().trim().min(1).max(40)).max(3).default([]),
}).strict();
