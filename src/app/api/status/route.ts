import { json } from '@/lib/server/http';
export const dynamic = 'force-dynamic';
export async function GET() {
    return json({
        gemini: Boolean(process.env.GEMINI_API_KEY), gradium: Boolean(process.env.GRADIUM_API_KEY)
    });
}
