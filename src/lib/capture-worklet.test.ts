import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

it.each([
  ['../hooks/use-voice-session.ts', 'WORKLET_SOURCE'],
  ['./duplex-session.ts', 'WORKLET'],
])('%s worklet flushes short utterances and quiet samples before drain acknowledgement', (path, variable) => {
  const text = readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = text.match(new RegExp('const ' + variable + ' = `([\\s\\S]*?)`;'))?.[1];
  expect(code).toBeDefined();
  type Recorder = { port: { onmessage: (event: { data: { type: string } }) => void }; process: (channels: Float32Array[][]) => boolean };
  let create!: new () => Recorder;
  const messages: unknown[] = [];
  runInNewContext(code!, {
    sampleRate: 48000,
    Float32Array,
    AudioWorkletProcessor: class { port = { postMessage: (message: unknown) => messages.push(message), onmessage: vi.fn() }; },
    registerProcessor: (_name: string, Constructor: new () => Recorder) => { create = Constructor; },
  });
  const recorder = new create();
  const frame = new Float32Array(128); frame[0] = 0.25;
  recorder.process([[frame]]); expect(messages).toHaveLength(0);
  recorder.port.onmessage({ data: { type: 'drain' } });
  expect(messages[0]).toEqual(frame); expect(messages[1]).toEqual({ type: 'drained' });
  recorder.process([[frame]]); expect(messages).toHaveLength(2);
});
