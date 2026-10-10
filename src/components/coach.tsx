'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronRight, MessageCircle, Mic, RotateCcw, Send, Sparkles, Square, Volume2 } from 'lucide-react';
import { createDuplexSession } from '@/lib/duplex-session';
import { createStreamingPlayer } from '@/lib/streaming-audio';
import { VOICES, type VoiceId } from '@/lib/voices';
import { SCENARIOS } from '@/lib/scenarios';
import type { ConversationMessage, FeedbackReport, ScenarioId, SpeechMetadata } from '@/lib/contracts';
import { useVoiceSession } from '@/hooks/use-voice-session';
import { Avatar, type AvatarState } from './avatar';
import { readProfile, saveSession, deleteSession, clearProfile, getComparableSessions, type SavedSession } from '@/lib/profile';
import { SessionReport } from './session-report';
import { ProfileDashboard } from './profile-dashboard';
import './profile.css';

type Difficulty = 'friendly' | 'neutral' | 'challenging';
type Setup = { gemini: boolean; gradium: boolean };
const textMessages = (messages: ConversationMessage[]) => messages.map(({role,content}) => ({role,content}));

async function responseError(response: Response) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : 'Something went wrong. Please try again.';
}

export function Coach() {
  const [scenarioId, setScenarioId] = useState('interview');
  const [voiceId, setVoiceId] = useState<VoiceId>('marshall');
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
  const voice = VOICES.find(item => item.id === voiceId) ?? VOICES[0];
  const counterpart = `${voice.name} · ${({ interview: 'Interviewer', raise: 'Your manager', relationship: 'Your partner', feedback: 'Your colleague', custom: 'Your counterpart' } as Record<string, string>)[scenarioId]}`;
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

  function reset() {
    stopLive();
    recorder.cancelRecording();
    lock.current = false;
    setStarted(false); updateMessages([]); setDraft(''); setReport(null);
    setError(''); setState('idle'); setBusy(false); setMicStarting(false); setPreparingVoice(false);
    setPracticeQuestion(''); setCurrentSession(null); setSaveError(''); setReportSaved(false); setProfileOpen(false); sessionMeta.current = null;
  }

  async function speak(text: string, token: number, signal: AbortSignal) {
    if (!setup?.gradium) return;
    setPreparingVoice(true);
    try {
      const response = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voiceId, format: 'pcm' }), signal });
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
    const response = await fetch('/api/converse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId, difficulty, customScenario, messages: textMessages(next) }), signal });
    if (!response.ok) throw new Error(await responseError(response));
    const { reply } = await response.json();
    if (token !== generation.current) return;
    updateMessages([...next, { role: 'assistant', content: reply }]);
    if (speechReady) await speak(reply, token, signal);
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
    setCurrentSession(session); setReport(session.report); setReportSaved(true); setSaveError(''); setProfileOpen(false);
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

  return <main className="app-shell">
    <header className="topbar"><a href="/" className="brand" aria-label="Rehearsal home"><span className="brand-mark"><MessageCircle size={20} /></span>rehearsal<span className="brand-dot">.</span></a><span className="topbar-note">A little practice. A little more confidence.</span><button className="profile-button" onClick={openProfile} disabled={started && !report}>My profile</button></header>
    {!profileOpen && <section className="page-heading"><div><div className="eyebrow">SPACE TO TRY, ROOM TO GROW</div><h1>{report ? 'Take the practice with you.' : started ? 'You’ve got the floor.' : 'Big conversation? Start here.'}</h1><p>{report ? 'A few useful things to bring into your real conversation.' : 'Rehearse the words before the moment. No pressure to get it perfect.'}</p></div><div className="session-chip"><span />{report ? 'Session complete' : started ? 'Practice in progress' : 'Your private practice space'}</div></section>}
    {(setupFailed || (setup && !setup.gemini)) && <div className="setup-notice" role="status"><strong>{setupFailed ? 'Could not check service availability.' : 'Connect Gemini to start practising.'}</strong> {setupFailed ? 'Refresh the page to try again.' : 'Add GEMINI_API_KEY to the server environment, then restart the app.'}</div>}
    {setup?.gemini && !setup.gradium && <div className="setup-notice" role="status">Voice is unavailable until GRADIUM_API_KEY is configured. You can practise by typing.</div>}
    {profileOpen ? <ProfileDashboard sessions={savedSessions} error={profileError} onOpen={openSavedSession} onDelete={id => changeHistory(id)} onClear={() => changeHistory()} onBack={() => setProfileOpen(false)} /> : report && currentSession ? <SessionReport session={currentSession} sessions={savedSessions} saveError={saveError} saved={reportSaved} onRetry={() => persistSession(currentSession)} onPractise={reset} onPractiseAnswer={practiseAnswer} /> : <div className="studio-grid">
      <aside className="scenario-panel"><div className="panel-heading"><span>Choose your conversation</span><span className="small-label">{SCENARIOS.length} scenarios</span></div><div className="scenario-list">{SCENARIOS.map((item, index) => <button key={item.id} className={`scenario-card ${scenarioId === item.id ? 'selected' : ''}`} disabled={started} onClick={() => {setScenarioId(item.id); setPracticeQuestion('');}}><span className="scenario-symbol">{['↗', '€', '♡', '↔', '+'][index]}</span><span><strong>{item.title}</strong><small>{item.description}</small></span>{scenarioId === item.id && <Check size={16} className="scenario-check" />}</button>)}</div>{scenarioId === 'custom' && <label className="custom-label">What would you like to practise?<textarea maxLength={1500} disabled={started} value={customScenario} onChange={event => {setCustomScenario(event.target.value); setPracticeQuestion('');}} placeholder="Who are you speaking to, and what do you want to say?" /></label>}<div className="difficulty">{scenarioId === 'interview' && <><label htmlFor="target-role">Target role</label><input id="target-role" maxLength={200} disabled={started} value={targetRole} onChange={event => setTargetRole(event.target.value)} placeholder="e.g. Backend Engineer" /></>}<label htmlFor="difficulty">Their approach</label><select id="difficulty" value={difficulty} disabled={started} onChange={event => setDifficulty(event.target.value as Difficulty)}><option value="friendly">Friendly · a gentle start</option><option value="neutral">Neutral · keep it realistic</option><option value="challenging">Challenging · push yourself</option></select><p>You set the pace. Try a harder conversation when you’re ready.</p><label htmlFor="voice">Their voice</label><select id="voice" value={voiceId} disabled={started} onChange={event => setVoiceId(event.target.value as VoiceId)}>{VOICES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div><div className="practice-note"><Sparkles size={17} /><p>One conversation.<br />A safe place to find your words.</p></div></aside>
      <section className="stage-panel"><div className="stage-top"><span className="small-label">YOUR COUNTERPART</span><span className="difficulty-badge">{difficulty}</span></div><div className="avatar-stage"><div className="stage-orbit" /><Avatar state={avatarState} gender={voice.gender} /><span className="counterpart-name">{counterpart}</span><div className={`state-indicator state-${avatarState}`}><span />{statusText}</div></div><div className="stage-bottom">{!started ? <><h2>Let’s give it a go.</h2><p>Your counterpart will stay in character.<br />You’ll get practical feedback when you finish.</p><button className="primary start-button" disabled={!setup?.gemini || (scenarioId === 'custom' && !customScenario.trim())} onClick={begin}>Start practising <ArrowRight size={18} /></button></> : <><button className={`record-button ${liveActive ? 'recording' : ''}`} disabled={!setup?.gradium || recorder.isRecording || (!liveActive && !liveStarting && busy)} onClick={() => liveActive || liveStarting ? stopLive() : void startLive()}>{liveActive || liveStarting ? <Square size={21} /> : <Mic size={23} />}<span>{liveStarting ? 'Cancel voice connection' : liveActive ? 'Stop live voice' : 'Start live voice'}</span></button><p className="record-help">{liveActive ? 'Speak naturally. Pause to send, or interrupt your counterpart.' : 'Hands-free conversation, with automatic turn taking.'}</p><div className="session-actions"><button className={recorder.isRecording ? 'recording' : ''} disabled={busy || liveActive || liveStarting || !setup?.gradium} onClick={toggleRecording}>{recorder.isRecording ? <Square size={21} fill="currentColor" /> : <Mic size={23} />}<span>{recorder.isRecording ? 'Finish & send' : 'Record your answer'}</span></button></div><p className="record-help">{recorder.isRecording ? 'Click again to send your answer. Up to 60 seconds.' : 'Speak naturally, or use the text box.'}</p><div className="session-actions"><button disabled={busy || !hasUserTurn || recorder.isRecording} onClick={finish}>End session & get feedback <ChevronRight size={15} /></button><button className="reset-button" onClick={reset} aria-label="Reset session"><RotateCcw size={16} /></button></div></>}<p className="privacy-note">Audio goes to Gradium; conversation text goes to Gemini.<br />Audio streams after you start live voice or record an answer.<br />Or record one answer or send a typed message.</p></div></section>
      <section className="transcript-panel"><div className="panel-heading"><span>Your conversation</span><Volume2 size={17} /></div><div className="transcript" aria-live="polite" aria-relevant="additions">{messages.length === 0 ? <div className="empty-transcript"><span><MessageCircle size={28} /></span><h3>The first words are yours.</h3><p>Your conversation will appear here. Speak or type—whatever feels comfortable.</p><div className="tip"><strong>A little tip</strong><p>Try speaking as you would in the real conversation, rather than describing what you’d say.</p></div></div> : messages.map((message, index) => <div key={index} className={`message message-${message.role}`}><span className="message-author">{message.role === 'user' ? 'You' : counterpart.split(' · ')[0]}</span><p>{message.content}</p></div>)}{busy && state !== 'speaking' && <div className="thinking-message"><span /><span /><span /><small>{preparingVoice ? 'Preparing voice' : hasUserTurn ? 'Preparing a response' : 'Working on it'}</small></div>}{partial && <div className="message message-user live-transcript" aria-label="Live transcript" aria-live="off"><span className="message-author">You · {recorder.isRecording || liveActive ? 'speaking' : 'transcribing'}</span><p>{partial}<span className="transcript-caret" aria-hidden="true" /></p></div>}<div ref={transcriptEnd} /></div>{recorder.liveTranscriptError && recorder.isRecording && <p className="record-help" role="status">{recorder.liveTranscriptError}</p>}{(error || recorder.error) && <p className="error-message" role="alert">{error || recorder.error}</p>}<form className="composer" onSubmit={event => { event.preventDefault(); void runTurn('text'); }}><label className="sr-only" htmlFor="answer">Your answer</label><textarea id="answer" placeholder={started ? 'Or type your answer…' : 'Start a session to join the conversation'} value={draft} onChange={event => setDraft(event.target.value)} disabled={!started || busy || recorder.isRecording} maxLength={4000} rows={2} /><button aria-label="Send answer" disabled={!started || busy || recorder.isRecording || !draft.trim()}><Send size={18} /></button></form><div className="composer-note">Your words. Your pace.</div></section>
    </div>}
    <footer className="footer"><span>Built for the conversations that matter.</span><span>Voice by Gradium <span className="footer-divider">/</span> Intelligence by Gemini</span></footer>
  </main>;
}
