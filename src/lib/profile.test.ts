import { describe, expect, it, vi } from 'vitest';
import { clearProfile, compareSession, deleteSession, getComparableSessions, PROFILE_STORAGE_KEY, ProfileStorageError, readProfile, saveSession, sessionNumber, type ProfileStorage, type SavedSession } from './profile';

class MemoryStorage implements ProfileStorage {
  value: string | null = null;
  fail = false;
  getItem() { if (this.fail) throw new Error('denied'); return this.value; }
  setItem(_key: string, value: string) { if (this.fail) throw new Error('quota'); this.value = value; }
  removeItem() { if (this.fail) throw new Error('denied'); this.value = null; }
}
const report = { summary: 'Clear summary', strengths: ['Clear', 'Relevant'] as [string,string], improvements: ['Examples', 'Structure'] as [string,string], suggestedResponse: 'Example response', assessment: Object.fromEntries(['clarity','structure','specificity','relevance'].map(key => [key,{score:3,evidence:'A concrete example.',action:'Add one detail.'}])) };
const session = (id = 'one', overrides: Partial<SavedSession> = {}): SavedSession => ({ id, completedAt:'2026-10-10T10:00:00.000Z', scenarioId:'interview', difficulty:'neutral', durationSeconds:60, messages:[{role:'user',content:'My experience'}], report: report as SavedSession['report'], ...overrides });

describe('local profile storage', () => {
  it('persists audio analysis and recording references without putting audio bytes in localStorage', () => {
    const storage = new MemoryStorage();
    const audio = { recordings: [{ id: 'recording-1', durationSeconds: 10 }], analyses: [{ recordingId: 'recording-1', model: 'gemini-3.5-transcribe', transcript: 'Um hello', fillers: [{ word: 'Um', startSeconds: 1, endSeconds: 1.2 }] }] };
    const saved = saveSession({ ...session(), audio }, storage);
    expect(readProfile(storage).sessions[0]).toEqual(saved.sessions[0]);
    expect(saved.sessions[0]).toHaveProperty('audio', audio);
  });
  it('starts empty and persists validated sessions', () => {
    const storage = new MemoryStorage();
    expect(readProfile(storage)).toEqual({version:1,sessions:[]});
    const saved = saveSession(session(),storage);
    expect(saved.sessions).toHaveLength(1);
    expect(readProfile(storage)).toEqual(saved);
    expect(PROFILE_STORAGE_KEY).toBe('rehearsal.profile.v1');
  });
  it('saves custom descriptions accepted by the conversation API', () => {
    const storage = new MemoryStorage();
    const custom = session('custom', {scenarioId:'custom',customScenario:'x'.repeat(1000)});
    expect(saveSession(custom,storage).sessions[0].customScenario).toBe(custom.customScenario);
  });
  it('upserts by ID without duplicating and keeps chronological order', () => {
    const storage = new MemoryStorage();
    saveSession(session('new',{completedAt:'2026-10-11T10:00:00.000Z'}),storage);
    saveSession(session('old'),storage);
    const saved = saveSession(session('old',{durationSeconds:90}),storage);
    expect(saved.sessions.map(s => s.id)).toEqual(['old','new']);
    expect(saved.sessions[0].durationSeconds).toBe(90);
  });
  it('retains the newest fifty sessions', () => {
    const storage = new MemoryStorage();
    for (let i=0;i<51;i++) saveSession(session(String(i),{completedAt:new Date(Date.UTC(2026,9,10,10,i)).toISOString()}),storage);
    expect(readProfile(storage).sessions).toHaveLength(50);
    expect(readProfile(storage).sessions[0].id).toBe('1');
  });
  it('deletes sessions and explicitly clears even corrupt data', () => {
    const storage = new MemoryStorage();
    saveSession(session(),storage);
    expect(deleteSession('one',storage).sessions).toEqual([]);
    storage.value = 'broken';
    clearProfile(storage);
    expect(readProfile(storage).sessions).toEqual([]);
  });
  it('surfaces corrupt/unknown version data and never overwrites it', () => {
    const storage = new MemoryStorage();
    for (const invalid of ['broken',JSON.stringify({version:2,sessions:[]}),JSON.stringify({version:1,sessions:[session('bad',{durationSeconds:-1})]})]) {
      storage.value = invalid;
      expect(() => readProfile(storage)).toThrow(ProfileStorageError);
      expect(() => saveSession(session(),storage)).toThrow(ProfileStorageError);
      expect(storage.value).toBe(invalid);
    }
  });
  it('rejects oversized stored data, invalid new sessions and unavailable storage', () => {
    const storage = new MemoryStorage();
    storage.value = 'x'.repeat(4*1024*1024+1);
    expect(() => readProfile(storage)).toThrow(ProfileStorageError);
    storage.value = null;
    expect(() => saveSession(session('bad',{messages:[{role:'user',content:'x'.repeat(4001)}]}),storage)).toThrow(ProfileStorageError);
    storage.fail = true;
    expect(() => readProfile(storage)).toThrow(ProfileStorageError);
    expect(() => clearProfile(storage)).toThrow(ProfileStorageError);
    expect(() => readProfile()).toThrow(ProfileStorageError);
  });
  it('uses browser storage by default and handles browser denial', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('window', {localStorage:storage});
    try { expect(saveSession(session()).sessions).toHaveLength(1); }
    finally { vi.unstubAllGlobals(); }
    vi.stubGlobal('window', {get localStorage() { throw new Error('blocked'); }});
    try { expect(() => readProfile()).toThrow(ProfileStorageError); }
    finally { vi.unstubAllGlobals(); }
  });
  it('keeps prior profile intact when serialized sessions exceed storage limit', () => {
    const storage = new MemoryStorage();
    const messages = Array.from({length:40}, () => ({role:'user' as const,content:'文'.repeat(4000)}));
    for (let i=0;i<8;i++) saveSession(session(String(i),{messages}),storage);
    const prior = storage.value;
    expect(() => saveSession(session('overflow',{messages}),storage)).toThrow(ProfileStorageError);
    expect(storage.value).toBe(prior);
  });
  it('rejects duplicate persisted IDs and unexpected audio data', () => {
    const storage = new MemoryStorage();
    storage.value = JSON.stringify({version:1,sessions:[session(),session()]});
    expect(() => readProfile(storage)).toThrow(ProfileStorageError);
    storage.value = JSON.stringify({version:1,sessions:[{...session(),audio:'secret audio'}]});
    expect(() => readProfile(storage)).toThrow(ProfileStorageError);
  });
  it('does not claim persistence when write fails', () => {
    const storage = new MemoryStorage();
    storage.setItem = () => { throw new Error('quota'); };
    expect(() => saveSession(session(),storage)).toThrow(ProfileStorageError);
    expect(storage.value).toBeNull();
  });
});

