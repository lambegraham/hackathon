import { z } from 'zod';
import { ApiError, handle, json, readJson } from '@/lib/server/http';
import { assertSessionId, transcriptStore, upsertLine, type TranscriptLine } from '@/lib/server/transcript-store';
import { wisprLanguage } from '@/lib/server/wispr';

export const runtime = 'nodejs';

const lineSchema = z.object({
    sessionId: z.string(),
    lineId: z.string().trim().min(1).max(64),
    text: z.string().trim().min(1).max(8000),
    final: z.boolean(),
    detectedLanguage: z.string().trim().min(2).max(16).nullable().optional()
}).strict();

export async function GET(request: Request) {
    return handle(request, async () => {
        const sessionId = assertSessionId(new URL(request.url).searchParams.get('sessionId') ?? '');
        const saved = await transcriptStore().read(sessionId);
        if (!saved)
            throw new ApiError(404, 'No transcript is saved for that session.');
        return json(saved);
    });
}

export async function POST(request: Request) {
    return handle(request, async () => {
        const input = await readJson(request, lineSchema);
        const sessionId = assertSessionId(input.sessionId);
        const store = transcriptStore();
        const line: TranscriptLine = {
            id: input.lineId,
            text: input.text,
            final: input.final,
            detectedLanguage: input.detectedLanguage ?? null,
            updatedAt: new Date().toISOString()
        };
        const saved = upsertLine(await store.read(sessionId), sessionId, wisprLanguage(), line);
        await store.save(saved);
        return json(saved);
    });
}
