import { liveHintRequestSchema } from '@/lib/live-hint';
import { handle, json, readJson } from '@/lib/server/http';
import { liveHint } from '@/lib/server/live-hint';
export const runtime = 'nodejs';
export async function POST(request: Request) {
    return handle(request, async () => json(await liveHint(await readJson(request, liveHintRequestSchema, 65536))));
}
