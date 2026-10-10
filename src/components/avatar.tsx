export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking';

export function Avatar({ state }: { state: AvatarState }) {
  return <div className={`avatar avatar-${state}`} aria-hidden="true">
    <svg viewBox="0 0 320 350" fill="none">
      <ellipse cx="160" cy="318" rx="104" ry="15" fill="#17243d" opacity=".09" />
      <path d="M60 307c5-71 39-103 100-103s95 32 100 103" fill="#254ee8" />
      <path d="m135 207 25 36 25-36" fill="#f7bf9e" />
      <path d="m126 219 34 24-20 28-34-39m88-13-34 24 20 28 34-39" fill="#fff" />
      <path d="M157 250h6l10 57h-26z" fill="#ffdb70" />
      <g className="avatar-head">
        <ellipse cx="88" cy="139" rx="13" ry="21" fill="#f7bf9e" />
        <ellipse cx="232" cy="139" rx="13" ry="21" fill="#f7bf9e" />
        <path d="M91 104c0-43 28-65 69-65s69 22 69 65v44c0 42-31 73-69 73s-69-31-69-73z" fill="#ffd0b1" />
        <path d="M88 120V87c0-47 36-65 75-65 40 0 70 23 70 64v29l-14-22c-27 3-47-10-62-24-13 21-33 30-55 31z" fill="#17243d" />
        <path d="m109 117 27-3m49 0 25 4" stroke="#17243d" strokeWidth="5" strokeLinecap="round" />
        <g className="avatar-eyes"><ellipse cx="124" cy="137" rx="5" ry="7" fill="#17243d" /><ellipse cx="196" cy="137" rx="5" ry="7" fill="#17243d" /></g>
        <path d="m158 143-5 20h12" stroke="#df997e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path className="avatar-mouth" d="M142 179q18 17 36 0" stroke="#17243d" strokeWidth="5" strokeLinecap="round" />
        <circle cx="111" cy="164" r="10" fill="#edaa92" opacity=".5" /><circle cx="209" cy="164" r="10" fill="#edaa92" opacity=".5" />
      </g>
    </svg>
  </div>;
}
