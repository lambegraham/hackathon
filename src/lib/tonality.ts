import type { Tonality, UserTone } from './contracts';
// Gradium has no per-request tone control: tonality is a property of the voice,
// shown as its `emotion` tag in Studio. Each tonality maps to a catalog en-US
// voice carrying that tag; override with GRADIUM_VOICE_<TONALITY> server-side.
export const TONALITIES: {
    id: Tonality;
    label: string;
    voiceName: string;
    voiceId: string;
    hint: string;
}[] = [
    { id: 'calm', label: 'Calm', voiceName: 'Holly', voiceId: '7c5UOKm7AiBgJADg', hint: 'slow, steady and even' },
    { id: 'reassuring', label: 'Reassuring', voiceName: 'Hadley', voiceId: 'bXwrkHhURL1VFJdG', hint: 'kind, settling and supportive' },
    { id: 'empathic', label: 'Empathic', voiceName: 'Drew', voiceId: '8lcIoEENCTHkwP3U', hint: 'warm and acknowledging feelings' },
    { id: 'friendly', label: 'Friendly', voiceName: 'Wendy', voiceId: 'OHbzRwvaEWAp8ncr', hint: 'welcoming and easy-going' },
    { id: 'confident', label: 'Confident', voiceName: 'Harrison', voiceId: 'IvU7qOuioP04a4eX', hint: 'direct, assured and professional' },
    { id: 'excited', label: 'Excited', voiceName: 'Quinn', voiceId: 'vtG8ddh4IN32Otad', hint: 'upbeat and energetic' },
    { id: 'neutral', label: 'Neutral', voiceName: 'Kelsey', voiceId: 'MQC0U1yWvZXrppaF', hint: 'balanced and matter-of-fact' }
];
export const USER_TONES: {
    id: UserTone;
    label: string;
}[] = [
    { id: 'confident', label: 'Confident' },
    { id: 'calm', label: 'Calm' },
    { id: 'enthusiastic', label: 'Enthusiastic' },
    { id: 'neutral', label: 'Neutral' },
    { id: 'hesitant', label: 'Hesitant' },
    { id: 'nervous', label: 'Nervous' },
    { id: 'defensive', label: 'Defensive' },
    { id: 'frustrated', label: 'Frustrated' },
    { id: 'upset', label: 'Upset' }
];
export const tonalityById = (id: Tonality) => TONALITIES.find(t => t.id === id)!;
export const userToneLabel = (id: UserTone) => USER_TONES.find(t => t.id === id)!.label;
