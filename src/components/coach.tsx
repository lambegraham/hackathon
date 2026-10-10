'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Mic, RotateCcw, Send, Square, Video, Volume2 } from 'lucide-react';
import { createDuplexSession } from '@/lib/duplex-session';
import { createStreamingPlayer } from '@/lib/streaming-audio';
import { VOICES, type VoiceId } from '@/lib/voices';
import { SCENARIOS } from '@/lib/scenarios';
import type { ConversationMessage, ConverseReply, FeedbackReport, ScenarioId, SpeechMetadata, Tonality, UserTone } from '@/lib/contracts';
import { useFlowerCamera } from '@/hooks/use-flower-camera';
import { useVoiceSession } from '@/hooks/use-voice-session';
import type { AvatarState } from './avatar';
import { COACHING_METRICS, readProfile, saveSession, deleteSession, clearProfile, getComparableSessions, type SavedSession } from '@/lib/profile';
import { skillLevelLabel } from '@/lib/practice-level';
import { SessionReport } from './session-report';
import { ProfileDashboard } from './profile-dashboard';
import { Sunflower } from './sunflower';
import { OUTFITS } from './outfits';
import { tonalityById } from '@/lib/tonality';
import './profile.css';

type Difficulty = 'friendly' | 'neutral' | 'challenging';
type Setup = { gemini: boolean; gradium: boolean };
const textMessages = (messages: ConversationMessage[]) => messages.map(({role,content}) => ({role,content}));

