// Measures voice-mode latency end to end, the way the browser sees it.
// Starts a throwaway interview, synthesizes a few spoken answers with Deepgram,
// streams them to the voice server in real time (silence in between, like an
// open mic), and times each stage. Run with the voice server up:
//
//   npm run voice            # terminal 1
//   npm run voice:bench      # terminal 2
//
// The throwaway user and session are deleted at the end.
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { auth } from "../src/lib/auth";
import { pool } from "../src/lib/db";
import { startSession } from "../src/lib/interview/conductor";
import { MIC_SAMPLE_RATE, TTS_SAMPLE_RATE, type ServerMessage, type TurnLatency } from "../src/voice/protocol";

const VOICE_URL = process.env.VOICE_URL ?? `ws://localhost:${process.env.VOICE_PORT ?? 3001}`;
const ORIGIN = (process.env.VOICE_ALLOWED_ORIGINS ?? "http://localhost:3000").split(",")[0];
const CHUNK_MS = 80;
const CHUNK_BYTES = (MIC_SAMPLE_RATE * 2 * CHUNK_MS) / 1000;

const RESUME = `Alex Rivera, Software Engineer (a fictional candidate for benchmarking)
Acme Analytics, Senior Software Engineer, 2021-2026: built a Next.js operations dashboard used by 40 teams;
wrote a Node.js ingestion service on PostgreSQL handling 2M events a day; shipped an LLM ticket-triage feature.
Beta Corp, Software Engineer, 2018-2021: internal tools in TypeScript, moved polling to WebSockets.`;
const JD = `Senior Full-Stack Engineer. Build product features in TypeScript, React and Next.js with Node.js
services and PostgreSQL. Ship LLM-powered workflows with structured outputs and evaluation. Own reliability
for background processing: job queues, retries, idempotency.`;
const ANSWERS = [
  "Sure. I've been a full stack engineer for about eight years. Most recently at Acme Analytics I owned an operations dashboard in Next dot js and a Node ingestion service on Postgres, and lately I've been building LLM features like a ticket triage tool.",
  "At Acme our ingestion service was dropping events during traffic spikes. I moved the writes onto a Postgres backed queue with retries and idempotency keys. Data loss went to zero and on call pages dropped by about half over the next quarter.",
  "I'd measure it with an offline evaluation set of labeled tickets, and track agreement with human triage over time, plus a weekly sample that someone reviews by hand.",
];

type Result = TurnLatency & { clientReplyMs: number };

async function main() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY is not set in .env.local");

  console.log("Synthesizing candidate answers…");
  const answers = await Promise.all(ANSWERS.map((text) => synthesize(apiKey, text)));
  // The voice server needs a signed-in owner, so sign up a throwaway user
  // and send its session cookie the way the browser would.
  const signUp = await auth.api.signUpEmail({
    body: { name: "Voice bench", email: `bench-${randomUUID()}@mockingbird.invalid`, password: randomUUID() },
    asResponse: true,
  });
  const { user } = (await signUp.json()) as { user: { id: string } };
  const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

  console.log("Planning a throwaway interview…");
  const sessionId = await startSession({
    userId: user.id,
    resume: { kind: "text", text: RESUME },
    jobDescription: JD,
    targetMinutes: 20,
  });

  try {
    const { results, firstQuestionMs, bargeInMs } = await runCall(sessionId, answers, cookie);
    report(results, firstQuestionMs, bargeInMs);
  } finally {
    // Deleting the user cascades to the session and its turns.
    await pool.query(`delete from "user" where id = $1`, [user.id]);
    await pool.end();
  }
}

