'use client';

import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

const CAST = [
  { name: 'Nova', url: '/avatars/nova.vrm', blinkOffset: 0.2 },
  { name: 'Kai', url: '/avatars/kai.vrm', blinkOffset: 1.4 },
  { name: 'Sky', url: '/avatars/sky.vrm', blinkOffset: 2.5 },
  { name: 'Ember', url: '/avatars/ember.vrm', blinkOffset: 3.6 },
] as const;

const BLINK_CYCLE = 4.6;
const MOUTH_ATTACK = 18;
const MOUTH_RELEASE = 6;
const SILENCE_GATE = 0.018;
const SPEECH_SPAN = 0.14;

type LookMode = 'mouse' | 'face' | 'forward';

type FaceBox = { x: number; y: number; width: number; height: number };

type FaceDetectorInstance = {
  detect: (input: CanvasImageSource) => Promise<Array<{ boundingBox: FaceBox }>>;
};

type FaceDetectorCtor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorInstance;

type AudioTap = {
  context: AudioContext;
  stream: MediaStream;
  analyser: AnalyserNode;
  buffer: Uint8Array<ArrayBuffer>;
};

function blinkValue(seconds: number, offset: number) {
  const t = (seconds + offset) % BLINK_CYCLE;
  const close = 0.055;
  const hold = 0.04;
  const open = 0.07;
  if (t < close) return t / close;
  if (t < close + hold) return 1;
  if (t < close + hold + open) return 1 - (t - close - hold) / open;
  return 0;
}

function rmsLevel(samples: Uint8Array) {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = ((samples[i] ?? 128) - 128) / 128;
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / samples.length);
  if (rms <= SILENCE_GATE) return 0;
  return Math.min(1, (rms - SILENCE_GATE) / SPEECH_SPAN);
}

function asVrm(value: unknown): VRM | null {
  if (!value || typeof value !== 'object') return null;
  if (!('scene' in value) || !('meta' in value) || !('humanoid' in value)) return null;
  return value as VRM;
}

function frameChestUp(camera: THREE.Camera, vrm: VRM) {
  if (!(camera instanceof THREE.PerspectiveCamera)) return;
  const head = vrm.humanoid.getNormalizedBoneNode('head');
  const chest =
    vrm.humanoid.getNormalizedBoneNode('upperChest') ??
    vrm.humanoid.getNormalizedBoneNode('chest') ??
    vrm.humanoid.getNormalizedBoneNode('spine');
  if (!head) return;
  const headPos = new THREE.Vector3();
  const chestPos = new THREE.Vector3();
  head.getWorldPosition(headPos);
  if (chest) chest.getWorldPosition(chestPos);
  else chestPos.set(headPos.x, headPos.y - 0.22, headPos.z);
  const top = headPos.y + 0.18;
  const bottom = Math.min(chestPos.y, headPos.y - 0.12) - 0.02;
  const focusY = (top + bottom) / 2;
  const height = Math.max(0.48, top - bottom);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distance = (height / 2) / Math.tan(fov / 2);
  const frontZ = Math.max(headPos.z, chestPos.z);
  camera.position.set(headPos.x, focusY, frontZ + distance * 1.12);
  camera.near = 0.05;
  camera.far = 20;
  camera.lookAt(headPos.x, focusY, headPos.z);
  camera.updateProjectionMatrix();
}

function AvatarModel({
  url,
  blinkOffset,
  mouth,
  look,
  onReady,
  onError,
}: {
  url: string;
  blinkOffset: number;
  mouth: RefObject<number>;
  look: RefObject<{ x: number; y: number }>;
  onReady: () => void;
  onError: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  const lookTarget = useRef(new THREE.Object3D());
  const smoothed = useRef({ x: 0, y: 0 });
  const headPos = useRef(new THREE.Vector3());
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    let alive = true;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.loadAsync(url).then((gltf) => {
      const vrm = asVrm(gltf.userData.vrm);
      if (!alive) {
        if (vrm) VRMUtils.deepDispose(vrm.scene);
        return;
      }
      if (!vrm) {
        onError();
        return;
      }
      if (vrm.meta.metaVersion === '0') VRMUtils.rotateVRM0(vrm);
      vrm.scene.traverse((obj) => {
        obj.frustumCulled = false;
      });
      group.current?.add(vrm.scene);
      vrm.scene.updateMatrixWorld(true);
      frameChestUp(camera, vrm);
      if (vrm.lookAt) vrm.lookAt.target = lookTarget.current;
      vrmRef.current = vrm;
      onReady();
    }).catch(() => {
      if (alive) onError();
    });

    return () => {
      alive = false;
      const vrm = vrmRef.current;
      vrmRef.current = null;
      if (vrm) VRMUtils.deepDispose(vrm.scene);
    };
  }, [camera, onError, onReady, url]);

  useFrame((_, delta) => {
    const vrm = vrmRef.current;
    if (!vrm) return;
    const step = Math.min(delta, 0.05);
    const open = mouth.current ?? 0;
    const aim = look.current ?? { x: 0, y: 0 };
    const follow = 1 - Math.exp(-12 * step);
    smoothed.current.x += (THREE.MathUtils.clamp(aim.x, -1, 1) - smoothed.current.x) * follow;
    smoothed.current.y += (THREE.MathUtils.clamp(aim.y, -1, 1) - smoothed.current.y) * follow;
    vrm.expressionManager?.setValue('blink', blinkValue(performance.now() / 1000, blinkOffset));
    vrm.expressionManager?.setValue('aa', open);

    const head = vrm.humanoid.getNormalizedBoneNode('head');
    if (head && vrm.lookAt) {
      head.getWorldPosition(headPos.current);
      lookTarget.current.position.set(
        headPos.current.x + smoothed.current.x * 0.18,
        headPos.current.y + smoothed.current.y * 0.08,
        headPos.current.z + 1.1,
      );
    }
    vrm.update(step);
  });

  return <group ref={group} />;
}

