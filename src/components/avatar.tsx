export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking';

export function Avatar({ state, gender = 'male' }: { state: AvatarState; gender?: 'male' | 'female' }) {
  return <div className={`avatar avatar-${state} avatar-${gender}`} aria-hidden="true">
    <svg viewBox="0 0 320 350" fill="none">
      <ellipse cx="160" cy="318" rx="104" ry="15" fill="#17243d" opacity=".09" />
      {gender === 'female' && <path d="M83 116c-5-67 26-94 78-94s81 28 78 94l9 112H73z" fill="#38263e" />}
      <path d="M60 307c5-71 39-103 100-103s95 32 100 103" fill="#254ee8" />
      <path d="m135 207 25 36 25-36" fill="#f7bf9e" />
      <path d="m126 219 34 24-20 28-34-39m88-13-34 24 20 28 34-39" fill="#fff" />
      {gender === 'male' ? <path d="M157 250h6l10 57h-26z" fill="#ffdb70" /> : <path d="m148 245 12 15 12-15" stroke="#ffdb70" strokeWidth="4" />}
      <g className="avatar-head">
        <ellipse cx="88" cy="139" rx="13" ry="21" fill="#f7bf9e" />
        <ellipse cx="232" cy="139" rx="13" ry="21" fill="#f7bf9e" />
        <path d="M91 104c0-43 28-65 69-65s69 22 69 65v44c0 42-31 73-69 73s-69-31-69-73z" fill="#ffd0b1" />
        {gender === 'male' ? <path d="M88 120V87c0-47 36-65 75-65 40 0 70 23 70 64v29l-14-22c-27 3-47-10-62-24-13 21-33 30-55 31z" fill="#17243d" /> : <path d="M87 125V89c0-46 34-68 74-68s72 23 72 68v42l-18-38c-24 0-42-8-55-25-14 27-37 38-58 37z" fill="#38263e" />}
        <path d="m109 117 27-3m49 0 25 4" stroke="#17243d" strokeWidth="5" strokeLinecap="round" />
        <g className="avatar-eyes"><ellipse cx="124" cy="137" rx="5" ry="7" fill="#17243d" /><ellipse cx="196" cy="137" rx="5" ry="7" fill="#17243d" /></g>
        <path d="m158 143-5 20h12" stroke="#df997e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path className="avatar-mouth" d="M142 179q18 17 36 0" stroke="#17243d" strokeWidth="5" strokeLinecap="round" />
        <circle cx="111" cy="164" r="10" fill="#edaa92" opacity=".5" /><circle cx="209" cy="164" r="10" fill="#edaa92" opacity=".5" />
      </g>
    </svg>
  </div>;
}
