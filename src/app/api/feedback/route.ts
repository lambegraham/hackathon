import { feedback } from '@/lib/server/gemini';
import { handle, json, readJson } from '@/lib/server/http';
import { feedbackInputSchema } from '@/lib/server/validation';
export const runtime = 'nodejs';
export async function POST(request: Request) {
    return handle(request, async () => json(await feedback(await readJson(request, feedbackInputSchema, 196608))));
}
