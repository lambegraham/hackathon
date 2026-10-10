# AnyResets demo video: build brief for Claude Code

## Read this first (agent instructions)

1. Read the HyperFrames entry skill (`/hyperframes`) before you write any composition. Route to `general-video`; this is a multi-scene piece with live footage slots.
2. Canvas is 1920x1080, 30 fps. Locked runtime is **90 seconds**. Hard floor 60 s, hard ceiling 120 s.
3. Do not render a final MP4 until Terence drops in the recorded clips. Build the composition with placeholder slots first and render a preview.
4. Never show a confidence percentage. Never show "72%" or any first-session baseline. Session 1 has real scores only; the comparison appears from Session 2.
5. The graded demo shows the real screen: Wardrobe before the session starts, Sunflower during the session. The sunflower is a teammate's merged work. Show it. Do not rebuild the UI.
6. The wow shot may cut to a VRM face on `/preview` if that route is up. Credit it in the end card: "3D avatars: VTubeMe, CC BY 4.0". If `/preview` is down, stay on the sunflower. Do not fake a 3D face.
7. Do not claim Swiss German is its own transcription language. The server sends `de`. Swiss German speech comes back as German text.
8. Footage slots are marked `RECORD`. Leave them as labelled grey frames with exact in/out times so Terence can drop clips in without retiming.
9. No em dashes in on-screen text. No "leverage, unlock, seamless, cutting-edge". On-screen text is short, sentence case.
10. Do not edit app source in `src/`. Capture from the running app or build the shot in HyperFrames.

---

## What the product is

AnyResets is a practice call for hard conversations: a job interview, asking for a raise, a relationship talk, difficult feedback, or a custom one. You rehearse with a face that listens and answers, then you see what got better.

### True on main (a85caae)
- Next.js app. Gemini writes the replies and stays in character.
- `coach.tsx` renders the merged UI: Wardrobe before the session starts, Sunflower during the session. That is the product.
- Gradium does speech-to-text and text-to-speech, with streaming PCM playback.
- Voices: Marshall (male) and Lainey (female).
- Difficulty: friendly = Easy, neutral = Intermediate, challenging = Hard.
- Finished practices save in the browser under `rehearsal.profile.v1`.
- Session 2 is compared with Session 1 on the same scenario and difficulty. Four skills, scored 1 to 5: clarity, structure, specificity, relevance.

### In the working tree (show as what the demo shows, do not say "live in production")
- Wispr Flow streaming transcription. Org key stays on the server. `WISPR_LANGUAGE` defaults to `de`.
- Transcript lines saved on the server in `.data/transcripts/` (one JSON file per session).
- Four photoreal VRMs: Nova, Kai, Sky, Ember (VTubeMe, CC BY 4.0). Three.js / React Three Fiber. Mouth driven by the live microphone level.
- `/preview` may or may not exist. If it is up, it is an extra shot of the 3D faces. The main app capture is the sunflower session. Session numbers, Wispr, the four VRM files, and the three.js deps are extra local work. They are not a reason to hide the sunflower.

---

## Mix

| Share | Seconds | Job |
|---|---|---|
| Technical | ~45 s | Graders see the real path and the named pieces |
| Wow | ~27 s | One cut to a VRM face on `/preview` if that route is up; otherwise the sunflower holds |
| Live role-play | ~18 s | Terence and partner play two short beats |

The technical and wow parts overlap: the sunflower session is on screen during most of the technical captions.

---

## Timed script (90 s)

Legend: **LIVE** = recorded footage of Terence or partner. **CAP** = screen capture of the app. **HF** = generated in HyperFrames.

| Time | Who | Line or action | Source |
|---|---|---|---|
| 0:00–0:03 | HF | Black. Wardrobe (the screen before a session starts), then cut to the Sunflower as the session begins. | CAP of wardrobe, then CAP of the live session |
| 0:03–0:08 | HF | Title, lower left: "Practice the hard conversation before you have it." Sunflower holds. | HF over CAP of the session |
| 0:08–0:12 | Terence | **RECORD A.** Interview beat, Terence as candidate. | LIVE |
| 0:12–0:16 | Screen | Sunflower answers (voice Marshall). Lower third: "Job interview · Hard". | CAP of the session + HF lower third |
| 0:16–0:22 | HF | Split frame: Terence clip left (muted), call frame right. Transcript line types in under Terence as he spoke it. Caption: "Gemini stays in character." | HF + CAP of the session |
| 0:22–0:26 | HF | **Hard cut** to a VRM face on `/preview` if that route is up, side angle 60 to 70 degrees, mouth moving. Caption: "Real 3D. The mouth follows the voice." If `/preview` is down, stay on the sunflower and drop that caption. Do not fake a 3D face. | CAP of `/preview`, or stay on the session |
| 0:26–0:35 | Terence | **RECORD B.** Terence answers again, tighter. Sunflower, short reply. | LIVE + CAP of the session |
| 0:35–0:39 | HF | Card: "Relationship talk". Stay on the sunflower. | HF over CAP of the session |
| 0:39–0:44 | Partner | **RECORD C.** Swiss German line. | LIVE |
| 0:44–0:50 | HF | Transcript line appears under the clip in German. Small tag next to it: "Wispr Flow · de". Hold so it reads. | HF |
| 0:50–0:56 | Screen | Sunflower answers in character. | CAP of the session |
| 0:56–1:05 | Terence + partner | **RECORD D.** Short reaction beat together. | LIVE |
| 1:05–1:10 | HF | Pipeline line draws left to right: Mic → Wispr Flow (`de`) → server transcript (`.data/transcripts`) → Gemini → Gradium voice → sunflower on screen. | HF |
| 1:10–1:15 | HF | Over the pipeline, waveform pulses. If the `/preview` cut is in the film, the VRM mouth opens in sync and the caption reads "Mouth from the microphone, not a loop." If not, the waveform plays over the sunflower with no 3D caption. | HF |
| 1:15–1:23 | HF | Session card. Left column "Session 1", right "Session 2". Four rows: clarity, structure, specificity, relevance. Specificity bar moves 2 → 4 in one 0.6 s ease. Other rows show their real values, no animation. No percentages. | HF (values from CAP of profile dashboard) |
| 1:23–1:25 | HF | Caption: "Same scenario. Same difficulty. Scored 1 to 5." | HF |
| 1:25–1:30 | HF | Back to the call frame, sunflower in the session. End line: "Practice before the real conversation." If a VRM face appeared, small credit bottom right: "3D avatars: VTubeMe, CC BY 4.0". Repo: github.com/lambegraham/hackathon | HF |

