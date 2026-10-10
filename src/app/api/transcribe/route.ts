import { transcribe } from '@/lib/server/gradium';
import { ApiError, handle, json, readLimited } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
    return handle(request, async () => {
        if (request.headers.get('content-type')?.split(';')[0] !== 'audio/wav')
            throw new ApiError(415, 'Expected audio/wav.');
        return json(await transcribe(await readLimited(request, 12 * 1024 * 1024)));
    });
}
