import { AlertTriangle, Lightbulb, Mic, X } from 'lucide-react';
import type { LiveComment as Comment } from '@/lib/live-hint';
import './background.css';

const ICONS = { mention: Lightbulb, beware: AlertTriangle, filler: Mic, pace: Mic } as const;

/** One short, dismissible comment under the transcript. Renders nothing when there is none. */
export function LiveComment({ comment, onDismiss }: { comment: Comment | null; onDismiss: () => void }) {
  if (!comment) return null;
  const Icon = ICONS[comment.kind];
  return <div className={`live-comment live-comment-${comment.kind}`} role="status" aria-live="polite">
    <Icon size={15} aria-hidden="true" />
    <div className="live-comment-body">
      <span>{comment.text}</span>
      {comment.keywords.length > 0 && <div className="live-chips" aria-label="Keywords you could use">{comment.keywords.map(word => <span key={word}>{word}</span>)}</div>}
    </div>
    <button type="button" className="live-dismiss" aria-label="Dismiss comment" onClick={onDismiss}><X size={13} /></button>
  </div>;
}