function AvatarCard({
  person,
  mouth,
  look,
}: {
  person: (typeof CAST)[number];
  mouth: RefObject<number>;
  look: RefObject<{ x: number; y: number }>;
}) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const onReady = useCallback(() => setPhase('ready'), []);
  const onError = useCallback(() => setPhase('error'), []);

  return (
    <figure className="preview-card">
      <div className="preview-frame">
        {phase === 'error' ? (
          <p className="preview-miss">{person.name}</p>
        ) : (
          <Canvas
            dpr={[1, 1.5]}
            camera={{ position: [0, 1.35, 1.15], fov: 26, near: 0.05, far: 20 }}
            gl={{ antialias: true, alpha: false }}
            onCreated={({ gl }) => {
              gl.setClearColor('#f6f8fc');
            }}
          >
            <ambientLight intensity={0.7} />
            <directionalLight position={[0.6, 1.4, 1.2]} intensity={1.15} />
            <AvatarModel
              url={person.url}
              blinkOffset={person.blinkOffset}
              mouth={mouth}
              look={look}
              onReady={onReady}
              onError={onError}
            />
          </Canvas>
        )}
      </div>
      <figcaption>{person.name}</figcaption>
    </figure>
  );
}

export function PreviewStage() {
  const mouth = useRef(0);
  const look = useRef({ x: 0, y: 0 });
  const mouse = useRef({ x: 0, y: 0 });
  const mode = useRef<LookMode>('mouse');
  const live = useRef(false);
  const audioRef = useRef<AudioTap | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const stopFaceLoop = useRef<(() => void) | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      mouse.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      const audio = audioRef.current;
      if (live.current && audio) {
        audio.analyser.getByteTimeDomainData(audio.buffer);
        const target = rmsLevel(audio.buffer);
        const rate = target > mouth.current ? MOUTH_ATTACK : MOUTH_RELEASE;
        const next = mouth.current + (target - mouth.current) * (1 - Math.exp(-rate * delta));
        mouth.current = target === 0 && next < 0.012 ? 0 : next;
      } else {
        mouth.current = 0;
      }
      if (mode.current === 'mouse') {
        look.current.x = mouse.current.x;
        look.current.y = mouse.current.y;
      } else if (mode.current === 'forward') {
        look.current.x = 0;
        look.current.y = 0;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    return () => {
      live.current = false;
      stopFaceLoop.current?.();
      audioRef.current?.stream.getTracks().forEach((track) => track.stop());
      void audioRef.current?.context.close();
      cameraStream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function stopMic() {
    live.current = false;
    mouth.current = 0;
    const audio = audioRef.current;
    audioRef.current = null;
    audio?.stream.getTracks().forEach((track) => track.stop());
    void audio?.context.close();
    setMicOn(false);
  }

  async function startMic() {
    setNote(null);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const context = new AudioContext();
      if (context.state === 'suspended') await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.2;
      context.createMediaStreamSource(stream).connect(analyser);
      audioRef.current = {
        context,
        stream,
        analyser,
        buffer: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
      };
      live.current = true;
      setMicOn(true);
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      stopMic();
      setNote('Microphone permission was blocked.');
    }
  }

  function stopCamera() {
    stopFaceLoop.current?.();
    stopFaceLoop.current = null;
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    mode.current = 'mouse';
    setCameraOn(false);
  }

  async function startCamera() {
    setNote(null);
    const video = videoRef.current;
    if (!video) return;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
      });
      video.srcObject = stream;
      await video.play();
      cameraStream.current = stream;
      const Detector = (window as Window & { FaceDetector?: FaceDetectorCtor }).FaceDetector;
      if (!Detector) {
        mode.current = 'forward';
        setCameraOn(true);
        return;
      }
      const detector = new Detector({ fastMode: true, maxDetectedFaces: 1 });
      let stopped = false;
      stopFaceLoop.current = () => {
        stopped = true;
      };
      const loop = async () => {
        if (stopped) return;
        try {
          if (video.videoWidth > 0) {
            const faces = await detector.detect(video);
            const face = faces[0];
            if (!face) {
              mode.current = 'forward';
            } else {
              const box = face.boundingBox;
              const cx = (box.x + box.width / 2) / video.videoWidth;
              const cy = (box.y + box.height / 2) / video.videoHeight;
              mode.current = 'face';
              look.current.x = -(cx - 0.5) * 2;
              look.current.y = -(cy - 0.5) * 2;
            }
          }
        } catch {
          mode.current = 'forward';
        }
        if (!stopped) window.setTimeout(() => void loop(), 90);
      };
      void loop();
      setCameraOn(true);
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      stopCamera();
      setNote('Camera permission was blocked.');
    }
  }

  return (
    <>
      <div className="preview-actions">
        <button type="button" onClick={() => (micOn ? stopMic() : void startMic())} aria-pressed={micOn}>
          {micOn ? 'Stop microphone' : 'Start microphone'}
        </button>
        <button
          type="button"
          className="preview-secondary"
          onClick={() => (cameraOn ? stopCamera() : void startCamera())}
          aria-pressed={cameraOn}
        >
          {cameraOn ? 'Stop camera' : 'Use camera'}
        </button>
      </div>
      {note ? <p className="preview-note">{note}</p> : null}
      <video ref={videoRef} className="preview-video" playsInline muted />
      <div className="preview-grid">
        {CAST.map((person) => (
          <AvatarCard key={person.name} person={person} mouth={mouth} look={look} />
        ))}
      </div>
    </>
  );
}
