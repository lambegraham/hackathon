import type { ScenarioId } from '@/lib/contracts';

export type OutfitId = Extract<ScenarioId, 'interview' | 'relationship' | 'flatmate' | 'coldcall' | 'bazaar'>;

// One outfit per wardrobe scenario. `crop` is the viewBox that frames the
// outfit's key piece, so the same art doubles as the hanger icon.
export const OUTFITS: { id: OutfitId; wear: string; crop: string }[] = [
  { id: 'interview', wear: 'Suit & tie', crop: '128 352 144 104' },
  { id: 'relationship', wear: 'Handbag & pearls', crop: '282 398 72 76' },
  { id: 'flatmate', wear: 'Cosy beanie & mug', crop: '108 -16 184 132' },
  { id: 'coldcall', wear: 'Headset & badge', crop: '60 64 280 196' },
  { id: 'bazaar', wear: 'Sun hat & price tag', crop: '16 -36 368 144' }
];

// Drawn in the sunflower's coordinates: head centre (200, 200), petals to
// radius ~168, stem below y 368, leaves near y 450 (right) and 510 (left).
export function OutfitArt({ id }: { id: OutfitId }) {
  switch (id) {
    case 'interview': return <g>
      <path d="M144 374q56-26 112 0l12 72q-68 18-136 0z" fill="#27375a" />
      <path d="M178 368l22 50 22-50z" fill="#fff" />
      <path d="M178 368l22 50-30-22zm44 0l-22 50 30-22z" fill="#1b2742" />
      <path d="M193 368h14l-3 10h-8z" fill="#b8282f" />
      <path d="M196 378h8l6 40-10 12-10-12z" fill="#d6373e" />
      <circle cx="200" cy="434" r="3" fill="#0f1a30" /><circle cx="200" cy="446" r="3" fill="#0f1a30" />
      <path d="M232 392h16" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    </g>;
    case 'relationship': return <g>
      {Array.from({ length: 11 }, (_, i) => { const t = i / 10, x = 152 + 96 * t, y = 336 + 36 * Math.sin(Math.PI * t); return <circle key={i} cx={x} cy={y} r="6.5" fill="#fbf6ee" stroke="#d9cbb5" strokeWidth="1.2" />; })}
      <circle cx="108" cy="230" r="7" fill="#fbf6ee" stroke="#d9cbb5" /><circle cx="292" cy="230" r="7" fill="#fbf6ee" stroke="#d9cbb5" />
      <path d="M302 420q14-26 28 0" stroke="#7a2f4f" strokeWidth="5" fill="none" strokeLinecap="round" />
      <rect x="290" y="418" width="52" height="40" rx="12" fill="#e9668f" />
      <path d="M290 432h52" stroke="#c94a72" strokeWidth="3" />
      <rect x="310" y="427" width="12" height="10" rx="3" fill="#f6c453" />
    </g>;
    case 'flatmate': return <g>
      <path d="M124 88q76-120 152 0z" fill="#e2574c" />
      <path d="M150 40l8 46m26-62 4 60m30-60-2 60m30-48-8 48" stroke="#c8443a" strokeWidth="5" strokeLinecap="round" />
      <path d="M116 92q84-44 168 0l-4 22q-80-40-160 0z" fill="#c8443a" />
      <circle cx="200" cy="6" r="18" fill="#fff3e0" />
      <rect x="54" y="438" width="38" height="36" rx="7" fill="#7cb9e8" />
      <path d="M54 446h38" stroke="#5c9bd0" strokeWidth="4" />
      <path d="M92 446q14 6 0 20" stroke="#7cb9e8" strokeWidth="6" fill="none" />
      <path d="M64 428q-6-8 0-16m12 16q-6-8 0-16" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".9" />
    </g>;
    case 'coldcall': return <g>
      <path d="M90 196q0-128 110-128t110 128" stroke="#2f2f3a" strokeWidth="11" fill="none" strokeLinecap="round" />
      <rect x="72" y="168" width="28" height="56" rx="12" fill="#2f2f3a" />
      <rect x="300" y="168" width="28" height="56" rx="12" fill="#2f2f3a" />
      <path d="M314 222q4 34-46 40" stroke="#2f2f3a" strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="264" cy="262" r="8" fill="#ef6b4a" />
      <path d="M172 366l28 62 28-62" stroke="#3a6ff0" strokeWidth="6" fill="none" strokeLinejoin="round" />
      <rect x="184" y="424" width="32" height="40" rx="5" fill="#fff" stroke="#c9d3ea" strokeWidth="2" />
      <rect x="184" y="424" width="32" height="11" rx="5" fill="#3a6ff0" />
      <path d="M191 446h18m-18 8h12" stroke="#9aa6c2" strokeWidth="3" strokeLinecap="round" />
    </g>;
    case 'bazaar': return <g>
      <ellipse cx="200" cy="74" rx="176" ry="32" fill="#e3b866" />
      <path d="M128 74q72-112 144 0z" fill="#efcf8a" />
      <path d="M134 62q66-24 132 0l2 12q-68-22-136 0z" fill="#d6463f" />
      <path d="M60 78q140 20 280 0" stroke="#c99a45" strokeWidth="3" fill="none" opacity=".6" />
      <path d="M314 404l6 14" stroke="#8a6a3a" strokeWidth="2.5" />
      <path d="M304 418h34l10 14-10 14h-34z" fill="#fff4dc" stroke="#c99a45" strokeWidth="2" />
      <circle cx="312" cy="432" r="3" fill="#c99a45" />
      <text x="330" y="438" textAnchor="middle" fontSize="15" fontWeight="800" fill="#7a5520">€</text>
    </g>;
  }
}
