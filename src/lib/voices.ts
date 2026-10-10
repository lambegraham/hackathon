export const VOICES = [
  { id: 'marshall', name: 'Marshall', label: 'Marshall · male', gender: 'male', providerId: '2fVrabArxRdGtVgb' },
  { id: 'lainey', name: 'Lainey', label: 'Lainey · female', gender: 'female', providerId: 'cHM7Jx6qSF32itXw' }
] as const;
export type VoiceId = typeof VOICES[number]['id'];
