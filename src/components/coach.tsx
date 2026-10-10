'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Mic, RotateCcw, Send, Square } from 'lucide-react';
import { SCENARIOS } from '@/lib/scenarios';
import { tonalityById, userToneLabel } from '@/lib/tonality';
import type { ConversationMessage, ConverseReply, FeedbackReport, ScenarioId, Tonality, UserTone } from '@/lib/contracts';
import { useVoiceSession } from '@/hooks/use-voice-session';
import { Sunflower, type FlowerState } from './sunflower';

type Setup = { gemini: boolean; gradium: boolean };
type Tones = { userTone?: UserTone; tonality?: Tonality };

const PRACTICE = SCENARIOS.filter(item => item.id !== 'custom');
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

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

function Scenery() {
  return <div className="scenery" aria-hidden="true">
    <span className="cloud cloud-a" /><span className="cloud cloud-b" /><span className="cloud cloud-c" />
    <svg className="hills" viewBox="0 0 1440 420" preserveAspectRatio="none">
      <path d="M0 210C180 90 330 120 480 180s300 10 470-90 330 20 490 70v260H0z" fill="#b9cfa8" />
      <path d="M0 290c200-90 380-60 560 0s340 40 520-30 280-40 360 0v160H0z" fill="#93b77f" />
      <path d="M0 360c240-60 480-50 720 0s480 40 720-10v70H0z" fill="#79a564" />
    </svg>
  </div>;
}

