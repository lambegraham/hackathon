import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ApiError } from './http';

export type TranscriptLine = {
    id: string;
    text: string;
    final: boolean;
    detectedLanguage: string | null;
    updatedAt: string;
};

export type StoredTranscript = {
    sessionId: string;
    createdAt: string;
    language: string;
    lines: TranscriptLine[];
};

export type TranscriptStore = {
    read(sessionId: string): Promise<StoredTranscript | null>;
    save(session: StoredTranscript): Promise<void>;
};

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertSessionId(sessionId: string) {
    if (!SESSION_ID.test(sessionId))
        throw new ApiError(400, 'Use a session id.');
    return sessionId;
}

export function upsertLine(existing: StoredTranscript | null, sessionId: string, language: string, line: TranscriptLine): StoredTranscript {
    const current = existing ?? { sessionId, createdAt: line.updatedAt, language, lines: [] };
    const index = current.lines.findIndex(item => item.id === line.id);
    if (index === -1) {
        if (current.lines.length >= 200)
            throw new ApiError(413, 'This session has too many lines.');
        return { ...current, lines: [...current.lines, line] };
    }
    if (current.lines[index].final)
        throw new ApiError(409, 'That line is already saved.');
    const lines = current.lines.slice();
    lines[index] = line;
    return { ...current, lines };
}

export function createFileTranscriptStore(directory = path.join(process.cwd(), '.data', 'transcripts')): TranscriptStore {
    const fileFor = (sessionId: string) => path.join(directory, `${assertSessionId(sessionId)}.json`);
    return {
        async read(sessionId) {
            try {
                return JSON.parse(await readFile(fileFor(sessionId), 'utf8')) as StoredTranscript;
            }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT')
                    return null;
                throw new ApiError(500, 'The saved transcript could not be read.');
            }
        },
        async save(session) {
            await mkdir(directory, { recursive: true });
            const file = fileFor(session.sessionId);
            const temporary = `${file}.${process.pid}.tmp`;
            await writeFile(temporary, JSON.stringify(session), 'utf8');
            await rename(temporary, file);
        }
    };
}

let activeStore: TranscriptStore = createFileTranscriptStore();

export function transcriptStore() {
    return activeStore;
}

export function setTranscriptStore(store: TranscriptStore) {
    activeStore = store;
}
