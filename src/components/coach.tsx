'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronRight, MessageCircle, Mic, RotateCcw, Send, Sparkles, Square, Volume2 } from 'lucide-react';
import { SCENARIOS } from '@/lib/scenarios';
import type { ConversationMessage, FeedbackReport } from '@/lib/contracts';
import { useVoiceSession } from '@/hooks/use-voice-session';
import { Avatar, type AvatarState } from './avatar';

type Difficulty = 'friendly' | 'neutral' | 'challenging';
type Setup = { gemini: boolean; gradium: boolean };

async function responseError(response: Response) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : 'Something went wrong. Please try again.';
}

export function Coach() {
  const [scenarioId, setScenarioId] = useState('interview');
  const [difficulty, setDifficulty] = useState<Difficulty>('neutral');
  const [customScenario, setCustomScenario] = useState('');
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<AvatarState>('idle');
  const [busy, setBusy] = useState(false);
  const [micStarting, setMicStarting] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<FeedbackReport | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [setupFailed, setSetupFailed] = useState(false);
  const recorder = useVoiceSession();
  const lock = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const transcriptEnd = useRef<HTMLDivElement | null>(null);
  const scenario = SCENARIOS.find(item => item.id === scenarioId) ?? SCENARIOS[0];
  const counterpart = ({ interview: 'Alex · Interviewer', raise: 'Alex · Your manager', relationship: 'Alex · Your partner', feedback: 'Alex · Your colleague', custom: 'Alex · Your counterpart' } as Record<string, string>)[scenarioId];
  const hasUserTurn = messages.some(message => message.role === 'user');

  function stopAudio() {
    audio.current?.pause();
    audio.current = null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
  }

  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/status', { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error();
      setSetup(await response.json());
    }).catch(() => { if (!abort.signal.aborted) setSetupFailed(true); });
    return () => { abort.abort(); controller.current?.abort(); stopAudio(); };
  }, []);

  useEffect(() => { transcriptEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }, [messages, busy]);

  function reset() {
    generation.current += 1;
    controller.current?.abort();
    recorder.cancelRecording();
    stopAudio();
    lock.current = false;
    setStarted(false); setMessages([]); setDraft(''); setReport(null);
    setError(''); setState('idle'); setBusy(false); setMicStarting(false);
  }

  async function speak(text: string, token: number, signal: AbortSignal) {
    if (!setup?.gradium) return;
    try {
      const response = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal });
      if (!response.ok) throw new Error(await responseError(response));
      const blob = await response.blob();
      if (token !== generation.current) return;
      stopAudio();
      audioUrl.current = URL.createObjectURL(blob);
      const playback = new Audio(audioUrl.current);
      audio.current = playback;
      await new Promise<void>((resolve, reject) => {
        playback.onended = () => resolve();
        playback.onerror = () => reject(new Error('Audio could not play. Your reply is in the transcript.'));
        signal.addEventListener('abort', () => { playback.pause(); resolve(); }, { once: true });
        playback.play().then(() => { if (token === generation.current) setState('speaking'); }).catch(() => reject(new Error('Audio could not play. Your reply is in the transcript.')));
      });
    } catch (cause) {
      if (token === generation.current && !signal.aborted) setError(cause instanceof Error ? `${cause.message} You can continue by typing.` : 'Speech unavailable. You can continue by typing.');
    } finally { if (token === generation.current) stopAudio(); }
  }

  function begin() {
    if (!setup?.gemini || (scenarioId === 'custom' && !customScenario.trim())) return;
    setMessages([{ role: 'assistant', content: scenario.openingLine }]);
    setStarted(true); setError('');
  }

  async function sendTurn(text: string, token: number, signal: AbortSignal) {
    const next: ConversationMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next); setDraft(''); setState('thinking');
    const response = await fetch('/api/converse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId, difficulty, customScenario, messages: next }), signal });
    if (!response.ok) throw new Error(await responseError(response));
    const { reply } = await response.json();
    if (token !== generation.current) return;
    setMessages([...next, { role: 'assistant', content: reply }]);
    await speak(reply, token, signal);
  }

  async function runTurn(source: 'text' | 'voice') {
    if (lock.current || !setup?.gemini || (source === 'text' && !draft.trim())) return;
    lock.current = true; setBusy(true); setError(''); stopAudio();
    const token = generation.current;
    const abort = new AbortController(); controller.current = abort;
    try {
      let text = draft.trim();
      if (source === 'voice') {
        setState('thinking');
        const blob = await recorder.stopRecording();
        const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: blob, signal: abort.signal });
        if (!response.ok) throw new Error(await responseError(response));
        text = (await response.json()).text;
      }
      if (token === generation.current && text.trim()) await sendTurn(text, token, abort.signal);
    } catch (cause) {
      if (token === generation.current && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not send your answer. Please try again.');
    } finally {
      if (token === generation.current) { lock.current = false; setBusy(false); setState('idle'); }
    }
  }

  async function toggleRecording() {
    if (recorder.isRecording) { await runTurn('voice'); return; }
    if (lock.current || busy) return;
    const token = generation.current;
    lock.current = true; setBusy(true); setMicStarting(true);
    setError(''); stopAudio();
    try { await recorder.startRecording(); } catch { /* Recorder displays its actionable error. */ }
    finally {
      if (token === generation.current) {
        lock.current = false; setBusy(false); setMicStarting(false);
      }
    }
  }

  async function finish() {
    if (lock.current || !hasUserTurn || recorder.isRecording) return;
    lock.current = true; setBusy(true); setState('thinking'); setError(''); stopAudio();
    const token = generation.current;
    const abort = new AbortController(); controller.current = abort;
    try {
      const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId, difficulty, customScenario, messages }), signal: abort.signal });
      if (!response.ok) throw new Error(await responseError(response));
      const feedback = await response.json();
      if (token === generation.current) setReport(feedback);
    } catch (cause) { if (token === generation.current && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not create feedback. Try again.'); }
    finally { if (token === generation.current) { lock.current = false; setBusy(false); setState('idle'); } }
  }

  const avatarState = recorder.isRecording ? 'listening' : state;
  const statusText = micStarting ? 'Connecting your microphone' : recorder.isRecording ? 'Listening to you' : state === 'thinking' ? 'Thinking it through' : state === 'speaking' ? `${counterpart.split(' · ')[0]} is speaking` : started ? 'Your turn. Take your time.' : 'Ready when you are';

  return <main className="app-shell">
    <header className="topbar"><a href="/" className="brand" aria-label="Rehearsal home"><span className="brand-mark"><MessageCircle size={20} /></span>rehearsal<span className="brand-dot">.</span></a><span className="topbar-note">A little practice. A little more confidence.</span><span className="preview-tag">Conversation studio</span></header>
    <section className="page-heading"><div><div className="eyebrow">SPACE TO TRY, ROOM TO GROW</div><h1>{report ? 'Take the practice with you.' : started ? 'You’ve got the floor.' : 'Big conversation? Start here.'}</h1><p>{report ? 'A few useful things to bring into your real conversation.' : 'Rehearse the words before the moment. No pressure to get it perfect.'}</p></div><div className="session-chip"><span />{report ? 'Session complete' : started ? 'Practice in progress' : 'Your private practice space'}</div></section>
    {(setupFailed || (setup && !setup.gemini)) && <div className="setup-notice" role="status"><strong>{setupFailed ? 'Could not check service availability.' : 'Connect Gemini to start practising.'}</strong> {setupFailed ? 'Refresh the page to try again.' : 'Add GEMINI_API_KEY to the server environment, then restart the app.'}</div>}
    {setup?.gemini && !setup.gradium && <div className="setup-notice" role="status">Voice is unavailable until GRADIUM_API_KEY is configured. You can practise by typing.</div>}
    {report ? <section className="report-layout"><div className="report-card"><div className="eyebrow">YOUR SESSION NOTES</div><h2>A stronger next conversation.</h2><p className="report-summary">{report.summary}</p><div className="feedback-grid"><div><h3><Check size={18} /> What worked</h3>{report.strengths.map((item, index) => <p key={index}>{item}</p>)}</div><div><h3><Sparkles size={18} /> Try next time</h3>{report.improvements.map((item, index) => <p key={index}>{item}</p>)}</div></div><div className="suggested"><span className="eyebrow">WORDS TO MAKE YOUR OWN</span><blockquote>“{report.suggestedResponse}”</blockquote></div><button className="primary" onClick={reset}><RotateCcw size={17} /> Practise another conversation</button></div><aside className="report-side"><Avatar state="idle" /><h3>Practice counts.</h3><p>You don’t need perfect words. You need words that sound like you.</p><span>Session held in this browser only.</span></aside></section> : <div className="studio-grid">
      <aside className="scenario-panel"><div className="panel-heading"><span>Choose your conversation</span><span className="small-label">{SCENARIOS.length} scenarios</span></div><div className="scenario-list">{SCENARIOS.map((item, index) => <button key={item.id} className={`scenario-card ${scenarioId === item.id ? 'selected' : ''}`} disabled={started} onClick={() => setScenarioId(item.id)}><span className="scenario-symbol">{['↗', '€', '♡', '↔', '+'][index]}</span><span><strong>{item.title}</strong><small>{item.description}</small></span>{scenarioId === item.id && <Check size={16} className="scenario-check" />}</button>)}</div>{scenarioId === 'custom' && <label className="custom-label">What would you like to practise?<textarea maxLength={2000} disabled={started} value={customScenario} onChange={event => setCustomScenario(event.target.value)} placeholder="Who are you speaking to, and what do you want to say?" /></label>}<div className="difficulty"><label htmlFor="difficulty">Their approach</label><select id="difficulty" value={difficulty} disabled={started} onChange={event => setDifficulty(event.target.value as Difficulty)}><option value="friendly">Friendly · a gentle start</option><option value="neutral">Neutral · keep it realistic</option><option value="challenging">Challenging · push yourself</option></select><p>You set the pace. Try a harder conversation when you’re ready.</p></div><div className="practice-note"><Sparkles size={17} /><p>One conversation.<br />A safe place to find your words.</p></div></aside>
      <section className="stage-panel"><div className="stage-top"><span className="small-label">YOUR COUNTERPART</span><span className="difficulty-badge">{difficulty}</span></div><div className="avatar-stage"><div className="stage-orbit" /><Avatar state={avatarState} /><span className="counterpart-name">{counterpart}</span><div className={`state-indicator state-${avatarState}`}><span />{statusText}</div></div><div className="stage-bottom">{!started ? <><h2>Let’s give it a go.</h2><p>Your counterpart will stay in character.<br />You’ll get practical feedback when you finish.</p><button className="primary start-button" disabled={!setup?.gemini || (scenarioId === 'custom' && !customScenario.trim())} onClick={begin}>Start practising <ArrowRight size={18} /></button></> : <><button className={`record-button ${recorder.isRecording ? 'recording' : ''}`} disabled={busy || !setup?.gradium} onClick={toggleRecording}>{recorder.isRecording ? <Square size={21} fill="currentColor" /> : <Mic size={23} />}<span>{recorder.isRecording ? 'Finish & send' : 'Record your answer'}</span></button><p className="record-help">{recorder.isRecording ? 'Click again to send your answer. Up to 60 seconds.' : 'Speak naturally, or use the text box.'}</p><div className="session-actions"><button disabled={busy || !hasUserTurn || recorder.isRecording} onClick={finish}>End session & get feedback <ChevronRight size={15} /></button><button className="reset-button" onClick={reset} aria-label="Reset session"><RotateCcw size={16} /></button></div></>}<p className="privacy-note">Audio goes to Gradium; conversation text goes to Gemini.<br />Nothing is sent until you start speaking or send a message.</p></div></section>
      <section className="transcript-panel"><div className="panel-heading"><span>Your conversation</span><Volume2 size={17} /></div><div className="transcript" aria-live="polite" aria-relevant="additions">{messages.length === 0 ? <div className="empty-transcript"><span><MessageCircle size={28} /></span><h3>The first words are yours.</h3><p>Your conversation will appear here. Speak or type—whatever feels comfortable.</p><div className="tip"><strong>A little tip</strong><p>Try speaking as you would in the real conversation, rather than describing what you’d say.</p></div></div> : messages.map((message, index) => <div key={index} className={`message message-${message.role}`}><span className="message-author">{message.role === 'user' ? 'You' : counterpart.split(' · ')[0]}</span><p>{message.content}</p></div>)}{busy && state !== 'speaking' && <div className="thinking-message"><span /><span /><span /><small>{hasUserTurn ? 'Preparing a response' : 'Working on it'}</small></div>}<div ref={transcriptEnd} /></div>{(error || recorder.error) && <p className="error-message" role="alert">{error || recorder.error}</p>}<form className="composer" onSubmit={event => { event.preventDefault(); void runTurn('text'); }}><label className="sr-only" htmlFor="answer">Your answer</label><textarea id="answer" placeholder={started ? 'Or type your answer…' : 'Start a session to join the conversation'} value={draft} onChange={event => setDraft(event.target.value)} disabled={!started || busy || recorder.isRecording} maxLength={4000} rows={2} /><button aria-label="Send answer" disabled={!started || busy || recorder.isRecording || !draft.trim()}><Send size={18} /></button></form><div className="composer-note">Your words. Your pace.</div></section>
    </div>}
    <footer className="footer"><span>Built for the conversations that matter.</span><span>Voice by Gradium <span className="footer-divider">/</span> Intelligence by Gemini</span></footer>
  </main>;
}
