import { z } from 'zod';

const timestamp = z.number().finite().min(0).max(600);
export const speechMetadataSchema = z.object({
  source: z.literal('gradium'),
  segments: z.array(z.object({
    text: z.string().min(1).max(4000),
    startSeconds: timestamp.optional(),
    endSeconds: timestamp.optional()
  }).strict().refine(segment => segment.startSeconds === undefined || segment.endSeconds === undefined || segment.endSeconds >= segment.startSeconds, 'Speech end precedes its start.')).min(1).max(4000)
}).strict().refine(speech => speech.segments.reduce((total, segment) => total + segment.text.length, 0) <= 4000, 'Speech transcript is too long.');
