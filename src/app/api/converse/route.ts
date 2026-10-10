import { converse } from '@/lib/server/gemini';
import { ApiError, handle, json, readJson } from '@/lib/server/http';
import { sessionSchema } from '@/lib/server/validation';
export const runtime = 'nodejs';
export async function POST(request: Request) {
    return handle(request, async () => {
        const input = await readJson(request, sessionSchema);
        if (input.messages.at(-1)?.role !== 'user')
            throw new ApiError(400, 'The last conversation message must be from the user.');
        return json(await converse(input));
    });
}