Total: 90 s. If cuts are needed, trim 0:26–0:35 (RECORD B) to 4 s and 0:56–1:05 (RECORD D) to 5 s. That lands at 80 s without touching the technical pass.

---

## RECORD boxes (Terence and partner)

Film 16:9, chest up, plain wall, window light. Each line fits in one breath. Record each take three times. Keep 1 s of silence before and after.

### RECORD A: interview opener (4 s, slot 0:08–0:12)
- **Who:** Terence, as the candidate.
- **Says:** "I led the AI work at the airport, and I want to do that here."
- **Looks:** into the lens, as if the lens is the interviewer.

### RECORD B: better answer (up to 9 s, slot 0:26–0:35)
- **Who:** Terence.
- **Says:** "Fair question. We shipped tools people use every day, inside the airport's data rules."
- **Looks:** into the lens. Slightly slower, more settled than A.
- **Note:** if Terence adds a number, it must be one he already uses in public.

### RECORD C: relationship opener, Swiss German (5 s, slot 0:39–0:44)
- **Who:** partner.
- **Says:** "Ich ha das scho lang welle säge."
- **Looks:** down for the first half, then up into the lens. Hesitant.
- **Then on screen (HF, not spoken):** the German text Wispr returned. Use what the live capture actually printed. Do not type a perfect translation by hand.

### RECORD D: reaction (up to 9 s, slot 0:56–1:05)
- **Who:** Terence and partner, side by side.
- **Partner says:** "Okay. That felt easier the second time."
- **Terence says:** "That's the point. You practice here first."
- **Looks:** at each other for the first line, Terence to the lens for the second.

---

## Shot list

### HyperFrames can build without their faces
| # | Shot | Duration | Input |
|---|---|---|---|
| H1 | Wardrobe, then the sunflower in the live session | 8 s | Screen capture of wardrobe before start, then the session at 1920x1080 |
| H2 | Title "Practice the hard conversation before you have it." | 5 s | Text over the sunflower session |
| H3 | Lower third "Job interview · Hard" | 3 s | Text |
| H4 | Wow cut: a VRM face, side angle, mouth moving. Only if `/preview` is up. If it is down, this slot stays on the sunflower. Do not fake a 3D face. | 4 s | Capture of `/preview`, or the session |
| H5 | Card "Relationship talk" over the sunflower | 4 s | Session capture |
| H6 | Transcript line types in, tag "Wispr Flow · de" | 6 s | Text from live capture |
| H7 | Pipeline diagram drawing left to right, six labelled nodes | 5 s | Text |
| H8 | Waveform pulse. VRM mouth only if H4 is in the film. | 5 s | Audio from capture + the session (or `/preview` if H4 ran) |
| H9 | Session 1 vs Session 2, four skills, one bar 2 → 4 | 8 s | Real values from the profile dashboard |
| H10 | End card, sunflower, line, repo. VTubeMe credit only if a VRM face was shown. | 5 s | Session capture + text |

### Needs their recording
| # | Slot | Who |
|---|---|---|
| R-A | 0:08–0:12 | Terence |
| R-B | 0:26–0:35 | Terence |
| R-C | 0:39–0:44 | Partner (Swiss German) |
| R-D | 0:56–1:05 | Terence + partner |

---

## Capture checklist (before building)

1. Run the app locally. Do one Easy and one Hard interview pass so Session 1 and Session 2 exist with real scores under `rehearsal.profile.v1`. Capture Wardrobe before the session starts, then the Sunflower during the session. That pair is the graded demo.
2. Open `/preview` if it is up. Capture 15 s of one VRM face idle and speaking, for the wow cut only. If `/preview` is not up, stay on the sunflower. Do not fake a 3D face.
3. Speak RECORD C into the mic once with Wispr on. Screenshot the German text it returns. That text goes on screen in H6.
4. Open `.data/transcripts/` and confirm a session file was written. A 1 s insert of the file list is allowed in H7.

## Motion rules
- Skill bar: one ease, 0.6 s, no glow, no confetti, no "LEVEL UP".
- Captions: sentence case, white on 60% black, lower left, 2 s minimum on screen.
- Cuts on speech boundaries. The side-angle cut at 0:22 is the only hard cut that ignores rhythm.
- Music: low, warm bed. Duck under every spoken line.
