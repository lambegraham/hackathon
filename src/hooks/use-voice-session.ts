"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { encodeWav, mergeAudioChunks, resampleMono } from "@/lib/audio";
import { createManualTranscript } from "@/lib/manual-transcript";
import { drainAudioWorklet } from "@/lib/session-audio";

const MAX_SECONDS = 60;
const WORKLET_SOURCE = `
class MonoRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(1024);
    this.offset = 0; this.finished = false;
    this.port.onmessage = (event) => {
      if (event.data?.type !== 'drain') return;
      this.finished = true;
      if (this.offset) this.port.postMessage(this.buffer.slice(0, this.offset));
      this.offset = 0; this.port.postMessage({ type: 'drained' });
    };
  }
  process(inputs) {
    if (this.finished) return true;
    const channels = inputs[0];
    if (channels && channels.length) {
      const mono = new Float32Array(channels[0].length);
      for (let i = 0; i < mono.length; i++) {
        for (let c = 0; c < channels.length; c++) mono[i] += channels[c][i] / channels.length;
      }
      for (let i = 0; i < mono.length; i++) {
        this.buffer[this.offset++] = mono[i];
        if (this.offset === this.buffer.length) {
          this.port.postMessage(this.buffer, [this.buffer.buffer]);
          this.buffer = new Float32Array(1024);
          this.offset = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('mono-recorder', MonoRecorder);
`;

type Capture = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: AudioWorkletNode | null;
  muted: GainNode | null;
  timer: ReturnType<typeof setTimeout> | null;
  draining: Promise<void> | null;
};

function releaseCapture(capture: Capture | null) {
  if (!capture) return;
  if (capture.timer) clearTimeout(capture.timer);
  if (capture.processor) {
    capture.processor.port.onmessage = null;
    capture.processor.onprocessorerror = null;
    capture.processor.disconnect();
  }
  capture.source.disconnect();
  capture.muted?.disconnect();
  capture.stream.getTracks().forEach((track) => track.stop());
  void capture.context.close().catch(() => undefined);
}

export function useVoiceSession() {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveTranscriptError, setLiveTranscriptError] = useState<string | null>(null);
  const transcriptRef = useRef<ReturnType<typeof createManualTranscript> | null>(null);
  const captureRef = useRef<Capture | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(16000);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const activeRef = useRef(false);

  const cancelRecording = useCallback(() => {
    generationRef.current++;
    transcriptRef.current?.stop();
    transcriptRef.current = null;
    releaseCapture(captureRef.current);
    captureRef.current = null;
    chunksRef.current = [];
    activeRef.current = false;
    if (mountedRef.current) setIsRecording(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelRecording();
    };
  }, [cancelRecording]);

  const startRecording = useCallback(async (onTranscript?: (text: string) => void, onAudio?: (samples: Float32Array, sampleRate: number) => void) => {
    cancelRecording();
    setError(null);
    setLiveTranscriptError(null);
    const generation = generationRef.current;
    let pendingStream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access requires HTTPS or localhost.");
      pendingStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false });
      if (generation !== generationRef.current || !mountedRef.current) {
        pendingStream.getTracks().forEach((track) => track.stop());
        return;
      }
      const context = new AudioContext();
      const capture: Capture = {
        stream: pendingStream, context, source: context.createMediaStreamSource(pendingStream),
        processor: null, muted: null, timer: null, draining: null,
      };
      captureRef.current = capture;
      sampleRateRef.current = context.sampleRate;
      const moduleUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
      try { await context.audioWorklet.addModule(moduleUrl); }
      finally { URL.revokeObjectURL(moduleUrl); }
      if (generation !== generationRef.current || !mountedRef.current) return;
      capture.processor = new AudioWorkletNode(context, "mono-recorder");
      capture.processor.onprocessorerror = () => {
        if (generation !== generationRef.current || !mountedRef.current) return;
        cancelRecording();
        setError("Audio capture failed. Please try recording again.");
      };
      capture.muted = context.createGain();
      capture.muted.gain.value = 0;
      capture.processor.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (generation !== generationRef.current) return;
        chunksRef.current = [...chunksRef.current, event.data];
        transcriptRef.current?.push(event.data);
        onAudio?.(event.data, context.sampleRate);
      };
      capture.source.connect(capture.processor);
      capture.processor.connect(capture.muted);
      capture.muted.connect(context.destination);
      await context.resume();
      if (generation !== generationRef.current || !mountedRef.current) return;
      activeRef.current = true;
      setIsRecording(true);
      if (onTranscript) {
        const transcript = createManualTranscript({
          onTranscript: (text) => {
            if (generation === generationRef.current && mountedRef.current) onTranscript(text);
          },
          onError: (message) => {
            if (generation === generationRef.current && mountedRef.current) setLiveTranscriptError(message);
          },
        });
        transcriptRef.current = transcript;
        void transcript.start(context.sampleRate);
      }
      capture.timer = setTimeout(() => {
        if (!capture.processor) return;
        capture.draining ??= drainAudioWorklet(capture.processor);
        let finishMessage = "60-second limit reached. Finish to send your answer.";
        void capture.draining.catch((cause) => {
          finishMessage = cause instanceof Error ? cause.message : "Unable to finish audio capture.";
        }).finally(() => {
          if (generation !== generationRef.current) return;
          transcriptRef.current?.stop(); transcriptRef.current = null;
          releaseCapture(captureRef.current); captureRef.current = null;
          if (mountedRef.current) setError(finishMessage);
        });
      }, MAX_SECONDS * 1000);
    } catch (cause) {
      pendingStream?.getTracks().forEach((track) => track.stop());
      if (generation !== generationRef.current || !mountedRef.current) return;
      cancelRecording();
      const message = cause instanceof Error ? cause.message : "Unable to access your microphone.";
      setError(message);
      throw new Error(message);
    }
  }, [cancelRecording]);

  const stopRecording = useCallback(async (): Promise<Blob> => {
    if (!activeRef.current) throw new Error("Start recording before finishing your answer.");
    const generation = generationRef.current;
    const capture = captureRef.current;
    try {
      if (capture?.processor) {
        capture.draining ??= drainAudioWorklet(capture.processor);
        await capture.draining;
      }
    } catch (cause) {
      if (generation === generationRef.current) cancelRecording();
      throw cause;
    }
    if (generation !== generationRef.current) throw new Error("Recording was cancelled.");
    const chunks = chunksRef.current;
    const rate = sampleRateRef.current;
    cancelRecording();
    try {
      const samples = mergeAudioChunks(chunks, rate * MAX_SECONDS);
      const wav = encodeWav(resampleMono(samples, rate, Math.min(rate, 16000)), Math.min(rate, 16000));
      if (mountedRef.current) setError(null);
      return wav;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to encode your recording.";
      if (mountedRef.current) setError(message);
      throw new Error(message);
    }
  }, [cancelRecording]);

  return { isRecording, error, liveTranscriptError, startRecording, stopRecording, cancelRecording };
}
