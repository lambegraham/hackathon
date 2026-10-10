# Conversation Coach

Practise the conversations that matter before having them for real. Choose a scenario, talk to a sunflower that senses your tone and adapts its voice, and finish with two strengths, two improvements and a better way to phrase your response.

Built from the [Notion hackathon plan](https://app.notion.com/p/3f5d67cd0a05805b8023c53570998144). The wardrobe offers five scenarios, each an outfit for the sunflower: job interview (suit & tie), relationship breakup (handbag & pearls), flatmate talk (beanie & mug), cold call (headset & badge) and bazaar negotiation, where you hold your price as the seller (sun hat & price tag). The API also keeps `raise`, `feedback` and `custom`.

## Run locally

Use Node.js 22.21 or newer. Install with `npm ci`, copy `.env.example` to `.env.local`, then set `GEMINI_API_KEY` and `GRADIUM_API_KEY`. Run `npm run dev` and open http://127.0.0.1:3000.

Keys stay on the server. The page reports missing provider configuration; it does not substitute canned responses. Conversation defaults to `gemini-3.5-flash-lite` and feedback to `gemini-3.8-flash`. Override them with `GEMINI_CONVERSATION_MODEL` and `GEMINI_FEEDBACK_MODEL`; `GEMINI_MODEL` remains the fallback for either role. `GRADIUM_VOICE_ID` defaults to the voice in Gradium's REST example; replace it with your Studio voice if needed. Google Cloud credits and Gemini API billing may differ: use credentials for the endpoint your event account provides.

## Gradium hackathon setup

The [hackathon guide](https://mesquite-pyrite-bca.notion.site/redeem-coupon) funds the voice integration already wired into this app: recorded answer → Gradium Speech-to-Text → Gemini reply → Gradium Text-to-Speech → spoken counterpart. The coupon is redeemed in your Gradium account; it is not an application API or a source of conversation facts.

1. Get the event's private redemption link from the organizer and redeem it in [Gradium Studio](https://studio.gradium.ai/), using the same email as your hackathon registration.
2. Confirm the credited balance in [Billing](https://studio.gradium.ai/platform/billing), then create a key in [API Keys](https://studio.gradium.ai/platform/api-keys).
3. Set `GRADIUM_API_KEY` in the project's ignored `.env.local` file and restart `npm run dev`. Keep the coupon and key out of the repository and browser code.
4. With the app running at `http://127.0.0.1:3000`, run `npm run check:gradium`. If Next chooses a different port, set `APP_URL`, for example `APP_URL=http://127.0.0.1:3001 npm run check:gradium`. This makes one short, credit-consuming synthesis call and transcribes that generated audio through our real app routes. It sends a fixed test sentence, not your conversations, and prints no credentials.

For a distinctive counterpart, use [Voice Design](https://studio.gradium.ai/voices/design) to create and save a synthetic voice, then put its permanent `voice_id` in `GRADIUM_VOICE_ID` and restart the app. The existing catalog voice works without this step. Example description: “A calm English-speaking hiring manager, clear diction, measured pace, warm but professional.”

For the submission, identify the features as Gradium REST STT and TTS, include the selected voice ID, and explain the flow above. TTS currently omits `model_name`, so Gradium chooses its production default; see the [TTS guide](https://docs.gradium.ai/guides/text-to-speech-rest). Coupon redemption, available balance and actual provider access must be checked in your account. The voice check confirms the API path; also try a microphone turn to check recording and playback.

## Demo

The page opens with a short “Got credits? :)” intro, then a sunflower in the rehearsal studio. The Aura visualizer sits behind the sunflower; focus and full-stage controls adjust the layout. Pick an outfit from **The wardrobe** (click a hanger, use the arrows, or ←/→ on the rail), for example **Bazaar negotiation**, and start practising. Give three short answers using the microphone or typed input. End the session to get feedback, then try again using the suggested phrasing.

The microphone uses push-to-talk: click to record, then finish your turn. Audio is encoded as actual mono PCM WAV, not WebM relabelled as WAV. Audio goes to Gradium; the transcript goes to Gemini; Gemini's reply goes to Gradium for spoken output. A typed turn skips transcription. The sunflower’s face mirrors the detected feeling and has listening, thinking and talking states.

## Voice tonality

Each turn, Gemini classifies the tone of the wording of your latest message (`confident`, `calm`, `enthusiastic`, `neutral`, `hesitant`, `nervous`, `defensive`, `frustrated`, `upset`) and picks a tonality for its reply. The page states both in bold, for example “I’m sensing you feel nervous, so I’m adapting a reassuring tone. Hadley is here to train you.” The UI always uses `auto`; the API still accepts a fixed `tonality`, which the server enforces. Tone is judged from words only; Gradium STT returns text, not prosody.

Gradium TTS has no tone parameter: tonality is a property of the voice (its `emotion` tag in Studio). Each tonality maps to a catalog en-US voice in `src/lib/tonality.ts`: calm (Holly), reassuring (Hadley), empathic (Drew), friendly (Wendy), confident (Harrison), excited (Quinn), neutral (Kelsey). Override any of them with `GRADIUM_VOICE_<TONALITY>`, for example `GRADIUM_VOICE_CALM`. The studio defaults to **Automatic tone**. Selecting Marshall or Lainey explicitly overrides the tone-based voice; tone classification and the sunflower’s expression still update. Speech without a tonality or voice selection uses `GRADIUM_VOICE_ID`. Replies stream mono 48 kHz PCM16 into Web Audio as chunks arrive. Reset cancels the request and queued playback; speech errors leave the written reply available.

Conversation turns use minimal thinking on `gemini-3.5-flash-lite` and low thinking on `gemini-3.8-flash`; other model overrides retain their default settings. Gemini 3 thinking tokens count against `maxOutputTokens`; at the default level a short turn could spend its 500-token budget thinking and return truncated JSON.

## Architecture and ownership

| Area | Files | Team responsibility |
| --- | --- | --- |
| Rehearsal UI | `src/components/`, `src/app/` | Intro, sunflower, tone sentence, feedback |
| Microphone | `src/hooks/`, `src/lib/audio.ts` | WAV capture and resource cleanup |
| Conversation | `src/lib/server/`, `src/app/api/converse/` | Gemini prompts and full history |
| Voice services | `src/app/api/transcribe/`, `src/app/api/speak/` | Gradium STT/TTS |
| Reliability | `src/**/*.test.ts`, `e2e/` | Contract, failure and browser checks |

The five-person team can own UI, microphone/voice, conversation/feedback, integration/deployment, and demo/testing separately. All use the shared contracts in `src/lib/contracts.ts`.

## API contracts

| Route | Request | Response |
| --- | --- | --- |
| `GET /api/status` | None | Provider key presence booleans; never keys |
| `POST /api/transcribe` | Raw `audio/wav` | `{ text }` |
| `POST /api/converse` | Session and message history | `{ reply, userTone, tonality }` |
| `POST /api/speak` | `{ text, tonality?, voiceId?, format? }` | WAV by default; `format: "pcm"` streams `audio/pcm` with `X-Audio-Sample-Rate: 48000` |
| `POST /api/feedback` | Session and message history | `{ summary, strengths, improvements, suggestedResponse }` |

Session input: `scenarioId`, `difficulty`, optional `customScenario`, optional `tonality` (`auto` by default), and `messages` containing `role` (`user` or `assistant`) and `content`. Scenario IDs: `interview`, `raise`, `relationship`, `feedback`, `flatmate`, `coldcall`, `bazaar`, `custom`. Difficulties: `friendly`, `neutral`, `challenging`. Failures return `{ error }` with a non-200 status.

Transcripts live in browser memory only. The app does not save recordings, accounts or sessions. Feedback concerns the words spoken; it does not diagnose personality or mood. Provider retention policies still apply.

Requests are bounded to 64 KiB JSON, 40 messages, 4,000 characters per message and 24,000 characters total. Custom scenarios allow 1,500 characters; speech synthesis accepts 2,000. Recordings allow 60 seconds and 12 MiB, with provider calls limited to 25 seconds. The process-local limit is 60 POST requests per minute across all users; it is a demo safeguard, not a distributed production limiter. Deploying multiple replicas or opening the app publicly needs an appropriate access and usage policy.

## Validation

`npm test` runs unit and API integration tests with mocked providers. `npm run test:coverage` reports service and audio coverage. `npm run typecheck`, `npm run lint` and `npm run build` check the app. Install the test browser with `npx playwright install chromium`, then run `npm run test:e2e` for the browser flow. Mocked tests do not prove real credentials, quotas, microphone hardware or provider latency; validate those with a live three-turn rehearsal.

### Build evidence — 10 October 2026

The plan's journeys map to WAV encoding tests, mocked provider-route tests, and browser rehearsal tests. API and audio implementation used failing tests before implementation. A later browser regression reproduced the pending-microphone bug: `waiting for microphone permission cannot overlap a typed turn` failed because the composer was enabled. Locking microphone startup made that same test pass while reset remained available.

| Guarantee | Check | Result |
| --- | --- | --- |
| Genuine PCM WAV, downsampling, bounded duration | `src/lib/audio.test.ts` | 6 tests pass |
| Full history, provider contracts, model selection, feedback shape, invalid inputs, safe failures | `src/lib/server/routes.test.ts` | 18 tests pass |
| Three-turn rehearsal, audio playback, feedback, reset, missing setup, speech failures, mobile layout, microphone startup race | `e2e/coach.spec.ts` | 7 tests pass |
| Type safety, lint, production compilation | `npm run typecheck`, `npm run lint`, `npm run build` | Pass |

`npm run test:coverage`: 95.16% statements and 91.12% branches in the instrumented service/audio scope. UI and recorder lifecycle are exercised by browser tests, not included in that percentage. `npm audit` after dependency setup and the final production-only audit reported zero vulnerabilities. Reviewer found no remaining blocking issue after the microphone fix. Live provider calls remain unverified because credentials were not configured. The worklet may omit the final partial 1,024-sample batch (up to about 21 ms at 48 kHz) when recording stops.

### Model upgrade verification — 10 October 2026

The requested upgrade replaces Gemini 2.5 Flash with `gemini-3.8-flash` for conversation and feedback while preserving `GEMINI_MODEL` overrides. The parameterized API regression first failed with `expected 'gemini-2.5-flash' to be 'gemini-3.8-flash'`, then passed after the change (`npm test -- src/lib/server/routes.test.ts`: 18 passed). `npm run test:coverage`: 24 passed, 95.16% statements and 91.12% branches in the instrumented service/audio scope. Typecheck and lint pass. A synthetic live SDK request using the local configuration returned text with finish reason `STOP`; this confirms model access, not a full voice rehearsal or live structured feedback. No checkpoint commits were created.

## Provider references

- [Google GenAI SDK / Gemini](https://ai.google.dev/gemini-api/docs/generate-content)
- [Gradium STT REST](https://docs.gradium.ai/guides/speech-to-text-rest): raw WAV upload, NDJSON text segments
- [Gradium TTS REST](https://docs.gradium.ai/guides/text-to-speech-rest): WAV output with `only_audio: true`

Dependencies: Next.js, React, TypeScript, Tailwind CSS, Lucide icons, Google GenAI, Zod. Validation: Vitest, Playwright, ESLint. The sunflower is an original SVG in `src/components/sunflower.tsx`; fonts are Bricolage Grotesque and Inter Tight via `next/font`.