describe('evidence-based comparisons', () => {
  it('compares only latest earlier matching scenario and difficulty', () => {
    const current = session('current',{completedAt:'2026-10-12T10:00:00.000Z'});
    const old = session('old',{completedAt:'2026-10-09T10:00:00.000Z'});
    const prior = session('prior');
    const unrelated = session('unrelated',{scenarioId:'raise'});
    const harder = session('harder',{difficulty:'challenging'});
    const future = session('future',{completedAt:'2026-10-13T10:00:00.000Z'});
    expect(getComparableSessions(current,[prior,harder,future,current,unrelated,old]).map(s=>s.id)).toEqual(['old','prior']);
    expect(sessionNumber(old,[old,prior,current,unrelated])).toBe(1);
    expect(sessionNumber(prior,[old,prior,current,unrelated])).toBe(2);
    expect(sessionNumber(current,[old,prior,current,unrelated])).toBe(3);
    expect(sessionNumber(unrelated,[old,prior,current,unrelated])).toBe(1);
    const comparison = compareSession(current,[old,prior,unrelated]);
    expect(comparison?.previousSessionId).toBe('prior');
    expect(comparison?.metrics[0]).toMatchObject({key:'clarity',current:3,previous:3,delta:0});
    expect(comparison?.overall).toEqual({current:3,previous:3,delta:0});
  });
  it('reports positive and negative changes from saved scores', () => {
    const prior = session();
    const current = session('current',{completedAt:'2026-10-11T10:00:00.000Z',report:{...report,assessment:{clarity:{score:5,evidence:'Clear',action:'Keep it'},structure:{score:2,evidence:'Unclear order',action:'Order it'},specificity:{score:4,evidence:'Example',action:'Detail'},relevance:{score:3,evidence:'Relevant',action:'Focus'}}} as SavedSession['report']});
    expect(compareSession(current,[prior])?.metrics.map(m=>m.delta)).toEqual([2,-1,1,0]);
    expect(compareSession(current,[prior])?.overall.delta).toBe(0.5);
  });
  it('has no fabricated baseline for first sessions or missing assessment', () => {
    const current = session('current',{completedAt:'2026-10-11T10:00:00.000Z'});
    const {assessment: ignored,...legacy} = report;
    void ignored;
    expect(compareSession(current,[])).toBeNull();
    expect(compareSession(current,[session('legacy',{report:legacy})])).toBeNull();
    expect(compareSession({...current,report:legacy},[session()])).toBeNull();
  });
  it('matches custom scenario text after whitespace/case normalization', () => {
    const current = session('current',{scenarioId:'custom',customScenario:' Explain   a delay ',completedAt:'2026-10-11T10:00:00.000Z'});
    const same = session('same',{scenarioId:'custom',customScenario:'explain a delay'});
    const other = session('other',{scenarioId:'custom',customScenario:'Ask for support'});
    expect(getComparableSessions(current,[same,other])).toEqual([same]);
  });
});


describe('targeted interview history', () => {
  it('persists the target role and only compares the same role', () => {
    const storage = new MemoryStorage();
    const targeted = {...session('targeted'), targetRole:'Backend Engineer'};
    expect(saveSession(targeted, storage).sessions[0]).toMatchObject({targetRole:'Backend Engineer'});
    const current = {...session('current', {completedAt:'2026-10-11T10:00:00.000Z'}), targetRole:' backend engineer '};
    expect(getComparableSessions(current, [targeted, {...session('other'), targetRole:'Product Manager'}, session('legacy')]).map(item => item.id)).toEqual(['targeted']);
  });
});


it('keeps raw speech segments, filler words, repeated words and timing after reload', () => {
  const storage=new MemoryStorage();
  const spoken={...session('speech'),messages:[{role:'user' as const,content:'  Um... I, I like it! ',speech:{source:'gradium' as const,segments:[{text:'  Um...',startSeconds:0.2,endSeconds:0.6},{text:' I, I like it! ',startSeconds:1.4,endSeconds:2.8}]}}]};
  saveSession(spoken,storage);
  expect(readProfile(storage).sessions[0].messages).toEqual(spoken.messages);
});