async function responseError(response: Response) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : 'Something went wrong. Please try again.';
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
  const [reportOpen, setReportOpen] = useState(false);
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
  const camera = useFlowerCamera();
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
  const outfit = OUTFITS.find(item => item.id === scenarioId)?.id;
  const counterpart = `${voice?.name ?? tone?.voiceName ?? 'Sunflower'} · ${({ interview: 'Interviewer', raise: 'Your manager', relationship: 'Your partner', feedback: 'Your colleague', custom: 'Your counterpart', flatmate: 'Your flatmate', coldcall: 'Your customer', bazaar: 'Your buyer' } as Record<string, string>)[scenarioId]}`;
  const hasUserTurn = messages.some(message => message.role === 'user');

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
    if (profileOpen || reportOpen) camera.stop();
  }, [profileOpen, reportOpen, camera.stop]);

  useEffect(() => {
    try { setSavedSessions([...readProfile().sessions].reverse()); }
    catch { /* The call still starts. Profile reports its own error when opened. */ }
  }, []);

  useEffect(() => {
    if (!recorder.isRecording) return;
    const timer = setInterval(() => setRecordingSeconds(seconds => Math.min(60, seconds + 1)), 1000);
    return () => clearInterval(timer);
  }, [recorder.isRecording]);

  function reset() {
    camera.stop();
    stopLive();
    recorder.cancelRecording();
    lock.current = false;
    setTones({}); setRecordingSeconds(0);
    setStarted(false); updateMessages([]); setDraft(''); setReport(null); setReportOpen(false);
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

  function begin() {
    if (!setup?.gemini || (scenarioId === 'custom' && !customScenario.trim())) return;
    updateMessages([{ role: 'assistant', content: practiceQuestion || scenario.openingLine }]);
    sessionMeta.current = { id: crypto.randomUUID(), startedAt: new Date().getTime() };
    setStarted(true); setError('');
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
    try { await recorder.startRecording(text => { if (token === generation.current) setPartial(text); }); } catch { /* Recorder displays its actionable error. */ }
    finally {
      if (token === generation.current) {
        lock.current = false; setBusy(false); setMicStarting(false); setPreparingVoice(false);
      }
    }
  }

  async function finish() {
    if (lock.current || !hasUserTurn || recorder.isRecording) return;
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
        const session: SavedSession = { id: sessionMeta.current.id, completedAt: new Date().toISOString(), scenarioId: scenarioId as ScenarioId, difficulty, ...(snapshot.targetRole ? {targetRole:snapshot.targetRole} : {}), ...(scenarioId === 'custom' ? { customScenario } : {}), durationSeconds: Math.min(86400, Math.max(0, Math.round((new Date().getTime() - sessionMeta.current.startedAt) / 1000))), messages: [...messagesRef.current], report: feedback };
        setReport(feedback); setCurrentSession(session); persistSession(session);
      }
    } catch (cause) { if (token === generation.current && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not create feedback. Try again.'); }
    finally { if (token === generation.current) { lock.current = false; setBusy(false); setState('idle'); setPreparingVoice(false); } }
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


  function persistSession(session: SavedSession) {
    try {
      const profile = saveSession(session);
      setSavedSessions([...profile.sessions].reverse()); setSaveError(''); setProfileError(''); setReportSaved(true);
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

  function changeHistory(id?: string) {
    try {
      const profile = id ? deleteSession(id) : clearProfile();
      setSavedSessions([...profile.sessions].reverse()); setProfileError('');
      if (!id || id === currentSession?.id) setReportSaved(false);
    } catch (cause) { setProfileError(cause instanceof Error ? cause.message : 'Your profile could not be updated.'); }
  }

  function openSavedSession(session: SavedSession) {
    setCurrentSession(session); setReport(session.report); setReportSaved(true); setSaveError(''); setProfileOpen(false); setReportOpen(true);
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
  const statusText = liveStarting || micStarting ? 'Connecting your microphone' : preparingVoice ? 'Preparing voice' : state === 'thinking' ? 'Thinking it through' : state === 'speaking' ? `${counterpart.split(' · ')[0]} is speaking` : recorder.isRecording ? 'Listening to you' : liveActive ? 'Listening. You can interrupt anytime.' : started ? 'Your turn. Take your time.' : 'Ready when you are';
  const assistantLine = [...messages].reverse().find(message => message.role === 'assistant')?.content;
  const yourLine = [...messages].reverse().find(message => message.role === 'user')?.content;
  const advice = report ?? savedSessions[0]?.report;
  const shortName: Record<string, string> = { interview: 'Job interview', raise: 'Ask for a raise', relationship: 'Relationship', feedback: 'Feedback', flatmate: 'Flatmate', coldcall: 'Cold call', bazaar: 'Bazaar', custom: 'Your own' };
  const clock = `${String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:${String(recordingSeconds % 60).padStart(2, '0')}`;
  const showLive = recorder.isRecording || liveActive;
  const alternate = profileOpen || (reportOpen && currentSession);

  return (
    <main className={alternate ? 'app-shell' : 'call-shell'}>
      {intro && <Intro onDone={endIntro} />}
      {profileOpen ? <ProfileDashboard sessions={savedSessions} error={profileError} onOpen={openSavedSession} onDelete={id => changeHistory(id)} onClear={() => changeHistory()} onBack={() => setProfileOpen(false)} /> : reportOpen && currentSession ? (
        <div className="call-report">
          <button className="secondary-button" onClick={() => setReportOpen(false)}>Back to the call</button>
          <SessionReport session={currentSession} sessions={savedSessions} saveError={saveError} saved={reportSaved} onRetry={() => persistSession(currentSession)} onPractise={reset} onPractiseAnswer={practiseAnswer} />
        </div>
      ) : (
        <>
          <aside className="call-rail">
            <a href="/" className="call-brand">AnyResets</a>
            <div className="call-rail-scroll">
              <p className="call-rail-label" id="conversation-label">Conversation</p>
              <div className="call-scenarios" role="radiogroup" aria-labelledby="conversation-label">
                {SCENARIOS.map(item => (
                  <button
                    key={item.id}
                    role="radio"
                    aria-checked={item.id === scenarioId}
                    className="call-scenario"
                    disabled={started}
                    onClick={() => { setScenarioId(item.id); setPracticeQuestion(''); }}
                  >
                    {shortName[item.id] ?? item.title}
                  </button>
                ))}
              </div>
              {scenarioId === 'custom' && (
                <label className="call-field">What would you like to practise?
                  <textarea maxLength={1500} disabled={started} value={customScenario} onChange={event => { setCustomScenario(event.target.value); setPracticeQuestion(''); }} placeholder="Who are you speaking to, and what do you want to say?" />
                </label>
              )}
              {scenarioId === 'interview' && (
                <label className="call-field" htmlFor="target-role">Target role
                  <input id="target-role" maxLength={200} disabled={started} value={targetRole} onChange={event => setTargetRole(event.target.value)} placeholder="e.g. Backend Engineer" />
                </label>
              )}
              <label className="call-field" htmlFor="difficulty">Their approach
                <select id="difficulty" value={difficulty} disabled={started} onChange={event => setDifficulty(event.target.value as Difficulty)}>
                  <option value="friendly">Friendly</option>
                  <option value="neutral">Neutral</option>
                  <option value="challenging">Challenging</option>
                </select>
              </label>
              <label className="call-field" htmlFor="voice">Their voice
                <select id="voice" value={voiceId} disabled={started} onChange={event => setVoiceId(event.target.value as VoiceId | 'auto')}>
                  <option value="auto">Automatic tone</option>
                  {VOICES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
            </div>
            <button className="call-profile" onClick={openProfile} disabled={started && !report}>My profile</button>
            {(setupFailed || (setup && !setup.gemini)) && (
              <p className="call-notice" role="status">{setupFailed ? 'Could not check service availability. Refresh to try again.' : 'Add GEMINI_API_KEY, then restart.'}</p>
            )}
          </aside>

          <section className="call-center">
            <header className="call-top">
              <div>
                <h1>{scenario.title}</h1>
                <p className="call-status" aria-live="polite">{statusText}</p>
              </div>
              <div className="call-top-actions">
                {showLive && (
                  <span className="call-rec" role="status">
                    <span />
                    {recorder.isRecording ? `Recording ${clock}` : 'Live'}
                  </span>
                )}
                {started && !report && (
                  <button className="call-end" disabled={busy || !hasUserTurn || recorder.isRecording} onClick={finish}>End session</button>
                )}
                {started && (
                  <button className="call-over" onClick={reset} aria-label="Start over"><RotateCcw size={15} /></button>
                )}
              </div>
            </header>

            <div className="call-frame">
              <div className="call-room" aria-hidden="true">
                <div className="call-window" />
                <div className="call-lamp" />
                <div className="call-desk" />
              </div>
              <Sunflower state={avatarState} mood={tones.userTone ?? 'happy'} outfit={outfit} lookAt={camera.lookAt} />
              <video ref={camera.videoRef} className={`flower-self-view${camera.on ? ' on' : ''}`} playsInline muted aria-hidden={!camera.on} aria-label={camera.on ? 'Your camera. Stop camera.' : undefined} onClick={() => { if (camera.on) camera.stop(); }} />
              {assistantLine && (
                <div className="call-bubble">
                  <Volume2 size={15} aria-hidden="true" />
                  <p>{assistantLine}</p>
                </div>
              )}
              {busy && state !== 'speaking' && !assistantLine && (
                <p className="call-wait">{preparingVoice ? 'Preparing voice' : hasUserTurn ? 'Preparing a response' : 'Working on it'}</p>
              )}
              {partial && <p className="call-partial" aria-label="Live transcript">{partial}</p>}
              {camera.note ? <p className="call-note" role="status">{camera.note}</p> : null}
              <div className="call-dock">
                <div className="call-orb-wrap">
                  <button className={`call-orb${recorder.isRecording ? ' call-orb-hot' : ''}`} aria-label={recorder.isRecording ? 'Finish and send' : 'Record your answer'} disabled={!started || busy || liveActive || liveStarting || !setup?.gradium} onClick={toggleRecording}>
                    {recorder.isRecording ? <Square size={18} fill="currentColor" /> : <Mic size={20} />}
                  </button>
                  <span>{recorder.isRecording ? 'Send' : 'Record'}</span>
                </div>
                <div className="call-orb-wrap">
                  {!started ? (
                    <button className="call-orb call-orb-start" aria-label="Start practising" disabled={!setup?.gemini || (scenarioId === 'custom' && !customScenario.trim())} onClick={begin}>Start</button>
                  ) : (
                    <button className={`call-orb${liveActive || liveStarting ? ' call-orb-hot' : ''}`} aria-label={liveStarting ? 'Cancel voice connection' : liveActive ? 'Stop live voice' : 'Start live voice'} disabled={!setup?.gradium || recorder.isRecording || (!liveActive && !liveStarting && busy)} onClick={() => liveActive || liveStarting ? stopLive() : void startLive()}>
                      {liveActive || liveStarting ? <Square size={18} /> : <AudioLines size={20} />}
                    </button>
                  )}
                  <span>{!started ? 'Start' : liveActive || liveStarting ? 'Stop' : 'Live'}</span>
                </div>
                <div className="call-orb-wrap">
                  <button className={`call-orb${camera.on ? ' call-orb-on' : ''}`} aria-pressed={camera.on} aria-label={camera.on ? 'Stop camera' : 'Use camera'} onClick={() => camera.on ? camera.stop() : void camera.start()}>
                    <Video size={20} />
                  </button>
                  <span>Camera</span>
                </div>
              </div>
            </div>

            {yourLine && <p className="call-said">{yourLine}</p>}
            {recorder.liveTranscriptError && recorder.isRecording && <p className="call-notice" role="status">{recorder.liveTranscriptError}</p>}
            {(error || recorder.error) && <p className="call-alert" role="alert">{error || recorder.error}</p>}
            <form className="call-composer" onSubmit={event => { event.preventDefault(); void runTurn('text'); }}>
              <label className="sr-only" htmlFor="answer">Your answer</label>
              <textarea id="answer" placeholder={started ? 'Or type your answer…' : 'Start a session to join'} value={draft} onChange={event => setDraft(event.target.value)} disabled={!started || busy || recorder.isRecording} maxLength={4000} rows={1} />
              <button aria-label="Send answer" disabled={!started || busy || recorder.isRecording || !draft.trim()}><Send size={16} /></button>
            </form>
            <div className="sr-only" aria-live="polite">
              {messages.map((message, index) => <p key={index}>{message.role === 'user' ? 'You' : counterpart.split(' · ')[0]}: {message.content}</p>)}
              <div ref={transcriptEnd} />
            </div>
          </section>

          <aside className="call-advice">
            <h2>Advice</h2>
            {advice?.assessment ? (
              <ul className="call-levels">
                {COACHING_METRICS.map(({ key, label }) => (
                  <li key={key}><span>{label}</span><span>{skillLevelLabel(advice.assessment![key].score)}</span></li>
                ))}
              </ul>
            ) : null}
            {advice ? (
              <ul>{advice.improvements.map((item, index) => <li key={index}>{item}</li>)}</ul>
            ) : (
              <p>Advice shows after this practice.</p>
            )}
          </aside>
        </>
      )}
    </main>
  );
}
