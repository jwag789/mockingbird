# Mockingbird

An AI mock interviewer. Give it your resume and a job description and it plans the interview a hiring manager for that role would run. You answer by typing or out loud. It pushes back when an answer is vague, then scores every answer against a rubric, citing quotes from what you actually said.

Built with Next.js 16, TypeScript, PostgreSQL, Claude, Deepgram (streaming speech-to-text and text-to-speech), and [Tessera](https://github.com/jwag789/tessera), my design system.

## How it works

```
resume + JD ──▶ planner (Claude) ──▶ normalized plan ──▶ interview loop ──▶ job queue ──▶ scorer (Claude) ──▶ scorecard
                                                          │                                  │
                                         Claude judges each answer,          every quote checked against
                                         code decides what happens next      the transcript; misses dropped
```

**The interview is a state machine; Claude is a judge inside it.** On each turn, Claude reads the answer and says whether it needs a follow-up, should move on, needs a clarification, or the candidate wants to stop. The engine (`src/lib/interview/engine.ts`, pure and unit tested) then decides what actually happens. It caps follow-ups per stage, skips follow-ups when the interview is behind schedule, jumps to the wrap-up when time runs out, and adds the stage transitions. That keeps the model from looping on follow-ups or running long.

**Questions target the gaps.** The planner compares the resume to the job's requirements, flags gaps, and writes questions that probe them. The plan is then normalized in code: exactly one intro, the right number of behavioral and technical questions for the time slot, and one wrap-up.

**Scoring runs in the background, on a Postgres job queue I wrote.**
- Ending an interview enqueues a job in the same transaction, so a job exists if and only if the interview ended.
- `NOTIFY` wakes the worker immediately, with polling as a fallback.
- Workers claim jobs with `FOR UPDATE SKIP LOCKED`, so several can run side by side.
- Failed jobs retry with exponential backoff, and jobs from crashed workers are requeued.

See `src/lib/jobs/queue.ts` and `src/worker/index.ts`.

**Every quote on the scorecard is verified.** The scorer has to back each score with quotes from the candidate's answers. Code checks each quote against the transcript, ignoring case, whitespace and punctuation, and drops anything paraphrased or invented. The scorecard notes how many quotes were dropped.

**Some metrics are counted, not judged.** Filler words and the "I" vs "we" ratio are counted deterministically in `src/lib/scoring/metrics.ts`. The filler counter skips ordinary uses such as "I'd like to". Spoken answers also get talk time and pace (words per minute), measured from the speech-to-text word timings.

**Concurrent answers can't corrupt a session.** Claude runs outside the database transaction. The write then locks the session row and checks that no other answer landed in the meantime, and returns a 409 if one did.

## Voice mode

```
 browser                               voice server (src/voice, own process)           services
┌──────────────────────┐   mic PCM      ┌────────────────────────────────────┐
│ mic ─▶ AudioWorklet  │ ─────────────▶ │ ─▶ Deepgram Flux STT ───────────── │ ──▶ Deepgram (turn detection)
│                      │                │       │ EndOfTurn                  │
│                      │   JSON events  │       ▼                            │
│ transcript ◀─ refetch│ ◀───────────── │   submitAnswer()  ← same as text   │ ──▶ Claude judges, engine decides,
│                      │                │       │ reply turn saved           │     Postgres
│ speakers ◀─ Web Audio│ ◀───────────── │   Deepgram Aura-2 TTS ◀────────────│ ──▶ Deepgram (streaming voice)
└──────────────────────┘   24 kHz PCM   └────────────────────────────────────┘
```

**Voice is only an input and output layer.** The voice server sends each finished turn through the same `submitAnswer()` the text API uses, then speaks whatever reply that saved. The interview logic, the turns table and the scoring are identical in both modes, and you can switch modes mid-interview. The browser refetches the session after each answer, so the transcript always shows what's in the database.

**One call is a small state machine** (`src/voice/call.ts`, no I/O, unit tested with fakes): `listening → thinking → speaking → listening`. The server (`src/voice/server.ts`) wires it to the browser's WebSocket, to Deepgram (`src/voice/deepgram.ts`) and to the conductor.

**End of turn.** Deepgram Flux detects end of turn from the audio and the words together, not just from silence. Interview answers have long pauses, so the threshold is 0.8 rather than the default 0.7, with a 5 second silence cap. A **Done answering** button ends the turn at once (Flux `ForceEndTurn`). Both values can be tuned with `VOICE_EOT_THRESHOLD` and `VOICE_EOT_TIMEOUT_MS`.

**Barge-in.** The mic stays open while the interviewer talks. When Flux hears the candidate start a turn, the server clears the TTS stream and tells the browser, which stops every audio buffer it has scheduled. The call is back to listening, and that turn becomes the answer. Without headphones the mic also hears the interviewer, so a turn whose word pairs mostly match what the interviewer is saying counts as echo, on top of the browser's own echo cancellation (`src/voice/echo.ts`). Speech that starts while the interviewer is *thinking* is dropped, the same as the disabled text box: the answer is already with the conductor, and a second one would be a conflicting write.

**Streaming.** Each call keeps one Flux socket and one Aura socket open, so a turn doesn't pay for a new TLS handshake. The mic goes up at the browser's own sample rate (usually 48 kHz, which Flux accepts), so it isn't resampled. Reply audio is forwarded chunk by chunk as Deepgram generates it, and the browser schedules each chunk right after the one before for gapless playback.

**Talk time and pace.** Talk time is the span from the first word to the last in each spoken answer, from Flux's word timings. It's stored in `answer_audio`, keyed to the turn, so the conductor doesn't change. Pace is words per minute over the spoken answers. Typed answers have neither, and a mixed interview gets pace from its spoken answers only.

### Latency

Measured on 2026-10-18 over 22 turns: two interviews I did by voice in Chrome, a scripted run in the browser, and two runs of `npm run voice:bench` (local Next.js and Postgres, Deepgram and Claude over the internet, home connection). The voice server logs these numbers for every turn.

| Stage | Median | p90 |
| --- | --- | --- |
| Turn detection: last word spoken → Flux `EndOfTurn` | 1.0 s | 1.4 s |
| Conductor: Claude judges the answer, engine, DB write | 3.0 s | 3.7 s |
| TTS first byte: reply text → first audio chunk | 0.18 s | 0.20 s |
| **End of turn → interviewer starts talking** | **3.2 s** | **3.8 s** |
| Opening question, connect → first audio (cold TTS socket) | 0.77 s | 0.98 s |
| Barge-in: candidate starts talking → interviewer stops (bench, 2 runs) | 0.56–0.77 s | |

Once the reply text exists, the interviewer starts speaking in under 0.2 s, well within the ~1 s target. The time you actually wait after you stop talking (~4 s from your last word) is almost all turn detection plus Claude's judgment. There are two ways to cut it. One is to start the judge on Flux's early end-of-turn signal (see the roadmap). The other is to lower `VOICE_EOT_THRESHOLD`, which trades faster replies for more answers cut off mid-thought.

## Running it

Requirements: Node 20+, Docker, an Anthropic API key, and a Deepgram API key for voice mode.

```bash
npm install
cp .env.example .env.local    # then add ANTHROPIC_API_KEY and DEEPGRAM_API_KEY
npm run db:up                 # Postgres on port 5433
npm run db:migrate
npm run dev                   # http://localhost:3000
npm run worker                # in a second terminal: scores finished interviews
npm run voice                 # in a third terminal: the voice server on ws://localhost:3001
```

Voice mode needs a browser with microphone access. Headphones work best. Run the voice server with `VOICE_DEBUG=1` to log every transcript and state change.

```bash
npm test            # engine, quote verification, metrics, the voice call state machine
npm run typecheck
npm run voice:bench # voice latency, end to end (needs the voice server running)
```

Tessera isn't on npm yet, so it's vendored as tarballs in `vendor/`.

## Project layout

```
src/lib/interview/   plan generation, prompts, the engine (state machine), the conductor (I/O)
src/lib/scoring/     rubric scorer, quote verification, speaking metrics
src/lib/jobs/        Postgres job queue
src/worker/          background worker process
src/voice/           voice server: call state machine, Deepgram clients, WebSocket protocol
src/app/api/         route handlers
src/components/      setup form, interview room, scorecard
db/schema.sql        schema
```

## Roadmap

- Voice: start the judge on Flux's early end-of-turn signal (`EagerEndOfTurn`) and discard it if the candidate keeps talking. This needs a judge call that doesn't commit, since `submitAnswer()` saves the turn
- An eval set for the scorer: human-scored answers, and agreement between the model and human scores
- Progress across sessions: trends per dimension over time
