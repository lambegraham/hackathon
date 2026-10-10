import { z } from 'zod';
import { handle, json, readJson } from '@/lib/server/http';
import { assertSessionId } from '@/lib/server/transcript-store';
import { issueWisprToken, requireLocalDemo } from '@/lib/server/wispr';

export const runtime = 'nodejs';

const bodySchema = z.object({ sessionId: z.string() }).strict();

export async function POST(request: Request) {
    return handle(request, async () => {
        requireLocalDemo(request);
        const { sessionId } = await readJson(request, bodySchema);
        assertSessionId(sessionId);
        return json(await issueWisprToken(sessionId, request.signal));
    });
}