/** Candidate speech as 16 kHz PCM16, in a different voice from the interviewer's. */
async function synthesize(apiKey: string, text: string): Promise<Buffer> {
  const params = new URLSearchParams({
    model: "aura-2-orion-en",
    encoding: "linear16",
    sample_rate: String(MIC_SAMPLE_RATE),
    container: "none",
  });
  const res = await fetch(`https://api.deepgram.com/v1/speak?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Deepgram TTS failed: ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

function runCall(sessionId: string, answers: Buffer[], cookie: string) {
  return new Promise<{ results: Result[]; firstQuestionMs: number; bargeInMs: number | null }>((resolve, reject) => {
    const ws = new WebSocket(`${VOICE_URL}?session=${sessionId}&rate=${MIC_SAMPLE_RATE}`, { headers: { Origin: ORIGIN, Cookie: cookie } });
    const results: Result[] = [];
    let queue: Buffer = Buffer.alloc(0);
    let openedAt = 0;
    let speechStartedAt = 0;
    let speechEndedAt = 0;
    let firstQuestionMs = 0;
    let bargeInMs: number | null = null;
    let answered = 0;
    // The reply being played.
    let replyStartedAt = 0;
    let replyBytes = 0;
    let playback: ReturnType<typeof setTimeout> | undefined;
    let latency: TurnLatency | null = null;

    const say = (pcm: Buffer) => {
      queue = pcm;
      speechStartedAt = Date.now();
    };

    // An open mic: speech when there is some, silence otherwise, in real time.
    const mic = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (!queue.length) return ws.send(Buffer.alloc(CHUNK_BYTES));
      ws.send(queue.subarray(0, CHUNK_BYTES));
      queue = queue.subarray(CHUNK_BYTES);
      if (!queue.length) speechEndedAt = Date.now();
    }, CHUNK_MS);

    const finish = (err?: Error) => {
      clearInterval(mic);
      clearTimeout(playback);
      ws.close();
      if (err) reject(err);
      else resolve({ results, firstQuestionMs, bargeInMs });
    };

    const onReplyStart = () => {
      if (!firstQuestionMs) {
        firstQuestionMs = replyStartedAt - openedAt;
        // Talk over the opening question to time barge-in.
        setTimeout(() => say(answers[0]), 1500);
      } else if (latency) {
        results.push({ ...latency, clientReplyMs: replyStartedAt - speechEndedAt });
        latency = null;
      }
    };

    // Like the browser: playback_done once the audio would have finished playing.
    const onReplyAudioEnd = () => {
      const playMs = (replyBytes / 2 / TTS_SAMPLE_RATE) * 1000;
      playback = setTimeout(() => {
        ws.send(JSON.stringify({ type: "playback_done" }));
        if (answered >= answers.length) return finish();
        setTimeout(() => say(answers[answered]), 300);
      }, Math.max(0, replyStartedAt + playMs - Date.now()));
    };

    ws.on("open", () => {
      openedAt = Date.now();
      ws.send(JSON.stringify({ type: "speak_last" }));
    });
    ws.on("unexpected-response", (_req, res) => finish(new Error(`Voice server refused: HTTP ${res.statusCode}`)));
    ws.on("error", (err) => finish(err));
    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        if (!replyStartedAt) {
          replyStartedAt = Date.now();
          onReplyStart();
        }
        replyBytes += (data as Buffer).length;
        return;
      }
      const msg = JSON.parse(data.toString()) as ServerMessage;
      switch (msg.type) {
        case "barge_in":
          bargeInMs = Date.now() - speechStartedAt;
          clearTimeout(playback);
          break;
        case "answer":
          answered++;
          console.log(`  answer ${answered} heard: "${msg.text.slice(0, 72)}…"`);
          replyStartedAt = 0;
          replyBytes = 0;
          break;
        case "latency":
          latency = msg.latency;
          break;
        case "reply_audio_end":
          onReplyAudioEnd();
          break;
        case "ended":
          finish();
          break;
        case "error":
          console.warn(`  server error: ${msg.message}`);
          break;
      }
    });
  });
}

function report(results: Result[], firstQuestionMs: number, bargeInMs: number | null) {
  const cols: Array<[string, keyof Result]> = [
    ["turn detection", "endOfTurnMs"],
    ["conductor (Claude)", "conductorMs"],
    ["TTS first byte", "ttsFirstByteMs"],
    ["end of turn → reply audio (server)", "replyMs"],
    ["last word sent → reply audio (client)", "clientReplyMs"],
  ];
  console.log(`\n${results.length} turns. Times in ms; median (min–max).`);
  for (const [label, key] of cols) {
    const xs = results.map((r) => r[key]).filter((x): x is number => x != null).sort((a, b) => a - b);
    if (!xs.length) continue;
    console.log(`  ${label.padEnd(40)} ${median(xs)} (${xs[0]}–${xs.at(-1)})`);
  }
  console.log(`  ${"connect → first question audio".padEnd(40)} ${firstQuestionMs}`);
  console.log(`  ${"candidate starts talking → barge-in".padEnd(40)} ${bargeInMs ?? "not triggered"}`);
}

const median = (xs: number[]) => xs[Math.floor(xs.length / 2)];

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
