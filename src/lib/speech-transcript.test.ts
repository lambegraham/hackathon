import { expect, it } from 'vitest';
import { createSpeechTranscript } from './speech-transcript';
it('ignores empty text events without creating unsaveable segments', () => {
  const transcript = createSpeechTranscript();
  transcript.add({ type: 'text', text: '', start_s: 0 });
  transcript.add({ type: 'text', text: 'Um...', start_s: 1 });
  expect(transcript.snapshot().segments).toEqual([{ text: 'Um...', startSeconds: 1 }]);
});
it('preserves fillers, repeats, punctuation and whitespace and pairs provider timestamps', () => {
  const transcript = createSpeechTranscript();
  transcript.add({ type: 'text', text: ' um,  um ', start_s: 1, stream_id: 1 });
  transcript.add({ type: 'text', text: 'like... I—I', start_s: 3, stream_id: 2 });
  transcript.add({ type: 'end_text', stop_s: 4, stream_id: 2 });
  transcript.add({ type: 'end_text', stop_s: 2, stream_id: 1 });
  expect(transcript.text()).toBe(' um,  um like... I—I');
  expect(transcript.snapshot()).toEqual({ source: 'gradium', segments: [
    { text: ' um,  um ', startSeconds: 1, endSeconds: 2 },
    { text: 'like... I—I', startSeconds: 3, endSeconds: 4 },
  ] });
});
it('joins words without modifying raw segments and attaches missing stream id to most recent segment', () => {
  const transcript = createSpeechTranscript();
  transcript.add({ type: 'text', text: 'well', start_s: 0 });
  transcript.add({ type: 'text', text: ',', start_s: 0.2 });
  transcript.add({ type: 'text', text: 'okay', start_s: 0.5 });
  transcript.add({ type: 'end_text', stop_s: 1 });
  expect(transcript.text()).toBe('well, okay');
  expect(transcript.snapshot().segments.at(-1)).toEqual({ text: 'okay', startSeconds: 0.5, endSeconds: 1 });
  const snapshot = transcript.snapshot(); transcript.reset();
  expect(transcript.text()).toBe(''); expect(snapshot.segments).toHaveLength(3);
  snapshot.segments[0].text = 'modified'; expect(transcript.snapshot().segments).toEqual([]);
});
it('discards invalid timestamps without discarding recognized words', () => {
  const transcript = createSpeechTranscript();
  transcript.add({ type: 'text', text: 'uh', start_s: 2 });
  transcript.add({ type: 'text', text: 'hmm', start_s: 1 });
  transcript.add({ type: 'end_text', stop_s: 1 });
  transcript.add({ type: 'text', text: 'yes', start_s: 601 });
  transcript.add({ type: 'end_text', stop_s: -1 });
  transcript.add({ type: 'end_text', stop_s: Number.NaN, stream_id: 'missing' });
  expect(transcript.snapshot().segments).toEqual([{ text: 'uh', startSeconds: 2 }, { text: 'hmm' }, { text: 'yes' }]);
});
it('bounds provider data without silently truncating words', () => {
  const transcript = createSpeechTranscript();
  expect(() => transcript.add({ type: 'text', text: 'a'.repeat(4001) })).toThrow();
  expect(transcript.text()).toBe('');
  for (let index = 0; index < 2000; index++) transcript.add({ type: 'text', text: 'a' });
  expect(() => transcript.add({ type: 'text', text: 'more' })).toThrow();
  expect(transcript.snapshot().segments).toHaveLength(2000);
});
it('ignores unmatched ends and invalid intervals, and emits only supported metadata fields', () => {
  const transcript = createSpeechTranscript();
  transcript.add({ type: 'ready' });
  transcript.add({ type: 'text', text: 'uh', start_s: 2, stream_id: 'first', confidence: 0.9 });
  const snapshot = transcript.snapshot();
  transcript.add({ type: 'end_text', stop_s: 3, stream_id: 'missing' });
  transcript.add({ type: 'end_text', stop_s: 1, stream_id: 'first' });
  transcript.add({ type: 'text', text: 'okay', start_s: 4, stream_id: 'second' });
  transcript.add({ type: 'end_text', stop_s: 5, stream_id: 'first' });
  transcript.add({ type: 'end_text', stop_s: 3, stream_id: 'first' });
  transcript.add({ type: 'end_text', stop_s: 3.5, stream_id: 'first' });
  expect(transcript.snapshot()).toEqual({source: 'gradium', segments: [{text: 'uh', startSeconds: 2, endSeconds: 3}, {text: 'okay', startSeconds: 4}]});
  expect(snapshot.segments).toEqual([{text: 'uh', startSeconds: 2}]);
});
