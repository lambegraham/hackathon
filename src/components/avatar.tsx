export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking';

export function Avatar({
  state,
  gender = 'male',
  scenario = 'interview'
}: {
  state: AvatarState;
  gender?: 'male' | 'female';
  scenario?: string;
}) {
  const isFormal = scenario === 'interview' || scenario === 'raise';
  const avatarSrc = gender === 'male' ? '/avatars/marshall.png' : '/avatars/lainey.jpg';

  return (
    <div
      className={`avatar avatar-${state} avatar-${gender} avatar-${isFormal ? 'formal' : 'chill'}`}
      aria-hidden="true"
    >
      <div className="avatar-frame">
        {/* Ambient aura glow behind the portrait */}
        <div className="avatar-ambient-glow" />

        {/* Dynamic pulse ripples for listening/speaking */}
        {(state === 'listening' || state === 'speaking') && (
          <div className="avatar-ripple-ring" />
        )}

        {/* High-res character portrait */}
        <div className="avatar-image-container">
          <img
            src={avatarSrc}
            alt=""
            className="avatar-photo"
          />
          {/* Subtle gradient overlay at base */}
          <div className="avatar-fade-bottom" />
        </div>
      </div>
    </div>
  );
}
