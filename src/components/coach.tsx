'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronRight, Maximize2, Minimize2, MessageCircle, Mic, RotateCcw, Send, Square, Volume2 } from 'lucide-react';
import { createDuplexSession } from '@/lib/duplex-session';
import { createSessionAudio, type AudioRecording } from '@/lib/session-audio';
import { loadAudioRecording, deleteSessionAudio, clearSessionAudio } from '@/lib/audio-storage';
import { saveRecordedSession } from '@/lib/save-recorded-session';
import { analyseSessionAudio } from '@/lib/analyse-session-audio';
import { createStreamingPlayer } from '@/lib/streaming-audio';
import { VOICES, type VoiceId } from '@/lib/voices';
import { SCENARIOS } from '@/lib/scenarios';
import type { ConversationMessage, ConverseReply, FeedbackReport, ScenarioId, SpeechMetadata, Tonality, UserTone } from '@/lib/contracts';
import { useVoiceSession } from '@/hooks/use-voice-session';
import type { AvatarState } from './avatar';
import { readProfile, deleteSession, clearProfile, getComparableSessions, setPracticeCompleted, type SavedSession } from '@/lib/profile';
import { SessionReport } from './session-report';
import { ProfileDashboard } from './profile-dashboard';
import { Sunflower } from './sunflower';
import { Wardrobe } from './wardrobe';
import { OUTFITS } from './outfits';
import { tonalityById, userToneLabel } from '@/lib/tonality';
import { GardenScenery } from './garden-scenery';
import './profile.css';
import './garden-studio.css';

type Difficulty = 'friendly' | 'neutral' | 'challenging';
type Setup = { gemini: boolean; gradium: boolean };
const textMessages = (messages: ConversationMessage[]) => messages.map(({role,content}) => ({role,content}));

async function responseError(response: Response) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : 'Something went wrong. Please try again.';
}

function SoundWave({ active = false, color = 'blue' }: { active?: boolean; color?: 'blue' | 'slate' }) {
  return (
    <div className={`sound-wave ${active ? 'active' : ''} sound-wave-${color}`} aria-hidden="true">
      <span /><span /><span /><span /><span /><span /><span />
    </div>
  );
}

function Intro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'hold' | 'split'>('hold');
  useEffect(() => {
    const quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const split = setTimeout(() => setPhase('split'), quick ? 200 : 1100);
    const done = setTimeout(onDone, quick ? 500 : 2300);
    return () => { clearTimeout(split); clearTimeout(done); };
  }, [onDone]);
  return <div className={`intro intro-${phase}`} onClick={onDone} aria-hidden="true">
    <span className="intro-word intro-left">Got credits?</span>
    <span className="intro-word intro-right">:)</span>
  </div>;
}

