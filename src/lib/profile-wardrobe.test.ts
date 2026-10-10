import { describe, expect, it } from 'vitest';
import { readProfile, saveSession, type ProfileStorage, type SavedSession } from './profile';

describe('wardrobe scenario persistence', () => {
    it.each(['flatmate', 'coldcall', 'bazaar'] as const)('saves and reloads %s with speech metadata', scenarioId => {
        let raw: string | null = null;
        const storage: ProfileStorage = {
            getItem: () => raw,
            setItem: (_key, value) => { raw = value; },
            removeItem: () => { raw = null; }
        };
        const session: SavedSession = {
            id: scenarioId, completedAt: '2026-10-10T10:00:00.000Z', scenarioId,
            difficulty: 'neutral', durationSeconds: 10,
            messages: [{ role: 'user', content: 'My example.', speech: { source: 'gradium', segments: [{ text: 'My example.', startSeconds: 1, endSeconds: 3 }] } }],
            report: { summary: 'A concrete example.', strengths: ['Clear', 'Relevant'], improvements: ['Detail', 'Structure'], suggestedResponse: 'My example.' }
        };
        expect(saveSession(session, storage).sessions).toEqual([session]);
        expect(readProfile(storage).sessions).toEqual([session]);
    });
});
