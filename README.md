# Mockingbird

An AI mock interviewer. Give it your resume and a job description and it plans the interview a hiring manager for that role would run. It pushes back when an answer is vague, then scores every answer against a rubric, citing quotes from what you actually said.

Built with Next.js 16, TypeScript, PostgreSQL, Claude, and [Tessera](https://github.com/jwag789/tessera), my design system.

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

**Some metrics are counted, not judged.** Filler words and the "I" vs "we" ratio are counted deterministically in `src/lib/scoring/metrics.ts`. The filler counter skips ordinary uses such as "I'd like to".

**Concurrent answers can't corrupt a session.** Claude runs outside the database transaction. The write then locks the session row and checks that no other answer landed in the meantime, and returns a 409 if one did.

## Running it

Requirements: Node 20+, Docker, and an Anthropic API key.

```bash
npm install
cp .env.example .env.local    # then add ANTHROPIC_API_KEY
npm run db:up                 # Postgres on port 5433
npm run db:migrate
npm run dev                   # http://localhost:3000
npm run worker                # in a second terminal: scores finished interviews
```

```bash
npm test          # engine, quote verification and metrics
npm run typecheck
```

Tessera isn't on npm yet, so it's vendored as tarballs in `vendor/`.

## Project layout

```
src/lib/interview/   plan generation, prompts, the engine (state machine), the conductor (I/O)
src/lib/scoring/     rubric scorer, quote verification, speaking metrics
src/lib/jobs/        Postgres job queue
src/worker/          background worker process
src/app/api/         route handlers
src/components/      setup form, interview room, scorecard
db/schema.sql        schema
```

## Roadmap

- Voice: streaming speech-to-text and text-to-speech over WebSockets, with turn detection and barge-in
- An eval set for the scorer: human-scored answers, and agreement between the model and human scores
- Progress across sessions: trends per dimension over time
