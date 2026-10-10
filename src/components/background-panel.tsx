import { useRef, useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { BACKGROUND_KINDS, MAX_TARGET, type BackgroundKind } from '@/lib/background';
import type { Sensitivity } from '@/lib/live-nudges';
import type { BackgroundState } from '@/hooks/use-background';
import { MIN_GOAL_CHARS, type GoalTracker } from '@/hooks/use-goal-tracker';
import { GoalChecklist } from './goal-tracker';
import './background.css';

export function SensitivitySelect({ value, onChange }: { value: Sensitivity; onChange: (value: Sensitivity) => void }) {
  return <label className="bg-field">Live comments
    <select value={value} onChange={event => onChange(event.target.value as Sensitivity)} aria-label="Live comments">
      <option value="normal">Normal</option>
      <option value="quiet">Quiet (fewer)</option>
      <option value="off">Off</option>
    </select>
  </label>;
}

/** Before the conversation: add documents, review the profile, set the target. After it starts: only the comment setting. */
export function BackgroundPanel({ bg, started, tracker, goalStale, onMatch }: { bg: BackgroundState; started: boolean; tracker: GoalTracker; goalStale: boolean; onMatch: () => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [pasted, setPasted] = useState('');
  const [own, setOwn] = useState('');
  const [ownKind, setOwnKind] = useState<BackgroundKind>('strength');
  const confirmed = bg.live.length;

  if (started) {
    return <div className="bg-panel bg-compact">
      <span className="bg-title">Live coach</span>
      <p className="bg-note">{confirmed ? `${confirmed} confirmed profile ${confirmed === 1 ? 'item' : 'items'} in use.` : 'No profile items. Only delivery comments (filler words, pace) will appear.'}</p>
      <GoalChecklist tracker={tracker} items={bg.items} live onRetry={onMatch} />
      <SensitivitySelect value={bg.sensitivity} onChange={bg.setSensitivity} />
    </div>;
  }

  return <details className="bg-panel" open>
    <summary className="bg-title">Your background <span>(optional)</span></summary>
    <p className="bg-note">Add a CV, LinkedIn PDF or notes. The coach reads them once and builds a profile you can edit. During practice it will suggest what to mention and what to watch out for.</p>

    <div className="bg-actions">
      <button type="button" className="bg-button" disabled={bg.reading} onClick={() => input.current?.click()}><FileText size={14} /> {bg.reading ? 'Reading…' : 'Upload files'}</button>
      <input ref={input} type="file" multiple accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown" className="sr-only" aria-label="Upload CV or notes" tabIndex={-1}
        onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void bg.addFiles(files); }} />
    </div>
    <label className="bg-field">Or paste text
      <textarea value={pasted} maxLength={40000} rows={3} onChange={event => setPasted(event.target.value)} placeholder="Paste your CV, a LinkedIn About section, project notes…" />
    </label>
    <button type="button" className="bg-button" disabled={bg.reading || !pasted.trim()} onClick={() => void bg.addText(pasted).then(done => { if (done) setPasted(''); })}>Add pasted text</button>
    <label className="bg-check"><input type="checkbox" checked={bg.includePersonal} onChange={event => bg.setIncludePersonal(event.target.checked)} /> Also pick out age or birth year if my documents state it (never used for live comments)</label>
    <p className="bg-note">PDF, .txt or .md. For LinkedIn, Notion or Word, export to PDF first. Files go to Gemini once to build the profile and are not stored. The profile stays in this page only and disappears when you reload.</p>
    {bg.notice && <p className={`bg-notice bg-notice-${bg.notice.tone}`} role="status">{bg.notice.text}</p>}

    {bg.items.length > 0 && <div className="bg-profile">
      {BACKGROUND_KINDS.map(kind => {
        const rows = bg.items.filter(item => item.kind === kind.id);
        if (!rows.length) return null;
        return <section key={kind.id} className="bg-group">
          <h3>{kind.label}</h3>
          <p className="bg-note">{kind.hint}</p>
          <ul>{rows.map(item => <li key={item.id} className={item.confirmed ? 'is-confirmed' : ''}>
            {kind.id !== 'basics' && <label className="bg-use"><input type="checkbox" checked={item.confirmed} onChange={event => bg.updateItem(item.id, { confirmed: event.target.checked })} aria-label={`Use in coaching: ${item.text}`} /></label>}
            <div className="bg-row">
              <input className="bg-text" value={item.text} maxLength={220} aria-label="Profile item" onChange={event => bg.updateItem(item.id, { text: event.target.value })} />
              <div className="bg-meta"><span className={`bg-badge bg-${item.origin}`}>{item.source === 'You' ? 'Written by you' : item.origin === 'stated' ? 'Stated' : 'Inferred'}</span>{item.evidence && <span className="bg-evidence" title={item.source}>“{item.evidence}”</span>}</div>
            </div>
            <button type="button" className="bg-remove" aria-label={`Remove: ${item.text}`} onClick={() => bg.removeItem(item.id)}><Trash2 size={13} /></button>
          </li>)}</ul>
        </section>;
      })}
      <p className="bg-note"><strong>{confirmed}</strong> items ticked for live comments. Inferred items, room for improvement and warnings start unticked: tick the ones you agree with. “Not shown in your documents” means missing evidence, not inability.</p>
      <div className="bg-add">
        <select value={ownKind} onChange={event => setOwnKind(event.target.value as BackgroundKind)} aria-label="Kind of item to add">
          {BACKGROUND_KINDS.filter(kind => kind.id !== 'basics').map(kind => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
        </select>
        <input value={own} maxLength={220} placeholder="Add your own line" aria-label="Add your own line" onChange={event => setOwn(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); bg.addOwn(ownKind, own); setOwn(''); } }} />
        <button type="button" className="bg-button" aria-label="Add line" disabled={!own.trim()} onClick={() => { bg.addOwn(ownKind, own); setOwn(''); }}><Plus size={13} /></button>
      </div>
      <button type="button" className="bg-link" onClick={bg.clearAll}>Clear profile</button>
    </div>}

    <label className="bg-field">What is this conversation for?
      <textarea value={bg.target} maxLength={MAX_TARGET} rows={3} onChange={event => bg.setTarget(event.target.value)} placeholder="Paste the job description, or write your goal, e.g. “Ask for a raise after shipping the payments feature.”" />
    </label>
    <p className="bg-note">This becomes a checklist. Before practice you see what your profile backs up and where the gaps are; during practice the tracker shows what you have covered and the next best point. The goal goes to Gemini with the items you ticked.</p>
    <button type="button" className="bg-button" disabled={bg.target.trim().length < MIN_GOAL_CHARS || tracker.status === 'planning'} onClick={onMatch}>{tracker.status === 'ready' && !goalStale ? 'Match again' : 'Match my profile to this goal'}</button>
    <GoalChecklist tracker={tracker} items={bg.items} live={false} stale={goalStale} onRetry={onMatch} />
    <SensitivitySelect value={bg.sensitivity} onChange={bg.setSensitivity} />
  </details>;
}
