'use client';

/* eslint-disable jsx-a11y/media-has-caption -- Audio-only recordings have equivalent text in the adjacent verbatim transcript disclosure. */

import { useEffect, useId, useRef, useState } from 'react';
import { getComparableSessions, type SavedSession } from '@/lib/profile';
import { loadAudioRecording } from '@/lib/audio-storage';
import './audio-review.css';

type LocalRecording = { id: string; blob: Blob };
const timestamp = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;

function audioStats(session: SavedSession) {
  const audio = session.audio;
  if (!audio) return null;
  const analyses = audio.analyses.filter(item => audio.recordings.some(recording => recording.id === item.recordingId));
  const words = analyses.reduce((sum, item) => sum + (item.transcript.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0), 0);
  const fillers = analyses.flatMap(item => item.fillers);
  const complete = audio.recordings.length > 0 && audio.recordings.every(recording => analyses.some(item => item.recordingId === recording.id));
  return { words, fillers, complete, rate: words ? fillers.length / words * 100 : null };
}

function AudioProgress({ session, sessions }: { session: SavedSession; sessions: SavedSession[] }) {
  const current = audioStats(session);
  if (session.audio?.captureWarning || session.audio?.error) return <p className="muted-copy">This session has an audio recording or analysis warning, so it is excluded from progress comparisons.</p>;
  if (!current?.complete || current.rate === null) {
    return <p className="muted-copy">Progress comparisons will appear when all recordings in this session have been analysed.</p>;
  }
  const points = [...getComparableSessions(session, sessions), session].flatMap(item => {
    const stats = audioStats(item);
    return stats?.complete && stats.rate !== null && !item.audio?.captureWarning && !item.audio?.error ? [{ session: item, rate: stats.rate }] : [];
  }).slice(-6);
  if (points.length < 2) return <p className="muted-copy">Your next fully analysed conversation at the same difficulty and scenario will add a progress comparison.</p>;
  const maximum = Math.max(1, ...points.map(point => point.rate));
  const previous = points.at(-2)!;
  const delta = current.rate - previous.rate;
  return <figure className="audio-progress" aria-label="Filler frequency across matching sessions">
    <figcaption>Fillers per 100 recognised words</figcaption>
    <div className="audio-progress-bars">{points.map((point, index) => <div className="audio-progress-column" key={point.session.id}>
      <strong>{point.rate.toFixed(1)}</strong>
      <div className="audio-progress-track" aria-hidden="true"><span style={{ height: `${point.rate / maximum * 100}%` }} /></div>
      <span>{index === points.length - 1 ? 'This session' : new Date(point.session.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
    </div>)}</div>
    <p className="comparison-context">{delta === 0 ? 'The same frequency as' : `${Math.abs(delta).toFixed(1)} ${delta > 0 ? 'more' : 'fewer'} fillers per 100 words than`} your previous matching conversation. A lower count is not automatically better delivery.</p>
  </figure>;
}

function RecordingPlayer({ sessionId, recording, analysis, index, localRecordings }: {
  sessionId: string;
  recording: NonNullable<SavedSession['audio']>['recordings'][number];
  analysis: NonNullable<SavedSession['audio']>['analyses'][number] | undefined;
  index: number;
  localRecordings?: LocalRecording[];
}) {
  const player = useRef<HTMLAudioElement>(null);
  const [source, setSource] = useState<{ url?: string; error?: string }>({});
  const [playError, setPlayError] = useState('');
  const [ready, setReady] = useState(false);
  const localBlob = localRecordings?.find(item => item.id === recording.id)?.blob;
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    async function load() {
      try {
        const blob = localBlob ?? await loadAudioRecording(sessionId, recording.id);
        if (!active) return;
        if (!blob) { setSource({ error: 'This recording is unavailable in this browser. Your saved analysis is still here.' }); return; }
        url = URL.createObjectURL(blob);
        setSource({ url });
      } catch {
        if (active) setSource({ error: 'This browser could not open the recording. Try reopening this report.' });
      }
    }
    void load();
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [sessionId, recording.id, localBlob]);

  async function playFiller(seconds: number) {
    const audio = player.current;
    if (!audio || !source.url) return;
    setPlayError('');
    try { audio.currentTime = seconds; await audio.play(); }
    catch { setPlayError('Playback could not start. Use the audio controls to play this recording.'); }
  }
  return <div className="audio-recording">
    {source.error ? <p role="status" className="muted-copy">{source.error}</p> : source.url ?
      <audio ref={player} controls preload="metadata" src={source.url} aria-label="Your recorded voice"
        onLoadStart={() => setReady(false)} onLoadedMetadata={() => setReady(true)}
        onError={() => { setReady(false); setPlayError('This recording could not be played in this browser. Your saved analysis is still available.'); }} /> : <p role="status">Loading your recording…</p>}
    {playError && <p role="status" className="muted-copy">{playError}</p>}
    <p className="muted-copy">Recording {index + 1} · {timestamp(recording.durationSeconds)} · Your microphone audio</p>
    {!analysis ? <p className="chart-empty">This recording has not been analysed yet.</p> : <>
      <h4>Listen to each detected filler</h4>
      {analysis.fillers.length === 0 ? <p className="muted-copy">Gemini detected no fillers in this recording. Audio analysis can still miss quiet or unclear sounds.</p> : <>
        <div className="audio-timeline" aria-hidden="true">{analysis.fillers.map((filler, i) => <span key={i} style={{ left: `${Math.min(100, filler.startSeconds / Math.max(recording.durationSeconds, 1) * 100)}%` }} />)}</div>
        <div className="audio-time-labels" aria-hidden="true"><span>0:00</span><span>{timestamp(recording.durationSeconds)}</span></div>
        <div className="audio-filler-links">{analysis.fillers.map((filler, i) => <button type="button" key={i} disabled={!source.url || !ready}
          aria-label={`Play ${filler.word} at ${timestamp(filler.startSeconds)}`} onClick={() => void playFiller(filler.startSeconds)}>
          <span>{filler.word}</span><time>{timestamp(filler.startSeconds)}</time>
        </button>)}</div>
      </>}
      <details className="audio-verbatim"><summary>Read the verbatim audio transcript</summary><p>{analysis.transcript || 'No words were recognised in this recording.'}</p></details>
    </>}
  </div>;
}

export function AudioReviewReport({ session, sessions, onRetry, busy = false, localRecordings }: {
  session: SavedSession; sessions: SavedSession[]; onRetry?: () => void; busy?: boolean; localRecordings?: LocalRecording[];
}) {
  const [selectedId, setSelectedId] = useState('');
  const selectId = useId();
  const audio = session.audio;
  const stats = audioStats(session);
  if (!audio || !stats) return null;
  const recording = audio.recordings.find(item => item.id === selectedId) ?? audio.recordings[0];
  const analysedCount = audio.recordings.filter(item => audio.analyses.some(analysis => analysis.recordingId === item.id)).length;
  const counts = stats.fillers.reduce<Record<string, number>>((result, filler) => {
    const word = filler.word.toLocaleLowerCase().trim();
    return { ...result, [word]: (result[word] ?? 0) + 1 };
  }, {});
  const types = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const maximum = Math.max(1, ...types.map(([, count]) => count));
  return <section className="report-section audio-review" aria-label="Recorded voice analysis">
    <span className="eyebrow">YOUR VOICE, REVISITED</span>
    <h3>Hear your speaking habits</h3>
    <p className="muted-copy">Gemini listens to your saved microphone recording after the conversation. Filler detection and timestamps are estimates; replay a moment to check it.</p>
    <div className="audio-review-status" role="status">{busy ? 'Gemini is listening to your recordings…' : stats.complete ? `${analysedCount} ${analysedCount === 1 ? 'recording' : 'recordings'} analysed.` : analysedCount ? `Partial analysis: ${analysedCount} of ${audio.recordings.length} recordings analysed.` : 'Audio analysis is not available yet.'}</div>
    {audio.error && <p className="muted-copy">{audio.error}</p>}
    {audio.captureWarning && <p className="muted-copy">{audio.captureWarning}</p>}
    {audio.storageWarning && <p className="muted-copy">{audio.storageWarning}</p>}
    {!stats.complete && onRetry && <button type="button" className="secondary-button" disabled={busy || !recording} onClick={onRetry}>{busy ? 'Analysing audio…' : 'Retry audio analysis'}</button>}
    {analysedCount > 0 && <>
      <div className="audio-stat-grid">
        <div><strong>{stats.fillers.length}</strong><span>Detected fillers{stats.complete ? '' : ' in analysed audio'}</span></div>
        <div><strong>{stats.words}</strong><span>Recognised words</span></div>
        <div><strong>{stats.rate === null ? 'Unavailable' : stats.rate.toFixed(1)}</strong><span>Fillers per 100 recognised words</span></div>
      </div>
      <div className="audio-charts">
        <figure className="audio-count-chart" aria-label="Filler word counts"><figcaption>Sounds Gemini picked up</figcaption>
          {types.length ? <ul>{types.map(([word, count]) => <li key={word}><span>{word}</span><div aria-hidden="true"><i style={{ width: `${count / maximum * 100}%` }} /></div><strong>{count}</strong></li>)}</ul> : <p className="muted-copy">No fillers detected in the analysed recordings.</p>}
        </figure>
        <AudioProgress session={session} sessions={sessions} />
      </div>
    </>}
    {recording && <>
      {audio.recordings.length > 1 && <div className="audio-clip-select"><label htmlFor={selectId}>Choose a recording</label><select id={selectId} value={recording.id} onChange={event => setSelectedId(event.target.value)}>{audio.recordings.map((item, index) => <option value={item.id} key={item.id}>Recording {index + 1} · {timestamp(item.durationSeconds)}</option>)}</select></div>}
      <RecordingPlayer key={`${session.id}:${recording.id}`} sessionId={session.id} recording={recording} analysis={audio.analyses.find(item => item.recordingId === recording.id)} index={audio.recordings.indexOf(recording)} localRecordings={localRecordings} />
    </>}
  </section>;
}
