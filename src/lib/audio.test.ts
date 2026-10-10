import { describe, expect, it } from "vitest";
import { encodeWav, resampleMono, mergeAudioChunks } from "./audio";

describe("PCM WAV recording", () => {
  it("limits delayed capture chunks to exactly the configured duration", () => {
    const chunks = [new Float32Array([1, 2, 3]), new Float32Array([4, 5, 6])];
    expect(mergeAudioChunks(chunks, 4)).toEqual(new Float32Array([1, 2, 3, 4]));
    expect(mergeAudioChunks(chunks, 20)).toEqual(new Float32Array([1, 2, 3, 4, 5, 6]));
  });
  it("writes a mono PCM16 RIFF header and the real sample rate", async () => {
    const blob = encodeWav(new Float32Array([0, 0.5, -0.5]), 16000);
    const bytes = await blob.arrayBuffer();
    const view = new DataView(bytes);
    const text = (start: number, length: number) => new TextDecoder().decode(bytes.slice(start, start + length));
    expect(blob.type).toBe("audio/wav");
    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
    expect(text(12, 4)).toBe("fmt ");
    expect(view.getUint32(4, true)).toBe(bytes.byteLength - 8);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(28, true)).toBe(32000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(46, true)).toBe(16384);
    expect(view.getInt16(48, true)).toBe(-16384);
  });

  it("clamps samples instead of overflowing and rejects invalid sample values", async () => {
    const view = new DataView(await encodeWav(new Float32Array([-2, 2]), 48000).arrayBuffer());
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(() => encodeWav(new Float32Array([NaN]), 16000)).toThrow(/invalid/i);
    expect(() => encodeWav(new Float32Array([Infinity]), 16000)).toThrow(/invalid/i);
  });

  it("rejects empty or completely silent input and invalid output rates", () => {
    expect(() => encodeWav(new Float32Array(), 16000)).toThrow(/audio/i);
    expect(() => encodeWav(new Float32Array(100), 16000)).toThrow(/audio/i);
    for (const rate of [0, NaN, 48001, 16000.5]) {
      expect(() => encodeWav(new Float32Array([0.1]), rate)).toThrow(/rate/i);
    }
  });

  it("downsamples high-rate input with averaging and preserves duration", () => {
    const result = resampleMono(new Float32Array([0.2, 0.4, 0.6, -0.2, -0.4, -0.6]), 48000, 16000);
    expect(result.length).toBe(2);
    expect(result[0]).toBeCloseTo(0.4);
    expect(result[1]).toBeCloseTo(-0.4);
    const long = resampleMono(new Float32Array(44100).fill(0.25), 44100, 16000);
    expect(long.length).toBe(16000);
    expect(long[123]).toBeCloseTo(0.25);
  });

  it("returns independent same-rate samples and rejects unsupported upsampling", () => {
    const samples = new Float32Array([0.1, 0.2]);
    expect(resampleMono(samples, 16000, 16000)).toEqual(samples);
    expect(resampleMono(samples, 16000, 16000)).not.toBe(samples);
    expect(() => resampleMono(samples, 8000, 16000)).toThrow(/rate/i);
  });
});
