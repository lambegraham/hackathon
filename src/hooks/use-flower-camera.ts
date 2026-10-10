'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { faceLook, LENS_LOOK, type FaceLook } from '@/components/sunflower';

type FaceBox = { x: number; y: number; width: number; height: number };

type FaceDetectorInstance = {
  detect: (input: CanvasImageSource) => Promise<Array<{ boundingBox: FaceBox }>>;
};

type FaceDetectorCtor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorInstance;

export function useFlowerCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopLoop = useRef<(() => void) | null>(null);
  const lookAt = useRef<FaceLook | null>(null);
  const epoch = useRef(0);
  const [on, setOn] = useState(false);
  const [note, setNote] = useState('');

  const stop = useCallback(() => {
    epoch.current += 1;
    stopLoop.current?.();
    stopLoop.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    lookAt.current = null;
    setOn(false);
  }, []);

  const start = useCallback(async () => {
    const session = epoch.current + 1;
    epoch.current = session;
    setNote('');
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
      });
      if (session !== epoch.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      if (session !== epoch.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      const Detector = (window as Window & { FaceDetector?: FaceDetectorCtor }).FaceDetector;
      if (!Detector) {
        lookAt.current = LENS_LOOK;
        setOn(true);
        return;
      }
      const detector = new Detector({ fastMode: true, maxDetectedFaces: 1 });
      let stopped = false;
      stopLoop.current = () => { stopped = true; };
      const loop = async () => {
        if (stopped) return;
        try {
          if (video.videoWidth > 0) {
            const faces = await detector.detect(video);
            if (stopped) return;
            const face = faces[0];
            lookAt.current = face
              ? faceLook(face.boundingBox, video.videoWidth, video.videoHeight)
              : LENS_LOOK;
          }
        } catch {
          lookAt.current = LENS_LOOK;
        }
        if (!stopped) window.setTimeout(() => void loop(), 90);
      };
      void loop();
      setOn(true);
    } catch {
      stream?.getTracks().forEach(track => track.stop());
      if (session !== epoch.current) return;
      stop();
      setNote('Camera permission was blocked.');
    }
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, lookAt, on, note, start, stop };
}
