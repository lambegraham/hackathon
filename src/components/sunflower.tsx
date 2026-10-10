'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { UserTone } from '@/lib/contracts';
import { OutfitArt, type OutfitId } from './outfits';

export type FaceLook = { x: number; y: number };

/** Face box center in the camera frame, as -1..1 from the middle. */
export function faceLook(
  box: { x: number; y: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
): FaceLook {
  if (frameWidth <= 0 || frameHeight <= 0) return { x: 0, y: 0 };
  const cx = (box.x + box.width / 2) / frameWidth;
  const cy = (box.y + box.height / 2) / frameHeight;
  return {
    x: Math.max(-1, Math.min(1, (cx - 0.5) * 2)),
    y: Math.max(-1, Math.min(1, (cy - 0.5) * 2)),
  };
}

export const LENS_LOOK: FaceLook = { x: 0, y: 0 };

const LOOK_YAW = 7;
const LOOK_SHIFT_X = 14;
const LOOK_SHIFT_Y = 9;
const EYE_SHIFT_X = 6;
const EYE_SHIFT_Y = 4;

function headTransform(look: FaceLook) {
  return `translate(${(look.x * LOOK_SHIFT_X).toFixed(2)} ${(look.y * LOOK_SHIFT_Y).toFixed(2)}) rotate(${(look.x * LOOK_YAW).toFixed(2)} 200 200)`;
}

function eyeTransform(look: FaceLook) {
  return `translate(${(look.x * EYE_SHIFT_X).toFixed(2)} ${(look.y * EYE_SHIFT_Y).toFixed(2)})`;
}

export type FlowerState = 'idle' | 'listening' | 'thinking' | 'speaking';
export type FlowerMood = UserTone | 'happy';

type Eyes = 'dot' | 'wide' | 'closed' | 'up' | 'half';
type Face = { brows: [string, string]; eyes: Eyes; mouth: string; mouthFilled?: boolean; blush?: boolean; sweat?: boolean; tear?: boolean };

const BROW = {
  flat: ['M158 166h24', 'M218 166h24'],
  worried: ['M158 168l24-8', 'M218 160l24 8'],
  angry: ['M158 160l24 9', 'M218 169l24-9'],
  raised: ['M158 164q12-10 24 0', 'M218 164q12-10 24 0'],
  quizzical: ['M158 166h24', 'M218 162q12-10 24 0']
} satisfies Record<string, [string, string]>;

// Faces are drawn around the flower centre (200, 200).
const FACES: Record<FlowerMood, Face> = {
  happy: { brows: BROW.raised, eyes: 'dot', mouth: 'M180 220q20 20 40 0', blush: true },
  confident: { brows: BROW.flat, eyes: 'half', mouth: 'M182 222q22 14 38-6' },
  calm: { brows: BROW.flat, eyes: 'closed', mouth: 'M184 222q16 12 32 0', blush: true },
  enthusiastic: { brows: BROW.raised, eyes: 'wide', mouth: 'M176 216q24 34 48 0z', mouthFilled: true, blush: true },
  neutral: { brows: BROW.flat, eyes: 'dot', mouth: 'M186 226h28' },
  hesitant: { brows: BROW.quizzical, eyes: 'dot', mouth: 'M184 228q5-5 10 0t10 0t10 0' },
  nervous: { brows: BROW.worried, eyes: 'wide', mouth: 'M180 228q5-6 10 0t10 0t10 0t10 0', sweat: true },
  defensive: { brows: BROW.angry, eyes: 'half', mouth: 'M188 230q12-7 24 0' },
  frustrated: { brows: BROW.angry, eyes: 'dot', mouth: 'M182 234q18-16 36 0' },
  upset: { brows: BROW.worried, eyes: 'dot', mouth: 'M184 234q16-14 32 0', tear: true }
};

const PETALS = Array.from({ length: 16 }, (_, index) => index * 22.5);

function Eye({ x, kind }: { x: number; kind: Eyes }) {
  if (kind === 'closed') return <path d={`M${x - 11} 190q11-11 22 0`} className="face-line" />;
  const ry = kind === 'wide' ? 13 : kind === 'half' ? 6 : 10;
  const dx = kind === 'up' ? -3 : 0, dy = kind === 'up' ? -5 : 0;
  return <g>
    <ellipse cx={x} cy={190} rx={kind === 'wide' ? 10 : 8} ry={ry} fill="#2b1a10" />
    <circle cx={x + 3 + dx} cy={186 + dy - (kind === 'half' ? -2 : 0)} r={kind === 'half' ? 2 : 3.2} fill="#fff" />
    {kind === 'half' && <path d={`M${x - 10} 186h20`} stroke="#5a3418" strokeWidth="5" strokeLinecap="round" />}
  </g>;
}

export function Sunflower({ state, mood, outfit, lookAt, frame = 'full' }: { state: FlowerState; mood: FlowerMood; outfit?: OutfitId; lookAt?: RefObject<FaceLook | null>; frame?: 'full' | 'chest' }) {
  const gazeRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const targetRef = useRef(lookAt);
  targetRef.current = lookAt;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const current = { x: 0, y: 0 };
    let frame = 0;
    let last = performance.now();
    const apply = (look: FaceLook) => {
      gazeRef.current?.setAttribute('transform', headTransform(look));
      eyesRef.current?.setAttribute('transform', eyeTransform(look));
    };
    const tick = (now: number) => {
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      const reduced = media.matches;
      const aim = reduced ? LENS_LOOK : (targetRef.current?.current ?? LENS_LOOK);
      if (reduced) {
        current.x = 0;
        current.y = 0;
      } else {
        const follow = 1 - Math.exp(-8 * delta);
        current.x += (aim.x - current.x) * follow;
        current.y += (aim.y - current.y) * follow;
        if (Math.hypot(aim.x - current.x, aim.y - current.y) < 0.004) {
          current.x = aim.x;
          current.y = aim.y;
        }
      }
      apply(current);
      frame = requestAnimationFrame(tick);
    };
    apply(LENS_LOOK);
    frame = requestAnimationFrame(tick);
    const onChange = () => { if (media.matches) apply(LENS_LOOK); };
    media.addEventListener('change', onChange);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener('change', onChange);
    };
  }, []);

  const base = FACES[mood];
  const face: Face = state === 'listening'
    ? { ...base, brows: BROW.raised, eyes: 'wide', mouth: 'M200 219a8 10 0 1 0 .1 0z', mouthFilled: true }
    : state === 'thinking' ? { ...base, brows: BROW.quizzical, eyes: 'up', mouth: 'M190 228q8 4 18-2', sweat: false, tear: false } : base;
  const label = state === 'listening' ? 'listening' : state === 'thinking' ? 'thinking' : mood === 'happy' ? 'happy to see you' : `looking ${mood}`;
  return <div className={`flower flower-${state}`} data-mood={mood} data-outfit={outfit}>
    <svg viewBox={frame === 'chest' ? '28 0 344 458' : '0 0 400 600'} role="img" aria-label={`Sunflower ${label}`}>
      <defs>
        <radialGradient id="petal" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#fff3a6" /><stop offset=".45" stopColor="#ffd23f" /><stop offset="1" stopColor="#f0a414" /></radialGradient>
        <radialGradient id="petal-back" cx="40%" cy="30%" r="80%"><stop offset="0" stopColor="#ffd75e" /><stop offset="1" stopColor="#e08a0b" /></radialGradient>
        <radialGradient id="disc" cx="38%" cy="32%" r="75%"><stop offset="0" stopColor="#c98a4b" /><stop offset=".55" stopColor="#8a5226" /><stop offset="1" stopColor="#5a3418" /></radialGradient>
        <linearGradient id="stem" x1="0" x2="1"><stop offset="0" stopColor="#8fbf6a" /><stop offset=".5" stopColor="#6ea64d" /><stop offset="1" stopColor="#4f8a3a" /></linearGradient>
        <radialGradient id="leaf" cx="30%" cy="30%" r="90%"><stop offset="0" stopColor="#b5dc8e" /><stop offset="1" stopColor="#5b9842" /></radialGradient>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#4a5a3a" floodOpacity=".25" /></filter>
      </defs>
      <g className="flower-stem">
        <path d="M200 300C196 400 214 480 204 600" stroke="url(#stem)" strokeWidth="22" strokeLinecap="round" fill="none" />
        <path d="M202 450c40-58 102-62 126-40-28 34-78 52-126 40z" fill="url(#leaf)" filter="url(#soft)" />
        <path d="M205 510c-36-50-96-58-122-38 26 32 74 50 122 38z" fill="url(#leaf)" filter="url(#soft)" />
      </g>
      <g className="flower-head" filter="url(#soft)">
        <g ref={gazeRef} className="flower-gaze">
        <g className="petals petals-back">{PETALS.map(angle => <ellipse key={angle} cx="200" cy="96" rx="30" ry="64" fill="url(#petal-back)" transform={`rotate(${angle + 11.25} 200 200)`} />)}</g>
        <g className="petals petals-front">{PETALS.map(angle => <ellipse key={angle} cx="200" cy="104" rx="28" ry="58" fill="url(#petal)" transform={`rotate(${angle} 200 200)`} />)}</g>
        <circle cx="200" cy="200" r="84" fill="url(#disc)" />
        <circle cx="178" cy="172" r="40" fill="#fff" opacity=".08" />
        <g className="face" key={`${state}-${mood}`}>
          {face.blush && <><ellipse cx="160" cy="214" rx="13" ry="8" fill="#ff8a7a" opacity=".55" /><ellipse cx="240" cy="214" rx="13" ry="8" fill="#ff8a7a" opacity=".55" /></>}
          <path d={face.brows[0]} className="face-line" /><path d={face.brows[1]} className="face-line" />
          <g ref={eyesRef}><g className="eyes"><Eye x={170} kind={face.eyes} /><Eye x={230} kind={face.eyes} /></g></g>
          {state === 'speaking'
            ? <ellipse className="talking-mouth" cx="200" cy="226" rx="15" ry="11" fill="#2b1a10" />
            : <path d={face.mouth} className="face-line" fill={face.mouthFilled ? '#2b1a10' : 'none'} />}
          {face.sweat && <path d="M252 150q8 12 0 18a6 6 0 0 1-8-6q2-6 8-12z" fill="#9fd4ff" stroke="#5aa6e0" strokeWidth="1.5" />}
          {face.tear && <path d="M166 204q7 11 0 16a5 5 0 0 1-7-5q2-5 7-11z" fill="#9fd4ff" stroke="#5aa6e0" strokeWidth="1.5" />}
        </g>
        {outfit && <g className="outfit" key={outfit}><OutfitArt id={outfit} /></g>}
        </g>
      </g>
    </svg>
  </div>;
}