export function Coach() {
  const [intro, setIntro] = useState(true);
  const endIntro = useCallback(() => setIntro(false), []);
  const [tones, setTones] = useState<{ userTone?: UserTone; tonality?: Tonality }>({});
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [stageMaximized, setStageMaximized] = useState(false);
  const [scenarioId, setScenarioId] = useState<ScenarioId>('interview');
  const [voiceId, setVoiceId] = useState<VoiceId | 'auto'>('auto');
  const [preparingVoice, setPreparingVoice] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('neutral');
  const [customScenario, setCustomScenario] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [practiceQuestion, setPracticeQuestion] = useState('');
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<AvatarState>('idle');
  const [busy, setBusy] = useState(false);
  const [liveActive, setLiveActive] = useState(false);
  const [liveStarting, setLiveStarting] = useState(false);
  const [partial, setPartial] = useState('');
  const [micStarting, setMicStarting] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<FeedbackReport | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [currentSession, setCurrentSession] = useState<SavedSession | null>(null);
  const [saveError, setSaveError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [reportSaved, setReportSaved] = useState(false);
  const sessionMeta = useRef<{ id: string; startedAt: number } | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [setupFailed, setSetupFailed] = useState(false);
  const recorder = useVoiceSession();
  const lock = useRef(false);
  const generation = useRef(0);
  const sessionGeneration = useRef(0);
  const live = useRef(false);
  const duplex = useRef<ReturnType<typeof createDuplexSession> | null>(null);
  const messagesRef = useRef<ConversationMessage[]>([]);
  const liveTurn = useRef<(text: string, speech?: SpeechMetadata) => Promise<void>>(async () => {});
  const controller = useRef<AbortController | null>(null);
  const player = useRef<ReturnType<typeof createStreamingPlayer> | null>(null);
  const transcriptEnd = useRef<HTMLDivElement | null>(null);
  const scenario = SCENARIOS.find(item => item.id === scenarioId) ?? SCENARIOS[0];
  const voice = VOICES.find(item => item.id === voiceId);
  const tone = tones.tonality && tonalityById(tones.tonality);
  const feeling = tones.userTone && userToneLabel(tones.userTone).toLowerCase();
  const outfit = OUTFITS.find(item => item.id === scenarioId)?.id;
  const counterpart = `${voice?.name ?? tone?.voiceName ?? 'Sunflower'} · ${({ interview: 'Interviewer', raise: 'Your manager', relationship: 'Your partner', feedback: 'Your colleague', custom: 'Your counterpart', flatmate: 'Your flatmate', coldcall: 'Your customer', bazaar: 'Your buyer' } as Record<string, string>)[scenarioId]}`;
  const hasUserTurn = messages.some(message => message.role === 'user');
  const capturedAudio = useRef<ReturnType<typeof createSessionAudio> | null>(null);
  const captureError = useRef('');
  const [audioBusy, setAudioBusy] = useState(false);
  const [localAudio, setLocalAudio] = useState<{ sessionId: string; recordings: AudioRecording[] } | null>(null);

  function collectAudio(samples: Float32Array, rate: number) {
    if (captureError.current) return;
    capturedAudio.current ??= createSessionAudio();
    try { capturedAudio.current.push(samples, rate); }
    catch (cause) {
      captureError.current = cause instanceof Error ? cause.message : 'Recording could not continue.';
      setError(captureError.current);
    }
  }

  function stopAudio(preserveContext = live.current) {
    player.current?.stop(preserveContext);
  }

  function getPlayer() {
    player.current ??= createStreamingPlayer();
    return player.current;
  }

  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/status', { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error();
      setSetup(await response.json());
    }).catch(() => { if (!abort.signal.aborted) setSetupFailed(true); });
    const sessionEpoch = sessionGeneration;
    const responseEpoch = generation;
    const liveState = live;
    const duplexSession = duplex;
    const activeController = controller;
    return () => {
      sessionEpoch.current++;
      responseEpoch.current++;
      duplexSession.current?.stop();
      liveState.current = false;
      stopAudio(false);
      abort.abort();
      activeController.current?.abort();
    };
  }, []);

  useEffect(() => { transcriptEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }, [messages, busy, partial]);

  useEffect(() => {
    if (!recorder.isRecording) return;
    const timer = setInterval(() => setRecordingSeconds(seconds => Math.min(60, seconds + 1)), 1000);
    return () => clearInterval(timer);
  }, [recorder.isRecording]);

  function reset() {
    stopLive();
    recorder.cancelRecording();
    capturedAudio.current?.reset(); captureError.current = ''; setLocalAudio(null); setAudioBusy(false);
    lock.current = false;
    setTones({}); setRecordingSeconds(0);
    setStarted(false); updateMessages([]); setDraft(''); setReport(null);
    setError(''); setState('idle'); setBusy(false); setMicStarting(false); setPreparingVoice(false);
    setPracticeQuestion(''); setCurrentSession(null); setSaveError(''); setReportSaved(false); setProfileOpen(false); sessionMeta.current = null;
  }

  async function speak(text: string, token: number, signal: AbortSignal, tonality?: Tonality) {
    if (!setup?.gradium) return;
    setPreparingVoice(true);
    try {
      const response = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voiceId: voiceId === 'auto' ? undefined : voiceId, tonality, format: 'pcm' }), signal });
      if (!response.ok) throw new Error(await responseError(response));
      if (token !== generation.current) return;
      await getPlayer().play(response, signal, () => {
        if (token === generation.current) { setPreparingVoice(false); setState('speaking'); }
      });
    } catch (cause) {
      if (token === generation.current && !signal.aborted) setError(cause instanceof Error ? `${cause.message} You can continue by typing.` : 'Speech unavailable. You can continue by typing.');
    } finally {
      if (token === generation.current) { setPreparingVoice(false); stopAudio(); }
    }
  }

  async function begin() {
    if (lock.current || !setup?.gemini || (scenarioId === 'custom' && !customScenario.trim())) return;
    const opening = practiceQuestion || scenario.openingLine;
    updateMessages([{ role: 'assistant', content: opening }]);
    sessionMeta.current = { id: crypto.randomUUID(), startedAt: new Date().getTime() };
    setStarted(true); setError('');
    if (!setup.gradium) return;
    const token = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    lock.current = true; setBusy(true); setPreparingVoice(true);
    try {
      await getPlayer().prepare();
      if (token === generation.current && !abort.signal.aborted) await speak(opening, token, abort.signal);
    } catch {
      if (token === generation.current && !abort.signal.aborted) setError('Audio could not start. You can continue by typing.');
    } finally {
      if (token === generation.current) { lock.current = false; setBusy(false); setPreparingVoice(false); setState('idle'); }
    }
  }

  async function sendTurn(text: string, token: number, signal: AbortSignal, speechReady: boolean, speech?: SpeechMetadata) {
    const next: ConversationMessage[] = [...messagesRef.current, { role: 'user', content: text, ...(speech ? {speech} : {}) }];
    setPartial(''); updateMessages(next); setDraft(''); setState('thinking');
    const response = await fetch('/api/converse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId, difficulty, customScenario, tonality: 'auto', messages: textMessages(next) }), signal });
    if (!response.ok) throw new Error(await responseError(response));
    const { reply, userTone, tonality }: Partial<ConverseReply> & { reply: string } = await response.json();
    if (token !== generation.current) return;
    updateMessages([...next, { role: 'assistant', content: reply }]);
    setTones({ userTone, tonality });
    if (speechReady) await speak(reply, token, signal, tonality);
  }

  async function runTurn(source: 'text' | 'voice', liveText?: string, liveSpeech?: SpeechMetadata) {
    if (lock.current || !setup?.gemini || (source === 'text' && !(liveText ?? draft).trim())) return;
    lock.current = true; setBusy(true); setError(''); stopAudio();
    const token = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    try {
      let speechReady = setup.gradium;
      if (speechReady) {
        try { await getPlayer().prepare(); }
        catch {
          speechReady = false;
          if (token === generation.current) {
            stopAudio();
            setError('Audio could not start. Your reply will appear in the transcript.');
          }
        }
      }
      if (token !== generation.current || abort.signal.aborted) return;
      let speech = liveSpeech;
      let text = liveText !== undefined ? liveText : draft.trim();
      if (source === 'voice') {
        setState('thinking');
        const blob = await recorder.stopRecording();
        const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav', 'X-Scenario': scenarioId }, body: blob, signal: abort.signal });
        if (!response.ok) throw new Error(await responseError(response));
        const transcription = await response.json();
        text = transcription.text; speech = transcription.speech;
      }
      if (token === generation.current && text.trim()) await sendTurn(text, token, abort.signal, speechReady, speech);
    } catch (cause) {
      if (token === generation.current && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not send your answer. Please try again.');
    } finally {
      if (token === generation.current) { lock.current = false; setBusy(false); setState('idle'); setPreparingVoice(false); }
    }
  }

  async function toggleRecording() {
    if (recorder.isRecording) { await runTurn('voice'); return; }
    if (lock.current || busy) return;
    const token = ++generation.current;
    lock.current = true; setBusy(true); setMicStarting(true);
    setError(''); setPartial(''); stopAudio();
    setRecordingSeconds(0);
    try { await recorder.startRecording(text => { if (token === generation.current) setPartial(text); }, collectAudio); } catch { /* Recorder displays its actionable error. */ }
    finally {
      if (token === generation.current) {
        lock.current = false; setBusy(false); setMicStarting(false); setPreparingVoice(false);
      }
    }
  }

  async function finish() {
    if (lock.current || !hasUserTurn || recorder.isRecording) return;
    const finishingSession = sessionMeta.current?.id;
    lock.current = true; setBusy(true);
    try { await duplex.current?.finishCapture(); }
    catch (cause) { captureError.current = cause instanceof Error ? cause.message : 'The recording may end slightly early.'; }
    if (!finishingSession || sessionMeta.current?.id !== finishingSession) return;
    stopLive();
    lock.current = true; setBusy(true); setState('thinking'); setError(''); stopAudio(false);
    const token = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    try {
      const snapshot: SavedSession = { id: sessionMeta.current!.id, completedAt: new Date().toISOString(), scenarioId: scenarioId as ScenarioId, difficulty, customScenario, ...(scenarioId === 'interview' && targetRole.trim() ? {targetRole:targetRole.trim()} : {}), durationSeconds:0, messages:[...messagesRef.current], report:{summary:'Pending',strengths:['Pending','Pending'],improvements:['Pending','Pending'],suggestedResponse:'Pending'} };
      let previous: SavedSession | undefined;
      try { previous = getComparableSessions(snapshot, readProfile().sessions).at(-1); }
      catch { setProfileError('Previous sessions could not be loaded. This report will assess the current conversation.'); }
      const previousSession = previous ? {id:previous.id,scenarioId:previous.scenarioId,difficulty:previous.difficulty,customScenario:previous.customScenario,targetRole:previous.targetRole,messages:textMessages(previous.messages),report:{summary:previous.report.summary,assessment:previous.report.assessment,nextGoal:previous.report.coaching?.nextGoal}} : undefined;
      const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId, difficulty, customScenario, ...(snapshot.targetRole ? {targetRole:snapshot.targetRole} : {}), messages: textMessages(messagesRef.current), ...(previousSession ? {previousSession} : {}) }), signal: abort.signal });
      if (!response.ok) throw new Error(await responseError(response));
      const feedback = await response.json();
      if (token === generation.current && sessionMeta.current) {
        const recordings = capturedAudio.current?.finish() ?? [];
        const session: SavedSession = { id: sessionMeta.current.id, completedAt: new Date().toISOString(), scenarioId: scenarioId as ScenarioId, difficulty, ...(snapshot.targetRole ? {targetRole:snapshot.targetRole} : {}), ...(scenarioId === 'custom' ? { customScenario } : {}), durationSeconds: Math.min(86400, Math.max(0, Math.round((new Date().getTime() - sessionMeta.current.startedAt) / 1000))), messages: [...messagesRef.current], report: feedback,
          ...(recordings.length ? { audio: { recordings: recordings.map(({ id, durationSeconds }) => ({ id, durationSeconds })), analyses: [], ...(captureError.current ? {captureWarning:captureError.current} : {}) } } : {}) };
        setLocalAudio({ sessionId: session.id, recordings });
        setReport(feedback); setCurrentSession(session);
        await persistSession(session, recordings);
        if (recordings.length && token === generation.current) {
          setAudioBusy(true);
          const audio = await analyseSessionAudio(recordings, [], abort.signal);
          if (token !== generation.current) return;
          const analysed = { ...session, audio: { ...audio, ...(session.audio?.captureWarning ? {captureWarning:session.audio.captureWarning} : {}) } };
          setCurrentSession(current => current?.id === session.id ? analysed : current);
          await persistSession(analysed, recordings);
        }
      }
    } catch (cause) { if (token === generation.current && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not create feedback. Try again.'); }
    finally { if (token === generation.current) { lock.current = false; setBusy(false); setAudioBusy(false); setState('idle'); setPreparingVoice(false); } }
  }

  function updateMessages(next: ConversationMessage[]) {
    messagesRef.current = next;
    setMessages(next);
  }

  function interruptResponse() {
    generation.current++;
    stopAudio(true);
    controller.current?.abort();
    controller.current = null;
    lock.current = false;
    setBusy(false); setState('idle'); setPreparingVoice(false);
  }

  function stopLive() {
    sessionGeneration.current++;
    duplex.current?.stop(); duplex.current = null;
    live.current = false;
    interruptResponse();
    stopAudio(false);
    setLiveActive(false); setLiveStarting(false); setPartial('');
  }

  async function finishLive() {
    const capture = duplex.current;
    try { await capture?.finishCapture(); }
    catch (cause) {
      captureError.current = cause instanceof Error ? cause.message : 'The recording may end slightly early.';
      setError(captureError.current);
    } finally { if (duplex.current === capture) stopLive(); }
  }

  useEffect(() => { liveTurn.current = (text, speech) => runTurn('text', text, speech); });

  async function startLive() {
    if (live.current || liveStarting || busy || recorder.isRecording) return;
    const session = ++sessionGeneration.current;
    setError(''); setLiveStarting(true);
    lock.current = true; setBusy(true);
    try {
      await getPlayer().prepare();
      if (session !== sessionGeneration.current) return;
      const capture = createDuplexSession({
        onAudio: collectAudio,
        onSpeechStart: () => { if (session === sessionGeneration.current) interruptResponse(); },
        onTranscript: text => { if (session === sessionGeneration.current) setPartial(text); },
        onTurn: (text, speech) => {
          if (session !== sessionGeneration.current || !live.current) return;
          if (lock.current) interruptResponse();
          void liveTurn.current(text, speech);
        },
        onError: message => {
          if (session !== sessionGeneration.current) return;
          stopLive(); setError(`${message} You can continue by typing or recording an answer.`);
        }
      });
      duplex.current = capture;
      await capture.start();
      if (session !== sessionGeneration.current) return;
      live.current = true; setLiveActive(true); setLiveStarting(false);
      lock.current = false; setBusy(false);
    } catch (cause) {
      if (session !== sessionGeneration.current) return;
      stopLive();
      setError(cause instanceof Error ? cause.message : 'Live voice could not start. You can continue by typing.');
    }
  }


  async function persistSession(session: SavedSession, recordings = localAudio?.sessionId === session.id ? localAudio.recordings : []) {
    const epoch = generation.current;
    try {
      const result = await saveRecordedSession(session, recordings, () => epoch === generation.current);
      if (!result || epoch !== generation.current) return;
      setSavedSessions([...result.profile.sessions].reverse()); setSaveError(result.warning ?? ''); setProfileError(''); setReportSaved(!result.warning);
      setCurrentSession(current => current?.id === session.id ? result.session : current);
    } catch (cause) {
      setReportSaved(false); setSaveError(cause instanceof Error ? cause.message : 'This report could not be saved locally.');
      try { setSavedSessions([...readProfile().sessions].reverse()); } catch { /* Keep the report available if existing storage cannot be read. */ }
    }
  }

  function openProfile() {
    try { setSavedSessions([...readProfile().sessions].reverse()); setProfileError(''); }
    catch (cause) { setSavedSessions([]); setProfileError(cause instanceof Error ? cause.message : 'Your profile could not be loaded.'); }
    setProfileOpen(true);
  }

  async function changeHistory(id?: string) {
    try {
      if (audioBusy) { interruptResponse(); setAudioBusy(false); }
      if (id) await deleteSessionAudio(id); else await clearSessionAudio();
      const profile = id ? deleteSession(id) : clearProfile();
      setSavedSessions([...profile.sessions].reverse()); setProfileError('');
      if (!id || id === currentSession?.id) setReportSaved(false);
      if (!id || id === localAudio?.sessionId) setLocalAudio(null);
    } catch (cause) { setProfileError(cause instanceof Error ? cause.message : 'Your profile could not be updated.'); }
  }

  async function retryAudioAnalysis() {
    if (!currentSession?.audio || audioBusy) return;
    const session = currentSession;
    const token = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    setAudioBusy(true);
    try {
      const recordings = await Promise.all(session.audio!.recordings.map(async recording => {
        const blob = localAudio?.sessionId === session.id ? localAudio.recordings.find(item => item.id === recording.id)?.blob : await loadAudioRecording(session.id, recording.id);
        if (!blob) throw new Error('This recording is no longer available in this browser.');
        return { ...recording, blob };
      }));
      const audio = await analyseSessionAudio(recordings, session.audio!.analyses, abort.signal);
      if (token !== generation.current) return;
      const updated = { ...session, audio: { ...audio, ...(session.audio?.captureWarning ? {captureWarning:session.audio.captureWarning} : {}) } };
      setCurrentSession(current => current?.id === session.id ? updated : current);
      await persistSession(updated, recordings);
    } catch (cause) {
      if (token === generation.current) setSaveError(cause instanceof Error ? cause.message : 'Audio analysis could not complete.');
    } finally { if (token === generation.current) setAudioBusy(false); }
  }

  function openSavedSession(session: SavedSession) {
    setCurrentSession(session); setReport(session.report); setReportSaved(true); setSaveError(''); setProfileOpen(false);
  }

  function completePractice(completed: boolean) {
    if (!currentSession) return;
    try {
      const profile = setPracticeCompleted(currentSession.id, completed);
      const updated = profile.sessions.find(item => item.id === currentSession.id);
      if (updated) setCurrentSession(updated);
      setSavedSessions([...profile.sessions].reverse()); setSaveError('');
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Your practice progress could not be saved.');
    }
  }

  function practiseAnswer(messageIndex: number) {
    const answer = currentSession?.messages[messageIndex];
    if (!currentSession || answer?.role !== 'user') return;
    const review = currentSession.report.coaching?.answerReviews.find(item => item.messageIndex === messageIndex);
    const question = review?.question ?? currentSession.messages.slice(0, messageIndex).filter(item => item.role === 'assistant').at(-1)?.content ?? 'Explain your experience.';
    const role = currentSession.targetRole;
    const practiceDifficulty = currentSession.difficulty;
    const goal = currentSession.report.coaching?.nextGoal;
    reset(); setScenarioId('custom'); setDifficulty(practiceDifficulty); setPracticeQuestion(question);
    setCustomScenario(`Interview answer practice${role ? ` for ${role}` : ''}. Ask me this question: ${question}. Probe my answer with one follow-up. Practice goal: ${goal ?? review?.feedback ?? 'Give a clear, specific answer.'}`.slice(0,1500));
    setDraft(answer.content);
  }

  const avatarState = state === 'speaking' || state === 'thinking' ? state : recorder.isRecording || liveActive ? 'listening' : state;
  const statusText = liveStarting || micStarting ? 'Connecting your microphone' : preparingVoice ? 'Preparing voice' : state === 'thinking' ? 'Thinking it through' : state === 'speaking' ? `${counterpart.split(' · ')[0]} is speaking` : recorder.isRecording ? 'Listening to you' : liveActive ? 'Listening · you can interrupt anytime' : started ? 'Your turn. Take your time.' : 'Ready when you are';

  const headline = report ? 'Here’s what you can take with you.'
    : feeling && tone ? `I’m sensing you feel ${feeling}, so I’m adapting ${/^[aeiou]/i.test(tone.label) ? 'an' : 'a'} ${tone.label.toLowerCase()} tone. ${voice?.name ?? tone.voiceName} is here to train you.`
    : started ? 'Talk to me. I’ll sense how you feel and adapt my tone.'
    : 'Hi, I’m your practice sunflower. Dress me for the talk you want to train.';

  const gridClass = [
    'studio-grid',
    stageMaximized && 'stage-maximized'
  ].filter(Boolean).join(' ');

  return (
    <main className="app-shell wardrobe-app">
      <GardenScenery />
      {intro && <Intro onDone={endIntro} />}
      {/* TOPBAR */}
      <header className="topbar">
        <a href="/" className="brand" aria-label="Any resets? home">
          <span className="brand-mark"><MessageCircle size={18} /></span>
          any resets<span className="brand-dot">?</span>
        </a>
        <div className="topbar-actions">
          <button className="profile-button" onClick={openProfile} disabled={started && !report}>My profile</button>
        </div>
      </header>

      {/* SETUP ALERTS */}
      {(setupFailed || (setup && !setup.gemini)) && (
        <div className="setup-notice" role="status">
          <strong>{setupFailed ? 'Could not check service availability.' : 'Connect Gemini to start practising.'}</strong>{' '}
          {setupFailed ? 'Refresh the page to try again.' : 'Add GEMINI_API_KEY to the server environment, then restart the app.'}
        </div>
      )}
      {setup?.gemini && !setup.gradium && (
        <div className="setup-notice" role="status">
          Voice is unavailable until GRADIUM_API_KEY is configured. You can practise by typing.
        </div>
      )}

      {/* REPORT VIEW OR ACTIVE STUDIO */}
      {profileOpen ? <ProfileDashboard sessions={savedSessions} error={profileError} onOpen={openSavedSession} onDelete={id => changeHistory(id)} onClear={() => changeHistory()} onBack={() => setProfileOpen(false)} /> : report && currentSession ? <SessionReport session={currentSession} sessions={savedSessions} saveError={saveError} saved={reportSaved} onRetry={reportSaved ? undefined : () => persistSession(currentSession)} onPractise={reset} onPractiseAnswer={practiseAnswer} onCompletePractice={reportSaved && !audioBusy ? completePractice : undefined} onOpen={openSavedSession} onRetryAudio={() => void retryAudioAnalysis()} audioBusy={audioBusy} localRecordings={localAudio?.sessionId === currentSession.id ? localAudio.recordings : undefined} /> : (
        <div className={`${gridClass} ${started ? 'garden-active' : 'garden-setup'}`}>
          <section className="page-heading">
            <div className="eyebrow">{scenario.title.toUpperCase()}</div>
            <h1 aria-live="polite">{headline}</h1>
          </section>

          <aside className="scenario-panel">
            {!started && outfit && <Wardrobe value={outfit} onChange={id => { setScenarioId(id); setPracticeQuestion(''); }} />}
            {!started && <button
              className="primary start-button"
              disabled={!setup?.gemini || (scenarioId === 'custom' && !customScenario.trim())}
              onClick={begin}
            >Start practising <ArrowRight size={20} /></button>}
            <div className="garden-settings">
              {!started && <label className="custom-label">Conversation
                <select aria-label="Conversation" value={scenarioId} onChange={event => { setScenarioId(event.target.value as ScenarioId); setPracticeQuestion(''); }}>
                  {SCENARIOS.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              </label>}
              {scenarioId === 'interview' && <label className="custom-label" htmlFor="target-role">Target role
                <input id="target-role" maxLength={200} disabled={started} value={targetRole} onChange={event => setTargetRole(event.target.value)} placeholder="e.g. Backend Engineer" />
              </label>}
              <label className="custom-label" htmlFor="difficulty">Their approach
                <select id="difficulty" value={difficulty} disabled={started} onChange={event => setDifficulty(event.target.value as Difficulty)}>
                  <option value="friendly">Friendly</option>
                  <option value="neutral">Neutral</option>
                  <option value="challenging">Challenging</option>
                </select>
              </label>
              <label className="custom-label" htmlFor="voice">Their voice
                <select id="voice" value={voiceId} disabled={started} onChange={event => setVoiceId(event.target.value as VoiceId | 'auto')}>
                  <option value="auto">Automatic tone</option>
                  {VOICES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              {scenarioId === 'custom' && <label className="custom-label garden-custom-scenario">What would you like to practise?
                <textarea maxLength={1500} disabled={started} value={customScenario} onChange={event => { setCustomScenario(event.target.value); setPracticeQuestion(''); }} placeholder="Who are you speaking to, and what do you want to say?" />
              </label>}
            </div>
          </aside>

          {/* PRACTICE SUNFLOWER */}
          <section className="stage-panel">
            <div className="stage-top">
              <span className="difficulty-badge">{difficulty}</span>

              <button
                className="stage-tool-btn stage-tool-icon"
                onClick={() => setStageMaximized(!stageMaximized)}
                aria-label={stageMaximized ? "Restore view" : "Maximize stage"}
                title={stageMaximized ? "Exit full view" : "Full stage"}
              >
                {stageMaximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>

            <div className="avatar-stage">
              <Sunflower state={avatarState} mood={tones.userTone ?? 'happy'} outfit={outfit} />

              <div className="stage-persona">
                <span className="counterpart-name">{counterpart}</span>
                {avatarState === 'speaking' && (
                  <SoundWave active={true} color="blue" />
                )}
              </div>

              {statusText && (
                <div className={`state-indicator state-${avatarState}`}>
                  <span />
                  {statusText}
                </div>
              )}
            </div>

            <div className="stage-bottom">
              {started && (
                <div className="stage-controls-area">
                  {recorder.isRecording && (
                    <div className="recording-status-row" aria-live="polite">
                      <span className="rec-pulse-dot" />
                      <span className="rec-time-text">
                        {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:
                        {String(recordingSeconds % 60).padStart(2, '0')} / 01:00
                      </span>
                      <SoundWave active={true} color="slate" />
                    </div>
                  )}

                  <div className="record-container">
                    <button className={`record-button ${liveActive ? 'recording' : ''}`} aria-describedby="live-voice-help" disabled={!setup?.gradium || recorder.isRecording || (!liveActive && !liveStarting && busy)} onClick={() => liveActive ? void finishLive() : liveStarting ? stopLive() : void startLive()}>
                      {liveActive || liveStarting ? <Square size={18} /> : <Mic size={20} />}
                      <span>{liveStarting ? 'Cancel voice connection' : liveActive ? 'Stop live voice' : 'Start live voice'}</span>
                    </button>
                    <p className="record-help" id="live-voice-help">{liveActive ? 'Speak naturally. Pause to send, or interrupt your counterpart.' : 'Hands-free conversation, with automatic turn taking.'}</p>
                  </div>
                  <div className="record-container">
                    <button
                      className={`record-button record-button-secondary ${recorder.isRecording ? 'recording' : ''}`}
                      disabled={busy || liveActive || liveStarting || !setup?.gradium}
                      onClick={toggleRecording}
                    >
                      {recorder.isRecording ? <Square size={18} fill="currentColor" /> : <Mic size={20} />}
                      <span>{recorder.isRecording ? 'Finish & send' : 'Record your answer'}</span>
                    </button>
                  </div>

                  <div className="session-actions">
                    <button
                      disabled={busy || !hasUserTurn || recorder.isRecording}
                      onClick={finish}
                    >
                      End session & get feedback <ChevronRight size={14} />
                    </button>
                    <button className="reset-button" onClick={reset} aria-label="Reset session">
                      <RotateCcw size={15} />
                    </button>
                  </div>
                  <p className="record-help">Microphone audio is recorded locally and sent to Gemini after the session for your speech report. Up to 10 recorded minutes.</p>
                </div>
              )}
            </div>
          </section>

          {/* CONVERSATION */}
          <section className="transcript-panel">
            <div className="panel-heading">
              <div className="transcript-title">
                <Volume2 size={15} />
                <span>Conversation</span>
              </div>
              <span className="turn-count-badge">
                {messages.length > 0 ? `${messages.filter(m => m.role === 'user').length} turns` : 'Ready'}
              </span>
            </div>

            <div className="transcript" aria-live="polite" aria-relevant="additions">
              {messages.length === 0 ? (
                <div className="empty-transcript">
                  <span><MessageCircle size={24} /></span>
                  <h3>The first words are yours.</h3>
                </div>
              ) : (
                messages.map((message, index) => {
                  const isUser = message.role === 'user';
                  const userTurnNumber = messages.slice(0, index + 1).filter(m => m.role === 'user').length;

                  return (
                    <div key={index} className="message-wrapper">
                      {isUser && (
                        <div className="turn-divider">
                          <span className="turn-divider-label">Round {userTurnNumber}</span>
                        </div>
                      )}
                      <div className={`message message-${message.role}`}>
                        <div className="message-header">
                          <span className="message-author">
                            {isUser ? 'You' : counterpart.split(' · ')[0]}
                          </span>
                        </div>
                        <p>{message.content}</p>
                      </div>
                    </div>
                  );
                })
              )}

              {busy && state !== 'speaking' && (
                <div className="thinking-message">
                  <span /><span /><span />
                  <small>{preparingVoice ? 'Preparing voice' : hasUserTurn ? 'Preparing a response' : 'Working on it'}</small>
                </div>
              )}
              {partial && <div className="message message-user live-transcript" aria-label="Live transcript" aria-live="off"><span className="message-author">You · {recorder.isRecording || liveActive ? 'speaking' : 'transcribing'}</span><p>{partial}<span className="transcript-caret" aria-hidden="true" /></p></div>}
              <div ref={transcriptEnd} />
            </div>

            {recorder.liveTranscriptError && recorder.isRecording && <p className="record-help" role="status">{recorder.liveTranscriptError}</p>}
            {(error || recorder.error) && (
              <p className="error-message" role="alert">{error || recorder.error}</p>
            )}

            <form className="composer" onSubmit={event => { event.preventDefault(); void runTurn('text'); }}>
              <label className="sr-only" htmlFor="answer">Your answer</label>
              <textarea
                id="answer"
                placeholder={started ? 'Or type your answer…' : 'Start a session to join'}
                value={draft}
                onChange={event => setDraft(event.target.value)}
                disabled={!started || busy || recorder.isRecording}
                maxLength={4000}
                rows={2}
              />
              <button aria-label="Send answer" disabled={!started || busy || recorder.isRecording || !draft.trim()}>
                <Send size={16} />
              </button>
            </form>
          </section>
        </div>
      )}

      {/* FOOTER */}
      <footer className="footer">
        <span>Conversation Coach</span>
        <span>Voice by Gradium <span className="footer-divider">/</span> Gemini</span>
      </footer>
    </main>
  );
}
