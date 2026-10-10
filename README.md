# Conversation Coach

Practise the conversations that matter before having them for real. Choose a scenario and difficulty, speak to an animated counterpart, and finish with two strengths, two improvements and a better way to phrase your response.

Built from the [Notion hackathon plan](https://app.notion.com/p/3f5d67cd0a05805b8023c53570998144). Scenarios: job interview, salary negotiation, relationship conversation, difficult feedback, and a custom scenario.

## Run locally

Use Node.js 22.21 or newer. Install with `npm ci`, copy `.env.example` to `.env.local`, then set `GEMINI_API_KEY` and `GRADIUM_API_KEY`. Run `npm run dev` and open http://127.0.0.1:3000.

Keys stay on the server. The page reports missing provider configuration; it does not substitute canned responses. `GEMINI_MODEL` defaults to `gemini-3.8-flash` for both conversation and feedback. Set it to a model available to your event account. `GRADIUM_VOICE_ID` defaults to the voice in Gradium's REST example; replace it with your Studio voice if needed. Google Cloud credits and Gemini API billing may differ: use credentials for the endpoint your event account provides.

## Demo

Select **Ask for a raise**, set the difficulty, and start practice. Give three short answers using the microphone or typed input. End the session to get feedback, then try again using the suggested phrasing.

The microphone uses push-to-talk: click to record, then finish your turn. Audio is encoded as actual mono PCM WAV, not WebM relabelled as WAV. Audio goes to Gradium; the transcript goes to Gemini; Gemini's reply goes to Gradium for spoken output. A typed turn skips transcription. The avatar has idle, listening, thinking and speaking states.

## Architecture and ownership

| Area | Files | Team responsibility |
| --- | --- | --- |
| Rehearsal UI | `src/components/`, `src/app/` | Scenarios, avatar, transcript, feedback |
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
| `POST /api/converse` | Session and message history | `{ reply }` |
| `POST /api/speak` | `{ text }` | `audio/wav` bytes |
| `POST /api/feedback` | Session and message history | `{ summary, strengths, improvements, suggestedResponse }` |

Session input: `scenarioId`, `difficulty`, optional `customScenario`, and `messages` containing `role` (`user` or `assistant`) and `content`. Scenario IDs: `interview`, `raise`, `relationship`, `feedback`, `custom`. Difficulties: `friendly`, `neutral`, `challenging`. Failures return `{ error }` with a non-200 status.

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

Dependencies: Next.js, React, TypeScript, Tailwind CSS, Lucide icons, Google GenAI, Zod. Validation: Vitest, Playwright, ESLint. The avatar is an original SVG implemented in the app.
