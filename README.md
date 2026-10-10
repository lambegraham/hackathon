# Conversation Coach

Practise the conversations that matter before having them for real. Choose a scenario and difficulty, speak to an animated counterpart, and finish with two strengths, two improvements and a better way to phrase your response.

Built from the [Notion hackathon plan](https://app.notion.com/p/3f5d67cd0a05805b8023c53570998144). Scenarios: job interview, salary negotiation, relationship conversation, difficult feedback, and a custom scenario.

## Run locally

Use Node.js 22.21 or newer. Install with `npm ci`, copy `.env.example` to `.env.local`, then set `GEMINI_API_KEY` and `GRADIUM_API_KEY`. Run `npm run dev` and open http://127.0.0.1:3000.

Keys stay on the server. The page reports missing provider configuration; it does not substitute canned responses. Conversational turns default to `gemini-3.5-flash-lite`; feedback defaults to `gemini-3.1-pro-preview`. Set `GEMINI_CONVERSATION_MODEL` and `GEMINI_FEEDBACK_MODEL` to override them independently. A legacy `GEMINI_MODEL` setting remains the fallback for either role when its specific setting is absent. The studio defaults to Automatic tone, with optional Marshall or Lainey voice overrides. `GRADIUM_VOICE_ID` remains the fallback for API calls that omit a voice choice. Google Cloud credits and Gemini API billing may differ: use credentials for the endpoint your event account provides.

## Gradium hackathon setup

The [hackathon guide](https://mesquite-pyrite-bca.notion.site/redeem-coupon) funds the voice integration already wired into this app: continuous microphone → Gradium streaming Speech-to-Text → Gemini reply → Gradium streamed Text-to-Speech → spoken counterpart. The coupon is redeemed in your Gradium account; it is not an application API or a source of conversation facts.

1. Get the event's private redemption link from the organizer and redeem it in [Gradium Studio](https://studio.gradium.ai/), using the same email as your hackathon registration.
2. Confirm the credited balance in [Billing](https://studio.gradium.ai/platform/billing), then create a key in [API Keys](https://studio.gradium.ai/platform/api-keys).
3. Set `GRADIUM_API_KEY` in the project's ignored `.env.local` file and restart `npm run dev`. Keep the coupon and key out of the repository and browser code.
4. With the app running at `http://127.0.0.1:3000`, run `npm run check:gradium`. If Next chooses a different port, set `APP_URL`, for example `APP_URL=http://127.0.0.1:3001 npm run check:gradium`. This makes one short, credit-consuming synthesis call and transcribes that generated audio through our real app routes. It sends a fixed test sentence, not your conversations, and prints no credentials.

For a distinctive counterpart, use [Voice Design](https://studio.gradium.ai/voices/design) to create and save a synthetic voice. Add its permanent `voice_id` to the server-approved choices in `src/lib/voices.ts` to expose it in the studio; `GRADIUM_VOICE_ID` sets the fallback for API calls without a selection. Example description: “A calm English-speaking hiring manager, clear diction, measured pace, warm but professional.”

For the submission, identify the features as Gradium WebSocket STT and streamed REST TTS, include the selected voice ID, and explain the flow above. TTS currently omits `model_name`, so Gradium chooses its production default; see the [TTS guide](https://docs.gradium.ai/guides/text-to-speech-rest). Coupon redemption, available balance and actual provider access must be checked in your account. The voice check confirms the API path; also try a microphone turn to check recording and playback.

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
| Rehearsal UI | `src/components/`, `src/app/` | Scenarios, avatar, transcript, feedback |
| Microphone | `src/hooks/`, `src/lib/audio.ts`, `src/lib/duplex-session.ts` | Continuous PCM capture, turn detection, WAV fallback and cleanup |
| Conversation | `src/lib/server/`, `src/app/api/converse/` | Gemini prompts and full history |
| Voice services | `src/app/api/transcribe/`, `src/app/api/speak/` | Gradium STT/TTS |
| Reliability | `src/**/*.test.ts`, `e2e/` | Contract, failure and browser checks |

The five-person team can own UI, microphone/voice, conversation/feedback, integration/deployment, and demo/testing separately. All use the shared contracts in `src/lib/contracts.ts`.

## API contracts

| Route | Request | Response |
| --- | --- | --- |
| `GET /api/status` | None | Provider key presence booleans; never keys |
| `POST /api/voice-token` | None, localhost only | Single-use short-lived `{ token, expires_at }` for browser STT WebSocket |
| `POST /api/transcribe` | Raw `audio/wav` | `{ text, speech }`, where `speech` contains original Gradium segments and any available segment timing |
| `POST /api/analyse-audio` | Raw PCM16 mono 16 kHz WAV, up to 60 seconds | `{ model, transcript, fillers: [{ word, startSeconds, endSeconds }] }` from Gemini verbatim audio transcription |
| `POST /api/converse` | Session and message history | `{ reply, userTone, tonality }` |
| `POST /api/speak` | `{ text, tonality?, voiceId?, format? }` | WAV by default; `format: "pcm"` streams `audio/pcm` with `X-Audio-Sample-Rate: 48000` |
| `POST /api/feedback` | Session and message history | `{ summary, strengths, improvements, suggestedResponse, assessment }`; each assessment dimension contains `{ score, evidence, action }` |

Session input: `scenarioId`, `difficulty`, optional `customScenario`, optional `tonality` (`auto` by default), and `messages` containing `role` (`user` or `assistant`) and `content`. Scenario IDs: `interview`, `raise`, `relationship`, `feedback`, `flatmate`, `coldcall`, `bazaar`, `custom`. Difficulties: `friendly`, `neutral`, `challenging`. Failures return `{ error }` with a non-200 status.

Speech voice IDs are `marshall` and `lainey`, mapped to verified public Gradium catalogue IDs on the server. Speech format accepts `wav` or `pcm`. PCM streaming failures after response headers close the stream; the client retains the transcript and shows a speech error. Reset cancels the request and queued playback.

Completed sessions save their transcript, feedback and recorded-voice analysis in a browser-local profile. Microphone recordings are stored in IndexedDB, linked to that session; the app does not create accounts. Ending a session sends recorded audio to Gemini for verbatim transcription and filler timestamps. Feedback concerns the conversation; it does not diagnose personality or mood. Provider retention policies still apply.

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

## Voice latency verification — 10 October 2026

Both public catalogue choices were verified with real Gradium requests. Through the app's PCM endpoint, the first bytes arrived in 81–226 ms, while each short test phrase finished downloading in 748–879 ms. Browser tests prove playback starts before stream EOF, the selected voice matches the name/avatar, and browser audio failure preserves the typed conversation. These are short synthetic checks, not a latency guarantee for every session.

A three-scenario Gemini benchmark used the same conversation instructions and 400-token cap for each variant. Original `gemini-3.8-flash` settings took 3.96–5.48 seconds and two replies hit `MAX_TOKENS` while spending most of the budget on reasoning. Low-thinking 3.8 took 1.37–1.98 seconds; minimal-thinking `gemini-3.5-flash-lite` took 0.66–1.15 seconds. All reduced-thinking replies finished with `STOP` and stayed in character in this small sample. Longer-session quality still needs human assessment. Streaming speech does not yet overlap Gemini text generation.

After enabling role-specific models in the local environment, a synthetic interview turn through `/api/converse` returned a complete reply in 1.01 seconds. Verification for the voice/model changes: 64 unit/API tests and 11 browser tests pass; lint and typecheck pass. Scope review found no blockers. Webpack production compilation is used here because Turbopack has a local worker port-binding issue; no compiler configuration was changed.

## Duplex verification — 10 October 2026

Continuous capture, acknowledged turn boundaries, interruption during response generation and playback, two-turn history, permission cancellation, and stop/reset/feedback cleanup have focused coverage. All 108 unit/API tests and 16 browser tests pass. Instrumented service/audio coverage is 94.73% statements and 87.92% branches; lint, typecheck and the Webpack production build pass. A real short-lived token connected to Gradium STT at 24 kHz with seven-frame delay and acknowledged flushes. A synthetic spoken sentence streamed through that connection was correctly transcribed. Physical microphone echo cancellation and room acoustics still need a headset/speaker rehearsal.

## Report/profile verification — 10 October 2026

All 130 unit/API tests and 21 browser tests pass. Instrumented service/audio/profile coverage is 95.27% statements and 88.34% branches; lint and typecheck pass. Browser tests cover two-session improvement/decline comparisons, persistence after reload, quota retry without duplication, corrupt-profile recovery, cancelled feedback preventing stale saves, and mobile graph layout. A real synthetic browser conversation through Gemini and Gradium generated a report with all four scores and exact user quotes, saved it locally, and reopened it after reload. Feedback sends the completed transcript as labelled dialogue data inside a user request, because Gemini rejects requests ending with a model turn; conversation generation still uses role-separated history.

## Provider references

- [Google GenAI SDK / Gemini](https://ai.google.dev/gemini-api/docs/generate-content)
- [Gemini thinking levels](https://ai.google.dev/gemini-api/docs/thinking)
- [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [Gradium browser WebSockets](https://docs.gradium.ai/guides/browser-websockets): single-use tokens and continuous STT
- [Gradium STT REST](https://docs.gradium.ai/guides/speech-to-text-rest): raw WAV upload, NDJSON text segments
- [Gradium TTS REST](https://docs.gradium.ai/guides/text-to-speech-rest): WAV output with `only_audio: true`

Dependencies: Next.js, React, TypeScript, Tailwind CSS, Lucide icons, Google GenAI, Zod. Validation: Vitest, Playwright, ESLint. The sunflower is an original SVG; Aura sits behind it. The wardrobe selects outfits/scenarios, while the Conversation selector retains every existing scenario. Live voice, local profiles, saved reports and speech tracking remain available.


## Interview coach verification — 10 October 2026

The dedicated interview-coach-v1 prompt evaluates each original user answer, uses contextual STAR and ownership/outcome evidence, and compares only a matching prior session. Its indexed evidence bank supplies verbatim snippets; the server still rejects altered quotes, invented indexes, duplicate reviews and invalid baseline IDs. A structural provider schema avoids Gemini rejection from tuple/constraint-heavy JSON schemas while full runtime validation remains strict. Reports use Pro Preview with medium thinking; live replies retain Flash-Lite.

TDD evidence: new route/quote-bank tests failed before implementation; 47 route tests now pass. The profile target-role regression failed on persistence before implementation and now passes. Browser regressions first failed on missing context/rich report UI; a drill-opening regression caught a generic greeting instead of the reviewed question and now passes. Final verification: 139 unit/API tests and 23 browser tests pass, with 95.31% instrumented statements and 88.84% branches. Lint, typecheck, diff whitespace checks and the Webpack production build pass. Webpack was selected for local verification, keeping the default build script unchanged.

A real two-answer synthetic Pro report passed exact-evidence validation in 22.47 seconds. An isolated browser run then generated a real Pro report, saved both its coaching and progress into a test local profile, reloaded and reopened the answer heatmap. No synthetic data was inserted into the user's browser profile. Existing reports remain readable; old and new scoring rubrics may differ, so use source evidence alongside chart estimates.


## Streaming chat transcript — 10 October 2026

Both Start live voice and Record your answer display accumulating Gradium text in one temporary chat bubble. The transcript follows each update; only the completed answer enters Gemini history and saved reports. Manual recording streams the existing microphone frames through a short-lived-token sidecar, aggregated into 80 ms PCM frames, while retaining its WAV transcription as the final source. A preview connection failure leaves the recording usable and shows a nonfatal status. Preview connections, pending tokens, timers and late callbacks are cleaned up on finish, cancel, reset and recording timeout.

TDD: manual streaming/browser regressions failed before integration and now pass; 19 focused sidecar tests cover frame order, sample rates, bounded startup buffering, incremental words, cancellation and failure fallback. A real synthetic Gradium speech check produced nine incremental text updates at 48 kHz through the new sidecar. Partial final words can remain buffered until further audio; the manual mode's final WAV pass supplies the completed message.

Final streaming verification: 158 unit/API tests and 25 browser tests pass; instrumented coverage 95.45% statements / 88.65% branches. Lint, typecheck, whitespace checks and Webpack production build pass.

## Raw recognised speech and delivery tracking — 10 October 2026

Live voice and recorded answers retain recognised fillers, repetitions, punctuation and whitespace. Original Gradium text segments and available `start_s` / `stop_s` boundaries are saved with each voice answer in the local profile; Gemini requests receive only the dialogue text. The report counts explicit fillers and adjacent repeated words, lists possible speech habits separately, compares filler frequency against the previous matching conversation, and shows measured gaps between consecutive segments with known boundaries. Original recognised segments remain inspectable. Typed answers and older reports show tracking as unavailable.

These are recognised-text statistics, not acoustic tone or personality measurements. Punctuation comes from the recogniser, segment boundaries do not guarantee exact word timings or every pause, and missing timestamps are never invented. Gradium's documented transcription settings do not expose a verbatim mode. A real synthetic TTS→STT check returned repeated words and segment timestamps but omitted the requested `um` / `uh`; that round-trip cannot distinguish synthesis omissions from recognition omissions. The application preserves everything returned, but cannot guarantee all spoken fillers without a separate audio-analysis path. Audio is not persisted to the profile.

TDD regressions cover raw text and timing through capture, validation, profile storage, report rendering and reload, plus empty provider events. Verification: 175 unit/API tests and 26 browser tests pass; lint, typecheck, whitespace checks and the Webpack production build pass.


## Profile growth and recurring feedback — 10 October 2026

New reports include up to eight structured observations: a named coaching theme, strength or improvement, an exact user quote, detailed explanation and a concrete next action. The server rejects fabricated evidence and duplicate topic/kind pairs. Existing reports remain readable without observations. Recurring themes appear only when the current report and at least one earlier comparable report support the same theme and kind. Comparisons retain scenario, difficulty, target role and custom-description boundaries; older reports without theme reviews are excluded from recurrence counts. Each pattern links to supporting reports. These are coaching observations, not claims about personality or hiring outcomes.

The profile and session report include keyboard-operable skill filters and session selection, evidence details, score tables, and reduced-motion-aware chart animation. Saved coaching drills can be marked complete or undone; a completion ring summarises self-reported practice separately from performance scores. A failed storage write leaves the checkbox unchanged. Profiles remain local to this browser, retaining the existing latest-50-session limit. No chart or animation dependency was added, and model settings remain unchanged.

Future live-feedback integration: call `attachLiveFeedback(session, signals)` from `src/lib/profile.ts` before `saveSession`. Signals have `id`, `messageIndex`, `dimension`, `kind`, `evidence` and `detail`; at most 40 unique signals are accepted, and each quote must occur in its indexed user message. The helper returns a new session and stores signals separately from post-session scores and recurrence. This is a validated connector; live feedback collection is deliberately not wired up yet.

TDD evidence: the initial browser test failed on the missing recurring-pattern state; chart tests failed on missing skill controls; data tests failed on missing recurrence/completion/connector behaviour; backend tests failed on unsupported observations and evidence checks. The same focused suites now pass: 100 unit/API tests, two profile-growth browser tests and three chart browser tests. Screenshots were inspected at desktop and 390px mobile widths. Tests use mocked provider responses and isolated browser profiles; this change has not been verified against a live model.

Final verification for profile growth: all 213 unit/API tests pass; instrumented coverage is 95.65% statements and 90.34% branches. Lint, typecheck, diff whitespace checks and `npm run build -- --webpack` pass. Full browser run: 37/38 pass; the existing live-transcript assertion observed an early completed turn under parallel load, then passed unchanged in isolation (1/1). All five new profile/chart browser tests pass. No live provider requests were made for this change.

## Recorded voice review — 10 October 2026

Both voice modes retain the existing microphone frames alongside Gradium's live transcript. Captured audio is downsampled to mono 16 kHz PCM WAV, split into clips of at most 60 seconds and capped at 10 recorded minutes per session. Silence is preserved for timing; the final AudioWorklet fragment is drained before stopping. Separate recording periods are joined in capture order, so playback offsets refer to recorded audio rather than wall-clock time. Only the microphone feed is captured; echo cancellation remains enabled for live voice, but speaker leakage can still occur.

After the coaching report is ready, `/api/analyse-audio` uses `gemini-3.5-transcribe` (override with `GEMINI_AUDIO_MODEL`) in verbatim mode with word timestamps. This is a dedicated transcription request through Gemini's Interactions API with inline audio, `store:false`, and a 90-second timeout. The API validates WAV format/size and provider timestamp ordering/ranges. It counts explicit hesitation sounds, including elongated spellings; meaningful phrases such as “like” are not automatically labelled fillers. Transcript-only speech metrics remain available for older sessions. This replaces the earlier limitation that recordings were not retained.

The profile holds recording references, verbatim text and analysis; IndexedDB holds WAV blobs. Reports provide playback, clickable filler timestamps, counts, a timeline and comparable-session frequency graphs. Partial analysis and recording warnings are visible and excluded from progress trends. Failed analysis leaves recordings playable; retry only submits unfinished clips. Local audio save failures still save the written report and preserve the in-memory recording for retry. A failed profile write removes newly orphaned audio. Capture warnings survive analysis retries; storage warnings do not invalidate successful measurements. Deleting a session, clearing history and retaining only the newest 50 sessions remove linked audio. Clearing browser data removes local recordings.

TDD evidence: audio profile persistence failed on the unsupported field before schema integration; recording, storage, provider and client analysis regression tests began RED and now pass. A real synthetic five-second WAV through the local endpoint returned HTTP 200 and all three deliberately spoken fillers with timestamps. Browser tests exercise both capture modes through final analysis, reload, playback, seek, graphs and deletion. These prove the integration; filler counts and timing are estimates, and a real microphone/headset rehearsal is still needed to assess quiet sounds and room echo.

Final automated checks: 273 unit/API tests pass, with 94.91% instrumented statement coverage and 90.52% branch coverage. All 10 dedicated audio browser tests pass, including failed analysis followed by retry and capture-warning preservation. Lint, typecheck and the Webpack production build pass. Retention cleanup scans stored audio keys on each save, allowing a failed cleanup to be retried even after the old report has left the profile.

Timestamp correction: a real 27-second synthetic interview returned the ordinary word “a” at `14.800s–14.800s`, which the original parser incorrectly rejected. Provider and saved-profile validation now accept point timestamps and overlapping intervals while preserving offsets, start ordering and clip bounds. Parser diagnostics contain bounded codes and paths only, never recording or transcript content. Four regression checks failed before the fix; all 280 unit/API tests, lint and typecheck now pass. The repaired live endpoint returned HTTP 200 with 83 words and four fillers for the synthetic interview. The user's original recording was not accessible for direct verification.

## Simplified feedback overview — 10 October 2026

Reports open with a summary, four compact skill scores, strengths/improvements and one practice focus. Progress charts, answer-level evidence and voice analysis are grouped into keyboard-accessible disclosures. Audio failures and in-progress analysis open the voice panel automatically; completion leaves it open for review. Existing recordings, graphs, transcript and profile actions remain available. The duplicate page headline and repeated explanations were removed. The overview browser regression failed before the layout change and now passes, including mobile layout and keyboard expansion.

Verification: 49 of 50 browser tests passed in parallel; the existing live-transcript timing test passed unchanged in isolation. All report and audio regressions passed. Desktop and 390px mobile previews were inspected; lint and typecheck passed.

## Restored wardrobe design — 10 October 2026

The studio restores the original `origin/feat/wardrobe` garden presentation: sky, clouds, hills, a prominent sunflower and the deep-green outfit wardrobe. Profile, reports, charts and recording controls use matching cream, mint, green and gold styling. Current voice, audio analysis, custom scenarios, saved profiles and compact feedback disclosures remain integrated. The obsolete sidebar Focus control is removed; full-stage mode remains available.

Verification: the new wardrobe/profile/report browser regression failed before restoration and passes afterward. The full browser suite passed 50/51 tests; the remaining assertion expected the former transparent secondary button and was updated for its new cream surface. All three affected checks then passed, including full-stage restoration and mobile voice controls. Desktop and mobile screenshots were inspected. Lint, typecheck, whitespace checks and the Webpack production build pass. Changes remain local.
