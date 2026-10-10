import { z } from 'zod';
import { speechMetadataSchema } from './speech-schema';
import type { ConversationMessage, Difficulty, FeedbackReport, ScenarioId } from './contracts';
import { ASSESSMENT_DIMENSIONS, reportSchema } from './feedback';

export const PROFILE_STORAGE_KEY = 'rehearsal.profile.v1';
export const MAX_PROFILE_SESSIONS = 50;
const MAX_PROFILE_BYTES = 4 * 1024 * 1024;
export const COACHING_METRICS = ASSESSMENT_DIMENSIONS.map(({ id, label }) => ({ key: id, label }));

export type SavedSession = {
    id: string;
    completedAt: string;
    scenarioId: ScenarioId;
    difficulty: Difficulty;
    customScenario?: string;
    targetRole?: string;
    durationSeconds: number;
    messages: ConversationMessage[];
    report: FeedbackReport;
};
export type LocalProfile = { version: 1; sessions: SavedSession[] };
export type ProfileStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class ProfileStorageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ProfileStorageError';
    }
}

const sessionSchema = z.object({
    id: z.string().min(1).max(128),
    completedAt: z.iso.datetime(),
    scenarioId: z.enum(['interview', 'raise', 'relationship', 'feedback', 'flatmate', 'coldcall', 'bazaar', 'custom']),
    difficulty: z.enum(['friendly', 'neutral', 'challenging']),
    customScenario: z.string().max(1500).optional(),
    targetRole: z.string().trim().max(200).optional(),
    durationSeconds: z.number().finite().min(0).max(86400),
    messages: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
        speech: speechMetadataSchema.optional()
    }).strict()).min(1).max(40),
    report: reportSchema
}).strict().refine(session => session.scenarioId !== 'custom' || Boolean(session.customScenario?.trim()), {
    message: 'A custom session needs its scenario description.'
});
const profileSchema = z.object({ version: z.literal(1), sessions: z.array(sessionSchema).max(MAX_PROFILE_SESSIONS) }).strict()
    .refine(profile => new Set(profile.sessions.map(session => session.id)).size === profile.sessions.length, { message: 'Duplicate session IDs.' });
const emptyProfile = (): LocalProfile => ({ version: 1, sessions: [] });

function resolveStorage(storage?: ProfileStorage): ProfileStorage {
    if (storage) return storage;
    try {
        if (typeof window !== 'undefined') return window.localStorage;
    } catch { /* Report denied browser storage below. */ }
    throw new ProfileStorageError('Local profile storage is unavailable in this browser.');
}

function withinSizeLimit(raw: string): boolean {
    return raw.length <= MAX_PROFILE_BYTES && new TextEncoder().encode(raw).byteLength <= MAX_PROFILE_BYTES;
}

export function readProfile(storage?: ProfileStorage): LocalProfile {
    const target = resolveStorage(storage);
    let raw: string | null;
    try { raw = target.getItem(PROFILE_STORAGE_KEY); }
    catch { throw new ProfileStorageError('Your local profile could not be read. Check browser storage permissions.'); }
    if (raw === null) return emptyProfile();
    if (!withinSizeLimit(raw)) throw new ProfileStorageError('Your local profile is too large to load safely. Clear it to start again.');
    try {
        return profileSchema.parse(JSON.parse(raw));
    } catch {
        throw new ProfileStorageError('Your local profile contains unreadable data. It has been kept intact; clear it to start again.');
    }
}

function writeProfile(profile: LocalProfile, storage: ProfileStorage): LocalProfile {
    const raw = JSON.stringify(profile);
    if (!withinSizeLimit(raw)) throw new ProfileStorageError('Your local profile is full. Delete an older conversation and try again.');
    try { storage.setItem(PROFILE_STORAGE_KEY, raw); }
    catch { throw new ProfileStorageError('This report could not be saved locally. Browser storage may be full or blocked.'); }
    return profile;
}

export function saveSession(session: SavedSession, storage?: ProfileStorage): LocalProfile {
    const validated = sessionSchema.safeParse(session);
    if (!validated.success) throw new ProfileStorageError('This report could not be saved because its session data is invalid.');
    const target = resolveStorage(storage);
    const profile = readProfile(target);
    const sessions = [...profile.sessions.filter(saved => saved.id !== session.id), validated.data]
        .sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt))
        .slice(-MAX_PROFILE_SESSIONS);
    return writeProfile({ version: 1, sessions }, target);
}

export function deleteSession(id: string, storage?: ProfileStorage): LocalProfile {
    const target = resolveStorage(storage);
    const profile = readProfile(target);
    return writeProfile({ version: 1, sessions: profile.sessions.filter(session => session.id !== id) }, target);
}

export function clearProfile(storage?: ProfileStorage): LocalProfile {
    const target = resolveStorage(storage);
    try { target.removeItem(PROFILE_STORAGE_KEY); }
    catch { throw new ProfileStorageError('Your local profile could not be cleared. Check browser storage permissions.'); }
    return emptyProfile();
}

const normalizeScenario = (value?: string) => value?.trim().toLocaleLowerCase('en').replace(/\s+/g, ' ') ?? '';
/** 1-based place in the same scenario, difficulty, role, and custom text. A first practice is Session 1. */
export function sessionNumber(current: SavedSession, sessions: SavedSession[]): number {
    return getComparableSessions(current, sessions).length + 1;
}

export function getComparableSessions(current: SavedSession, sessions: SavedSession[]): SavedSession[] {
    return sessions.filter(session => session.id !== current.id
        && Date.parse(session.completedAt) <= Date.parse(current.completedAt)
        && session.scenarioId === current.scenarioId && session.difficulty === current.difficulty
        && normalizeScenario(session.targetRole) === normalizeScenario(current.targetRole)
        && (current.scenarioId !== 'custom' || normalizeScenario(session.customScenario) === normalizeScenario(current.customScenario)))
        .sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt));
}

export type ScoreChange = { current: number; previous: number; delta: number };
export type SessionComparison = {
    previousSessionId: string;
    metrics: (ScoreChange & { key: typeof COACHING_METRICS[number]['key']; label: string })[];
    overall: ScoreChange;
};
export function compareSession(current: SavedSession, sessions: SavedSession[]): SessionComparison | null {
    const previous = getComparableSessions(current, sessions).at(-1);
    if (!current.report.assessment || !previous?.report.assessment) return null;
    const currentAssessment = current.report.assessment;
    const previousAssessment = previous.report.assessment;
    const metrics = COACHING_METRICS.map(({ key, label }) => {
        const current = currentAssessment[key].score;
        const prior = previousAssessment[key].score;
        return { key, label, current, previous: prior, delta: current - prior };
    });
    const currentAverage = metrics.reduce((total, item) => total + item.current, 0) / metrics.length;
    const previousAverage = metrics.reduce((total, item) => total + item.previous, 0) / metrics.length;
    return { previousSessionId: previous.id, metrics, overall: { current: currentAverage, previous: previousAverage, delta: currentAverage - previousAverage } };
}