export function Coach() {
  const [intro, setIntro] = useState(true);
  const endIntro = useCallback(() => setIntro(false), []);
  const [scenarioId, setScenarioId] = useState<ScenarioId>('interview');
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [tones, setTones] = useState<Tones>({});
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<FlowerState>('idle');
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
  const scenario = SCENARIOS.find(item => item.id === scenarioId) ?? SCENARIOS[0];
  const hasUserTurn = messages.some(message => message.role === 'user');
  const lastReply = [...messages].reverse().find(message => message.role === 'assistant')?.content;
  const lastAnswer = [...messages].reverse().find(message => message.role === 'user')?.content;

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

  function reset() {
    generation.current += 1;
    controller.current?.abort();
    recorder.cancelRecording();
    stopAudio();
    lock.current = false;
    setStarted(false); setMessages([]); setTones({}); setDraft(''); setReport(null);
    setError(''); setState('idle'); setBusy(false); setMicStarting(false);
  }

  async function speak(text: string, token: number, signal: AbortSignal, tonality?: Tonality) {
    if (!setup?.gradium) return;
    try {
      const response = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, tonality }), signal });
      if (!response.ok) throw new Error(await responseError(response));
      const blob = await response.blob();
      if (token !== generation.current) return;
      stopAudio();
      audioUrl.current = URL.createObjectURL(blob);
      const playback = new Audio(audioUrl.current);
      audio.current = playback;
      await new Promise<void>((resolve, reject) => {
        playback.onended = () => resolve();
        playback.onerror = () => reject(new Error('Audio could not play. The reply is written above.'));
        signal.addEventListener('abort', () => { playback.pause(); resolve(); }, { once: true });
        playback.play().then(() => { if (token === generation.current) setState('speaking'); }).catch(() => reject(new Error('Audio could not play. The reply is written above.')));
      });
    } catch (cause) {
      if (token === generation.current && !signal.aborted) setError(cause instanceof Error ? `${cause.message} You can continue by typing.` : 'Speech unavailable. You can continue by typing.');
    } finally { if (token === generation.current) stopAudio(); }
  }

  function begin() {
    if (!setup?.gemini) return;
    setMessages([{ role: 'assistant', content: scenario.openingLine }]);
    setStarted(true); setError('');
  }

  async function sendTurn(text: string, token: number, signal: AbortSignal) {
    const next: ConversationMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next); setDraft(''); setState('thinking');
    const response = await fetch('/api/converse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId, difficulty: 'neutral', tonality: 'auto', messages: next }), signal });
    if (!response.ok) throw new Error(await responseError(response));
    const { reply, userTone, tonality }: Partial<ConverseReply> & { reply: string } = await response.json();
    if (token !== generation.current) return;
    setMessages([...next, { role: 'assistant', content: reply }]);
    setTones({ userTone, tonality });
    await speak(reply, token, signal, tonality);
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
      const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId, difficulty: 'neutral', messages }), signal: abort.signal });
      if (!response.ok) throw new Error(await responseError(response));
      const feedback = await response.json();
      if (token === generation.current) setReport(feedback);
    } catch (cause) { if (token === generation.current && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not create feedback. Try again.'); }
    finally { if (token === generation.current) { lock.current = false; setBusy(false); setState('idle'); } }
  }

  const flowerState: FlowerState = recorder.isRecording ? 'listening' : state;
  const tone = tones.tonality && tonalityById(tones.tonality);
  const feeling = tones.userTone && userToneLabel(tones.userTone).toLowerCase();
  const headline = report ? 'Here’s what you can take with you.'
    : feeling && tone ? `I’m sensing you feel ${feeling}, so I’m adapting ${article(tone.label)} ${tone.label.toLowerCase()} tone. ${tone.voiceName} is here to train you.`
    : started ? 'Talk to me. I’ll sense how you feel and adapt my tone.'
    : 'Hi, I’m your practice sunflower. Pick a conversation and I’ll train you.';
  const status = micStarting ? 'connecting your microphone' : recorder.isRecording ? 'listening' : state === 'thinking' ? 'thinking' : state === 'speaking' ? `${tone?.voiceName ?? 'sunflower'} is speaking` : started ? 'your turn' : 'ready when you are';

  return <main className="garden">
    {intro && <Intro onDone={endIntro} />}
    <Scenery />
    <header className="corner"><span className="corner-mark">Got credits? <b>:)</b></span><span className="corner-status">{status}</span></header>
    <section className="stage">
      <Sunflower state={flowerState} mood={(report ? undefined : tones.userTone) ?? 'happy'} />
      <div className="copy">
        <h1 className={`headline ${feeling && tone && !report ? 'headline-long' : ''}`} aria-live="polite">{headline}</h1>
        {(setupFailed || (setup && !setup.gemini)) && <p className="notice" role="status">{setupFailed ? 'Could not check service availability. Refresh to try again.' : 'Connect Gemini to start practising. Add GEMINI_API_KEY and restart the app.'}</p>}
        {setup?.gemini && !setup.gradium && <p className="notice" role="status">Voice is off until GRADIUM_API_KEY is configured. You can still type.</p>}
        {report ? <div className="report">
          <p className="report-summary">{report.summary}</p>
          <div className="report-grid">
            <div><h2>What worked</h2>{report.strengths.map((item, index) => <p key={index}>{item}</p>)}</div>
            <div><h2>Try next time</h2>{report.improvements.map((item, index) => <p key={index}>{item}</p>)}</div>
          </div>
          <blockquote>“{report.suggestedResponse}”</blockquote>
          <button className="pill pill-solid" onClick={reset}><RotateCcw size={16} /> Practise again</button>
        </div> : started && <div className="dialogue">
          {lastAnswer && <p className="said-you">You: {lastAnswer}</p>}
          {lastReply && <p className="said-flower">“{lastReply}”</p>}
          {busy && state === 'thinking' && <p className="said-thinking">thinking…</p>}
        </div>}
        {(error || recorder.error) && <p className="error" role="alert">{error || recorder.error}</p>}
      </div>
      {!report && <div className="dock">
        {!started ? <>
          <div className="scenarios" role="group" aria-label="Conversation">{PRACTICE.map(item => <button key={item.id} className={`pill ${scenarioId === item.id ? 'pill-on' : ''}`} aria-pressed={scenarioId === item.id} onClick={() => setScenarioId(item.id)}>{item.title}</button>)}</div>
          <button className="start" disabled={!setup?.gemini} onClick={begin}>Start practising <ArrowRight size={20} /></button>
        </> : <>
          <button className={`mic ${recorder.isRecording ? 'mic-on' : ''}`} disabled={busy || !setup?.gradium} onClick={toggleRecording}>{recorder.isRecording ? <Square size={22} fill="currentColor" /> : <Mic size={26} />}<span className="sr-only">{recorder.isRecording ? 'Finish & send' : 'Record your answer'}</span></button>
          <form className="composer" onSubmit={event => { event.preventDefault(); void runTurn('text'); }}>
            <label className="sr-only" htmlFor="answer">Your answer</label>
            <input id="answer" placeholder="or type your answer…" value={draft} onChange={event => setDraft(event.target.value)} disabled={busy || recorder.isRecording} maxLength={4000} autoComplete="off" />
            <button aria-label="Send answer" disabled={busy || recorder.isRecording || !draft.trim()}><Send size={18} /></button>
          </form>
          <div className="dock-actions">
            <button className="pill" disabled={busy || !hasUserTurn || recorder.isRecording} onClick={finish}>End session & get feedback</button>
            <button className="pill pill-icon" onClick={reset} aria-label="Reset session"><RotateCcw size={16} /></button>
          </div>
        </>}
      </div>}
    </section>
  </main>;
}
