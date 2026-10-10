export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking';

export function Avatar({
  state,
  gender = 'male',
  scenario = 'interview',
  difficulty = 'neutral'
}: {
  state: AvatarState;
  gender?: 'male' | 'female';
  scenario?: string;
  difficulty?: 'friendly' | 'neutral' | 'challenging';
}) {
  const isFormal = scenario === 'interview' || scenario === 'raise';

  // Path 1 (Base organic wave ring)
  const path1 = "M 250.0 150.0 C 254.5 158.6, 262.3 171.2, 260.1 179.5 C 257.9 187.8, 244.8 194.8, 236.6 200.0 C 228.4 205.2, 216.9 204.7, 210.8 210.8 C 204.7 216.9, 205.2 228.4, 200.0 236.6 C 194.8 244.8, 187.8 257.9, 179.5 260.1 C 171.2 262.3, 158.6 254.5, 150.0 250.0 C 141.4 245.5, 136.1 235.3, 127.7 233.1 C 119.4 230.8, 109.7 237.0, 100.0 236.6 C 90.3 236.2, 75.5 236.7, 69.4 230.6 C 63.3 224.5, 63.8 209.7, 63.4 200.0 C 63.0 190.3, 69.2 180.6, 66.9 172.3 C 64.7 163.9, 54.5 158.6, 50.0 150.0 C 45.5 141.4, 37.7 128.8, 39.9 120.5 C 42.1 112.2, 55.2 105.2, 63.4 100.0 C 71.6 94.8, 83.1 95.3, 89.2 89.2 C 95.3 83.1, 94.8 71.6, 100.0 63.4 C 105.2 55.2, 112.2 42.1, 120.5 39.9 C 128.8 37.7, 141.4 45.5, 150.0 50.0 C 158.6 54.5, 163.9 64.7, 172.3 66.9 C 180.6 69.2, 190.3 63.0, 200.0 63.4 C 209.7 63.8, 224.5 63.3, 230.6 69.4 C 236.7 75.5, 236.2 90.3, 236.6 100.0 C 237.0 109.7, 230.8 119.4, 233.1 127.7 C 235.3 136.1, 245.5 141.4, 250.0 150.0 Z";

  // Path 2 (Offset counter-wave ring)
  const path2 = "M 258.7 150.0 C 262.7 158.6, 262.7 171.3, 257.8 178.9 C 252.8 186.5, 237.9 191.3, 229.1 195.7 C 220.3 200.0, 210.7 199.6, 205.2 205.2 C 199.6 210.7, 200.0 220.3, 195.7 229.1 C 191.3 237.9, 186.5 252.8, 178.9 257.8 C 171.3 262.7, 158.6 262.7, 150.0 258.7 C 141.4 254.8, 134.0 240.8, 127.5 234.0 C 120.9 227.3, 118.3 220.8, 110.7 218.1 C 103.1 215.4, 91.9 219.8, 82.1 217.9 C 72.3 216.0, 57.4 213.5, 51.8 206.7 C 46.2 199.9, 46.1 186.6, 48.6 177.2 C 51.1 167.7, 62.8 158.0, 66.7 150.0 C 70.7 142.0, 73.0 137.6, 72.3 129.2 C 71.7 120.8, 63.3 109.6, 62.8 99.7 C 62.3 89.7, 63.2 75.5, 69.4 69.4 C 75.5 63.2, 89.7 62.3, 99.7 62.8 C 109.6 63.3, 120.8 71.7, 129.2 72.3 C 137.6 73.0, 142.0 70.7, 150.0 66.7 C 158.0 62.8, 167.7 51.1, 177.2 48.6 C 186.6 46.1, 199.9 46.2, 206.7 51.8 C 213.5 57.4, 216.0 72.3, 217.9 82.1 C 219.8 91.9, 215.4 103.1, 218.1 110.7 C 220.8 118.3, 227.3 120.9, 234.0 127.5 C 240.8 134.0, 254.8 141.4, 258.7 150.0 Z";

  // Path 3 (Harmonic ripple ring)
  const path3 = "M 264.0 150.0 C 264.0 158.7, 253.2 168.3, 248.0 176.2 C 242.7 184.2, 235.8 189.0, 232.6 197.7 C 229.3 206.4, 233.2 220.8, 228.5 228.5 C 223.9 236.3, 213.5 242.3, 204.5 244.4 C 195.5 246.5, 183.5 239.5, 174.4 241.1 C 165.3 242.7, 159.0 250.9, 150.0 254.0 C 141.0 257.1, 128.8 262.8, 120.6 259.8 C 112.3 256.7, 107.0 242.6, 100.5 235.7 C 94.0 228.9, 89.5 223.4, 81.5 218.5 C 73.4 213.6, 58.2 213.2, 52.4 206.3 C 46.7 199.5, 46.4 187.0, 47.0 177.6 C 47.6 168.2, 56.0 159.2, 56.0 150.0 C 56.0 140.8, 47.6 131.8, 47.0 122.4 C 46.4 113.0, 46.7 100.5, 52.4 93.7 C 58.2 86.8, 73.4 86.4, 81.5 81.5 C 89.5 76.6, 94.0 71.1, 100.5 64.3 C 107.0 57.4, 112.3 43.3, 120.6 40.2 C 128.8 37.2, 141.0 42.9, 150.0 46.0 C 159.0 49.1, 165.3 57.3, 174.4 58.9 C 183.5 60.5, 195.5 53.5, 204.5 55.6 C 213.5 57.7, 223.9 63.7, 228.5 71.5 C 233.2 79.2, 229.3 93.6, 232.6 102.3 C 235.8 111.0, 242.7 115.8, 248.0 123.8 C 253.2 131.7, 264.0 141.3, 264.0 150.0 Z";

  return (
    <div
      className={`avatar avatar-${state} avatar-${gender} avatar-mood-${difficulty} avatar-${isFormal ? 'formal' : 'chill'}`}
      aria-hidden="true"
    >
      <div className="halo-container">
        {/* Soft atmospheric backlight */}
        <div className="halo-atmospheric-glow" />

        <svg viewBox="0 0 300 300" className="halo-svg" fill="none">
          <defs>
            {/* Neutral Gradient: Electric Azure & Soft Cyan (Matches user reference image) */}
            <linearGradient id="halo-neutral-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
            <linearGradient id="halo-neutral-grad-2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0ea5e9" />
              <stop offset="50%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>

            {/* Friendly Gradient: Warm Emerald & Luminous Aqua */}
            <linearGradient id="halo-friendly-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="50%" stopColor="#059669" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
            <linearGradient id="halo-friendly-grad-2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>

            {/* Challenging Gradient: Fiery Crimson & Electric Rose */}
            <linearGradient id="halo-challenging-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="50%" stopColor="#e11d48" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
            <linearGradient id="halo-challenging-grad-2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#f43f5e" />
            </linearGradient>

            {/* Core Glow Filter */}
            <filter id="halo-glow-filter" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="7" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Central Ambient Resonance Core */}
          <circle cx="150" cy="150" r="70" className="halo-core" />

          {/* Wave Layer 1 (Clockwise fluid ribbon) */}
          <path
            d={path1}
            className="halo-wave-1"
            filter="url(#halo-glow-filter)"
          />

          {/* Wave Layer 2 (Counter-clockwise offset ribbon) */}
          <path
            d={path2}
            className="halo-wave-2"
            filter="url(#halo-glow-filter)"
          />

          {/* Wave Layer 3 (High frequency harmonic perimeter) */}
          <path
            d={path3}
            className="halo-wave-3"
          />
        </svg>

        {/* Outer subtle particle wave pulse */}
        <div className="halo-pulse-ring" />
      </div>
    </div>
  );
}
