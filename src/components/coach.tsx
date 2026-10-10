'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Maximize2,
  MessageCircle,
  Mic,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Volume2
} from 'lucide-react';
import { createStreamingPlayer } from '@/lib/streaming-audio';
import { VOICES, type VoiceId } from '@/lib/voices';
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

function SoundWave({ active = false, color = 'blue' }: { active?: boolean; color?: 'blue' | 'slate' }) {
  return (
    <div className={`sound-wave ${active ? 'active' : ''} sound-wave-${color}`} aria-hidden="true">
      <span /><span /><span /><span /><span /><span /><span />
    </div>
  );
}

export function Coach() {
  const [scenarioId, setScenarioId] = useState('interview');
  const [voiceId, setVoiceId] = useState<VoiceId>('marshall');
  const [preparingVoice, setPreparingVoice] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('neutral');
  const [customScenario, setCustomScenario] = useState('');
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<AvatarState>('idle');
  const [busy, setBusy] = useState(false);
  const [micStarting, setMicStarting] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [stageMaximized, setStageMaximized] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<FeedbackReport | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [setupFailed, setSetupFailed] = useState(false);

  const recorder = useVoiceSession();
  const lock = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const player = useRef<ReturnType<typeof createStreamingPlayer> | null>(null);
  const transcriptEnd = useRef<HTMLDivElement | null>(null);

  const scenario = SCENARIOS.find(item => item.id === scenarioId) ?? SCENARIOS[0];
  const voice = VOICES.find(item => item.id === voiceId) ?? VOICES[0];
  const counterpartRole = ({
    interview: 'Interviewer',
    raise: 'Your manager',
    relationship: 'Your partner',
    feedback: 'Your colleague',
    custom: 'Your counterpart'
  } as Record<string, string>)[scenarioId];
  const counterpart = `${voice.name} · ${counterpartRole}`;
  const hasUserTurn = messages.some(message => message.role === 'user');

  function stopAudio() {
    player.current?.stop();
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
    return () => { abort.abort(); controller.current?.abort(); stopAudio(); };
  }, []);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [messages, busy]);

  // Recording duration timer
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (recorder.isRecording) {
      setRecordingSeconds(0);
      timer = setInterval(() => {
        setRecordingSeconds(s => Math.min(60, s + 1));
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [recorder.isRecording]);

  function reset() {
    generation.current += 1;
    controller.current?.abort();
    recorder.cancelRecording();
    stopAudio();
    lock.current = false;
    setStarted(false); setMessages([]); setDraft(''); setReport(null);
    setError(''); setState('idle'); setBusy(false); setMicStarting(false); setPreparingVoice(false);
  }

  async function speak(text: string, token: number, signal: AbortSignal) {
    if (!setup?.gradium) return;
    setPreparingVoice(true);
    try {
      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId, format: 'pcm' }),
        signal
      });
      if (!response.ok) throw new Error(await responseError(response));
      if (token !== generation.current) return;
      await getPlayer().play(response, signal, () => {
        if (token === generation.current) {
          setPreparingVoice(false);
          setState('speaking');
        }
      });
    } catch (cause) {
      if (token === generation.current && !signal.aborted) {
        setError(cause instanceof Error ? `${cause.message} You can continue by typing.` : 'Speech unavailable. You can continue by typing.');
      }
    } finally {
      if (token === generation.current) {
        setPreparingVoice(false);
        stopAudio();
      }
    }
  }

  function begin() {
    if (!setup?.gemini || (scenarioId === 'custom' && !customScenario.trim())) return;
    setMessages([{ role: 'assistant', content: scenario.openingLine }]);
    setStarted(true); setError('');
  }

  async function sendTurn(text: string, token: number, signal: AbortSignal, speechReady = true) {
    const next: ConversationMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next); setDraft(''); setState('thinking');
    const response = await fetch('/api/converse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId, difficulty, customScenario, messages: next }),
      signal
    });
    if (!response.ok) throw new Error(await responseError(response));
    const { reply } = await response.json();
    if (token !== generation.current) return;
    setMessages([...next, { role: 'assistant', content: reply }]);
    if (speechReady) await speak(reply, token, signal);
  }

  async function runTurn(source: 'text' | 'voice') {
    if (lock.current || !setup?.gemini || (source === 'text' && !draft.trim())) return;
    lock.current = true; setBusy(true); setError(''); stopAudio();
    const token = generation.current;
    const abort = new AbortController(); controller.current = abort;
    try {
      let speechReady = !!setup?.gradium;
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
      let text = draft.trim();
      if (source === 'voice') {
        setState('thinking');
        const blob = await recorder.stopRecording();
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'audio/wav' },
          body: blob,
          signal: abort.signal
        });
        if (!response.ok) throw new Error(await responseError(response));
        text = (await response.json()).text;
      }
      if (token === generation.current && text.trim()) await sendTurn(text, token, abort.signal, speechReady);
    } catch (cause) {
      if (token === generation.current && !abort.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Could not send your answer. Please try again.');
      }
    } finally {
      if (token === generation.current) {
        lock.current = false; setBusy(false); setState('idle'); setPreparingVoice(false);
      }
    }
  }

  async function toggleRecording() {
    if (recorder.isRecording) { await runTurn('voice'); return; }
    if (lock.current || busy) return;
    const token = generation.current;
    lock.current = true; setBusy(true); setMicStarting(true);
    setError(''); stopAudio();
    try { await recorder.startRecording(); }
    catch { /* Recorder displays its actionable error. */ }
    finally {
      if (token === generation.current) {
        lock.current = false; setBusy(false); setMicStarting(false); setPreparingVoice(false);
      }
    }
  }

  async function finish() {
    if (lock.current || !hasUserTurn || recorder.isRecording) return;
    lock.current = true; setBusy(true); setState('thinking'); setError(''); stopAudio();
    const token = generation.current;
    const abort = new AbortController(); controller.current = abort;
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId, difficulty, customScenario, messages }),
        signal: abort.signal
      });
      if (!response.ok) throw new Error(await responseError(response));
      const feedback = await response.json();
      if (token === generation.current) setReport(feedback);
    } catch (cause) {
      if (token === generation.current && !abort.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Could not create feedback. Try again.');
      }
    } finally {
      if (token === generation.current) {
        lock.current = false; setBusy(false); setState('idle'); setPreparingVoice(false);
      }
    }
  }

  const avatarState = recorder.isRecording ? 'listening' : state;
  const statusText = micStarting
    ? 'Connecting your microphone'
    : recorder.isRecording
    ? 'Listening to you'
    : preparingVoice
    ? 'Preparing voice'
    : state === 'thinking'
    ? 'Thinking it through'
    : state === 'speaking'
    ? `${counterpart.split(' · ')[0]} is speaking`
    : '';

  const gridClass = [
    'studio-grid',
    sidebarCollapsed && 'sidebar-collapsed',
    stageMaximized && 'stage-maximized'
  ].filter(Boolean).join(' ');

  return (
    <main className="app-shell">
      {/* TOPBAR */}
      <header className="topbar">
        <a href="/" className="brand" aria-label="Rehearsal home">
          <span className="brand-mark"><MessageCircle size={18} /></span>
          rehearsal<span className="brand-dot">.</span>
        </a>
        <div className="topbar-actions">
          <span className="preview-tag">Session</span>
        </div>
      </header>

      {/* PAGE HEADING */}
      <section className="page-heading">
        <div>
          <div className="eyebrow">{scenario.title.toUpperCase()}</div>
          <h1>
            {report
              ? 'Take the practice with you.'
              : started
              ? 'You’ve got the floor.'
              : 'Big conversation? Start here.'}
          </h1>
        </div>
        <div className="session-chip">
          <span />
          {report ? 'Session complete' : started ? 'In progress' : 'Ready'}
        </div>
      </section>

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
      {report ? (
        <section className="report-layout">
          <div className="report-card">
            <div className="eyebrow">SESSION NOTES</div>
            <h2>A stronger next conversation.</h2>
            <p className="report-summary">{report.summary}</p>
            <div className="feedback-grid">
              <div>
                <h3><Check size={17} /> What worked</h3>
                {report.strengths.map((item, index) => <p key={index}>{item}</p>)}
              </div>
              <div>
                <h3><Sparkles size={17} /> Try next time</h3>
                {report.improvements.map((item, index) => <p key={index}>{item}</p>)}
              </div>
            </div>
            <div className="suggested">
              <span className="eyebrow">WORDS TO MAKE YOUR OWN</span>
              <blockquote>“{report.suggestedResponse}”</blockquote>
            </div>
            <button className="primary" onClick={reset}>
              <RotateCcw size={16} /> Practise another conversation
            </button>
          </div>
          <aside className="report-side">
            <Avatar state="idle" gender={voice.gender} scenario={scenarioId} />
            <h3>Practice counts.</h3>
            <span>Session held in this browser only.</span>
          </aside>
        </section>
      ) : (
        <div className={gridClass}>
          {/* LEFT: SCENARIO PANEL */}
          <aside className="scenario-panel">
            <div className="panel-heading">
              <span>Scenarios</span>
            </div>
            <div className="scenario-list">
              {SCENARIOS.map((item, index) => (
                <button
                  key={item.id}
                  className={`scenario-card ${scenarioId === item.id ? 'selected' : ''}`}
                  disabled={started}
                  onClick={() => setScenarioId(item.id)}
                >
                  <span className="scenario-symbol">{['↗', '€', '♡', '↔', '+'][index]}</span>
                  <span className="scenario-info">
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                  </span>
                  {scenarioId === item.id && <Check size={15} className="scenario-check" />}
                </button>
              ))}
            </div>

            {scenarioId === 'custom' && (
              <label className="custom-label">
                Custom scenario
                <textarea
                  maxLength={2000}
                  disabled={started}
                  value={customScenario}
                  onChange={event => setCustomScenario(event.target.value)}
                  placeholder="Who are you speaking to, and what do you want to say?"
                />
              </label>
            )}

            <div className="difficulty">
              <label htmlFor="difficulty">Their approach</label>
              <select
                id="difficulty"
                value={difficulty}
                disabled={started}
                onChange={event => setDifficulty(event.target.value as Difficulty)}
              >
                <option value="friendly">Friendly</option>
                <option value="neutral">Neutral</option>
                <option value="challenging">Challenging</option>
              </select>

              <label htmlFor="voice">Their voice</label>
              <select
                id="voice"
                value={voiceId}
                disabled={started}
                onChange={event => setVoiceId(event.target.value as VoiceId)}
              >
                {VOICES.map(item => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </div>
          </aside>

          {/* CENTER: REHEARSAL STAGE */}
          <section className="stage-panel">
            <div className="stage-top">
              <button
                className="stage-tool-btn"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={sidebarCollapsed ? "Show scenarios" : "Hide scenarios"}
              >
                {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
                <span>{sidebarCollapsed ? "Scenarios" : "Focus"}</span>
              </button>

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
              <div className="stage-orbit" />
              <Avatar state={avatarState} gender={voice.gender} scenario={scenarioId} />

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
              {!started ? (
                <div className="stage-action-center">
                  <button
                    className="primary start-button"
                    disabled={!setup?.gemini || (scenarioId === 'custom' && !customScenario.trim())}
                    onClick={begin}
                  >
                    Start practising <ArrowRight size={17} />
                  </button>
                </div>
              ) : (
                <div className="stage-controls-area">
                  {/* Clean Horizontal Status Row in Whitespace (No Overlap, No Red Numbers) */}
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
                    <button
                      className={`record-button ${recorder.isRecording ? 'recording' : ''}`}
                      disabled={busy || !setup?.gradium}
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
                </div>
              )}
            </div>
          </section>

          {/* RIGHT: TRANSCRIPT PANEL */}
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
              <div ref={transcriptEnd} />
            </div>

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
