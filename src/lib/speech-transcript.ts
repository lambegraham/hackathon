import type { SpeechMetadata, SpeechSegment } from './contracts';

/** Keep provider-recognized text untouched; timestamps refer to its audio stream. */
export function createSpeechTranscript() {
  let segments: SpeechSegment[] = [];
  let ids: unknown[] = [];
  let display = '';
  const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 600;
  function add(event: Record<string, unknown>) {
    if (event.type === 'text' && typeof event.text === 'string' && event.text.length > 0) {
      // Supply a separator only where token boundaries would otherwise merge words.
      const separator = display && event.text && !/\s$/.test(display) && !/^[\s,.!?;:'’]/.test(event.text) ? ' ' : '';
      const next = display + separator + event.text;
      if (next.length > 4000 || segments.length >= 4000) throw new Error('Transcript exceeds its limit.');
      const previousStart = segments.findLast(segment => segment.startSeconds !== undefined)?.startSeconds ?? 0;
      const startSeconds = timestamp(event.start_s) && event.start_s >= previousStart ? event.start_s : undefined;
      segments = [...segments, { text: event.text, ...(startSeconds === undefined ? {} : { startSeconds }) }];
      ids = [...ids, event.stream_id]; display = next;
    } else if (event.type === 'end_text' && timestamp(event.stop_s)) {
      const index = event.stream_id === undefined ? segments.length - 1 : ids.findLastIndex(id => id === event.stream_id);
      const segment = segments[index];
      if (!segment || segment.endSeconds !== undefined || segment.startSeconds === undefined || event.stop_s < segment.startSeconds) return;
      const nextStart = segments.slice(index + 1).find(item => item.startSeconds !== undefined)?.startSeconds;
      if (nextStart !== undefined && event.stop_s > nextStart) return;
      segments = segments.map((item, position) => position === index ? { ...item, endSeconds: event.stop_s as number } : item);
    }
  }
  function snapshot(): SpeechMetadata { return { source: 'gradium', segments: segments.map(segment => ({ ...segment })) }; }
  function reset() { segments = []; ids = []; display = ''; }
  return { add, snapshot, reset, text: () => display };
}
