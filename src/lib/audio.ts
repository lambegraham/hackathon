/** Merge capture buffers, enforcing a sample-level cap even if a timer fires late. */
export function mergeAudioChunks(chunks: readonly Float32Array[], maxSamples: number): Float32Array {
  const total = Math.min(maxSamples, chunks.reduce((length, chunk) => length + chunk.length, 0));
  const samples = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = total - offset;
    if (remaining <= 0) break;
    const included = chunk.subarray(0, remaining);
    samples.set(included, offset);
    offset += included.length;
  }
  return samples;
}

/** Average source samples over each output interval to downsample mono audio. */
export function resampleMono(samples: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (!Number.isInteger(sourceRate) || !Number.isInteger(targetRate) || targetRate < 1 || sourceRate < targetRate) {
    throw new Error("Invalid audio sample rate.");
  }
  if (sourceRate === targetRate) return samples.slice();
  const ratio = sourceRate / targetRate;
  return Float32Array.from({ length: Math.floor(samples.length / ratio) }, (_, index) => {
    const start = index * ratio;
    const end = (index + 1) * ratio;
    let sum = 0;
    for (let position = Math.floor(start); position < Math.ceil(end); position++) {
      const weight = Math.min(end, position + 1) - Math.max(start, position);
      sum += samples[position] * weight;
    }
    return sum / ratio;
  });
}

/** Encode real mono little-endian signed PCM16, not a renamed browser container. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  if (!Number.isInteger(sampleRate) || sampleRate < 1 || sampleRate > 48000) {
    throw new Error("Invalid audio sample rate.");
  }
  if (samples.some((sample) => !Number.isFinite(sample))) throw new Error("Invalid audio samples.");
  if (!samples.length || samples.every((sample) => sample === 0)) {
    throw new Error("No audio captured. Check your microphone and try again.");
  }
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeText(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true);
  });
  return new Blob([bytes], { type: "audio/wav" });
}
