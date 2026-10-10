import { BACKGROUND_MAX_BYTES, BACKGROUND_TYPES, documentText, extractBackground } from '@/lib/server/background';
import { ApiError, handle, json, readLimited } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
    return handle(request, async () => {
        const type = request.headers.get('content-type')?.split(';')[0].trim() ?? '';
        if (!(BACKGROUND_TYPES as readonly string[]).includes(type))
            throw new ApiError(415, 'Upload a PDF, .txt or .md file, or paste text. Export LinkedIn, Notion or Word pages as PDF first.');
        const bytes = await readLimited(request, BACKGROUND_MAX_BYTES);
        if (!bytes.byteLength)
            throw new ApiError(400, 'The file is empty.');
        const includePersonal = new URL(request.url).searchParams.get('personal') === '1';
        return json(await extractBackground(await documentText(bytes, type), includePersonal));
    });
}
