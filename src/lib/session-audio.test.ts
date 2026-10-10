import { describe, expect, it } from 'vitest';
import { createSessionAudio } from './session-audio';

describe('session microphone recording', () => {
  it('retains quiet audio, copies input frames and encodes actual mono PCM16 WAV', async () => {
    const capture = createSessionAudio();
    const frame = new Float32Array(16000); frame[0] = 0.5;
    capture.push(frame, 16000); frame.fill(1);
    const [recording] = capture.finish();
    const bytes = new DataView(await recording.blob.arrayBuffer());
    expect(recording.durationSeconds).toBe(1);
    expect(recording.blob.type).toBe('audio/wav');
    expect(bytes.getUint32(24, true)).toBe(16000);
    expect(bytes.getInt16(44, true)).toBe(16384);
    expect(bytes.getInt16(46, true)).toBe(0);
    expect(capture.finish()[0].id).toBe(recording.id);
  });
  it('preserves sample duration across small 44.1kHz input frames', () => {
    const capture = createSessionAudio();
    for (let index = 0; index < 441; index++) capture.push(new Float32Array(100).fill(0.1), 44100);
    expect(capture.finish()[0].durationSeconds).toBe(1);
  });
  it('splits at 60 seconds while retaining silence and final partial audio', () => {
    const capture = createSessionAudio(); capture.push(new Float32Array(16000 * 61), 16000);
    expect(capture.finish().map((clip) => clip.durationSeconds)).toEqual([60, 1]);
  });
  it('rejects input above ten minutes explicitly and allows reset', () => {
    const capture = createSessionAudio();
    for (let index = 0; index < 10; index++) capture.push(new Float32Array(16000 * 60), 16000);
    expect(() => capture.push(new Float32Array(1), 16000)).toThrow(/10 minutes/);
    expect(capture.finish()).toHaveLength(10);
    capture.reset(); expect(capture.finish()).toEqual([]); capture.reset();
    capture.push(new Float32Array(160), 16000); expect(capture.finish()).toHaveLength(1);
  });
  it('rejects corrupt audio and disallows appending to a finished recording', () => {
    const capture = createSessionAudio();
    expect(() => capture.push(new Float32Array([NaN]), 16000)).toThrow(/samples/);
    expect(() => capture.push(new Float32Array(1), 100)).toThrow(/rate/);
    capture.finish(); expect(() => capture.push(new Float32Array(1), 16000)).toThrow(/finished/);
  });
});

import { drainAudioWorklet } from './session-audio';
import { vi } from 'vitest';
it('coalesces simultaneous stop requests and preserves final frames before acknowledgement', async () => {
  const onmessage = vi.fn();
  const port = { onmessage, postMessage: vi.fn() };
  const processor = { port } as unknown as AudioWorkletNode;
  const first = drainAudioWorklet(processor); const second = drainAudioWorklet(processor);
  expect(port.postMessage).toHaveBeenCalledTimes(1);
  port.onmessage({ data: new Float32Array([0.1]) });
  port.onmessage({ data: { type: 'drained' } });
  await Promise.all([first, second]);
  expect(onmessage).toHaveBeenCalledTimes(1);
});
