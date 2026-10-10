import { z } from 'zod';
import { speechMetadataSchema } from './speech-schema';
import { audioReviewSchema, type AudioReview } from './audio-review';
import type { AssessmentDimension, ConversationMessage, Difficulty, FeedbackReport, ScenarioId } from './contracts';
import { ASSESSMENT_DIMENSIONS, reportSchema } from './feedback';

export const PROFILE_STORAGE_KEY = 'rehearsal.profile.v1';
export const MAX_PROFILE_SESSIONS = 50;
const MAX_PROFILE_BYTES = 4 * 1024 * 1024;
export const COACHING_METRICS = ASSESSMENT_DIMENSIONS.map(({ id, label }) => ({ key: id, label }));

export type LiveFeedbackSignal = {
    id: string;
    messageIndex: number;
    dimension: AssessmentDimension;
    kind: 'strength' | 'improvement';
    evidence: string;
    detail: string;
};

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
    practiceCompleted?: boolean;
    liveFeedback?: LiveFeedbackSignal[];
    audio?: AudioReview;
};
export type LocalProfile = { version: 1; sessions: SavedSession[] };
export type ProfileStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class ProfileStorageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ProfileStorageError';
    }
}

const liveFeedbackSchema = z.array(z.object({
    id: z.string().trim().min(1).max(128),
    messageIndex: z.number().int().min(0).max(39),
    dimension: z.enum(['clarity', 'structure', 'specificity', 'relevance']),
    kind: z.enum(['strength', 'improvement']),
    evidence: z.string().trim().min(1).max(400),
    detail: z.string().trim().min(1).max(1000)
}).strict()).max(40).refine(signals => new Set(signals.map(signal => signal.id)).size === signals.length);

function hasLiveEvidence(messages: ConversationMessage[], signals: LiveFeedbackSignal[]): boolean {
    return signals.every(signal => {
        const message = messages[signal.messageIndex];
        return message?.role === 'user' && message.content.includes(signal.evidence);
    });
}

/** Future live-feedback integration boundary; signals never alter post-session scores. */
export function attachLiveFeedback(session: SavedSession, signals: unknown): SavedSession {
    const validated = liveFeedbackSchema.safeParse(signals);
    if (!validated.success || !hasLiveEvidence(session.messages, validated.data)) {
        throw new ProfileStorageError('Live feedback needs unique signals with evidence from the referenced user answer.');
    }
    return { ...session, liveFeedback: validated.data };
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
    report: reportSchema,
    practiceCompleted: z.boolean().optional(),
    liveFeedback: liveFeedbackSchema.optional(),
    audio: audioReviewSchema.optional()
}).strict().refine(session => session.scenarioId !== 'custom' || Boolean(session.customScenario?.trim()), {
    message: 'A custom session needs its scenario description.'
}).refine(session => !session.liveFeedback || hasLiveEvidence(session.messages, session.liveFeedback), {
    message: 'Live feedback must quote its referenced user answer.'
}).refine(session => session.practiceCompleted === undefined || Boolean(session.report.coaching), {
    message: 'Practice completion requires a coaching plan.'
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

/** Read at update time so another view's latest report is preserved. */
export function setPracticeCompleted(id: string, completed: boolean, storage?: ProfileStorage): LocalProfile {
    if (typeof completed !== 'boolean') throw new ProfileStorageError('Practice completion must be true or false.');
    const target = resolveStorage(storage);
    const profile = readProfile(target);
    const session = profile.sessions.find(item => item.id === id);
    if (!session) throw new ProfileStorageError('This session is no longer saved.');
    if (!session.report.coaching) throw new ProfileStorageError('This session does not have a practice plan.');
    return writeProfile({ ...profile, sessions: profile.sessions.map(item => item.id === id ? { ...item, practiceCompleted: completed } : item) }, target);
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
