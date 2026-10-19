// Voice server: a WebSocket per voice call. The browser streams mic audio up;
// this streams it to Deepgram Flux, sends each finished turn through the
// conductor (the same submitAnswer() as text mode), and streams the
// interviewer's reply back as Aura-2 audio.
import Anthropic from "@anthropic-ai/sdk";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { ClaudeOutputError } from "../lib/claude";
import { pool } from "../lib/db";
import { ConflictError, NotFoundError, getSession, getTurns, submitAnswer } from "../lib/interview/conductor";
import { recordTalkTime } from "../lib/scoring/talk-time";
import { VoiceCall } from "./call";
import { connectAura, connectFlux } from "./deepgram";
import { MIC_SAMPLE_RATES, type ClientMessage, type ServerMessage } from "./protocol";

const PORT = Number(process.env.VOICE_PORT ?? 3001);
// Only the app may open calls: each one spends Deepgram and Claude credit.
const ALLOWED_ORIGINS = (process.env.VOICE_ALLOWED_ORIGINS ?? "http://localhost:3000").split(",");
const API_KEY = process.env.DEEPGRAM_API_KEY;
const DEBUG = !!process.env.VOICE_DEBUG;
const CLIENT_MESSAGES = new Set<ClientMessage["type"]>(["speak_last", "end_turn", "playback_done"]);

if (!API_KEY) {
  console.error("DEEPGRAM_API_KEY is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const wss = new WebSocketServer({
  port: PORT,
  maxPayload: 256 * 1024,
  verifyClient: ({ origin }: { origin: string }) => ALLOWED_ORIGINS.includes(origin),
});

wss.on("listening", () => log({ event: "listening", url: `ws://localhost:${PORT}` }));
type MessageHandler = (data: RawData, isBinary: boolean) => void;

wss.on("connection", (socket, req) => {
  const params = new URL(req.url ?? "/", "http://localhost").searchParams;
  const sessionId = params.get("session") ?? "";
  const sampleRate = Number(params.get("rate"));

  // The browser starts talking (speak_last, mic audio) as soon as the socket
  // opens, while the session lookup is still running. Hold those messages
  // until the call exists rather than dropping them.
  const early: Array<Parameters<MessageHandler>> = [];
  let onMessage: MessageHandler = (...args) => early.push(args);
  socket.on("message", (data, isBinary) => onMessage(data, isBinary));

  openCall(socket, sessionId, sampleRate)
    .then((handler) => {
      if (!handler) return;
      onMessage = handler;
      for (const args of early.splice(0)) handler(...args);
    })
    .catch((err) => {
      log({ event: "call_error", sessionId, error: String(err) });
      socket.close(1011, "Voice call failed");
    });
});

async function openCall(socket: WebSocket, sessionId: string, sampleRate: number): Promise<MessageHandler | void> {
  if (!MIC_SAMPLE_RATES.includes(sampleRate)) return socket.close(1008, "Unsupported sample rate");
  const session = await getSession(sessionId).catch(() => null);
  if (!session) return socket.close(1008, "No such interview");
  if (session.session.status !== "active") return socket.close(1008, "This interview has ended");
  if (socket.readyState !== socket.OPEN) return;

  const callLog = (event: Record<string, unknown>) => log({ sessionId, ...event });
  const send = (msg: ServerMessage) => {
    if (DEBUG && msg.type === "state") callLog({ event: "state", state: msg.state });
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
  };
  const onError = (err: Error) => {
    callLog({ event: "deepgram_error", error: err.message });
    send({ type: "error", message: "The speech service had a problem. Check the voice server logs." });
  };

  const stt = connectFlux({
    apiKey: API_KEY!,
    sampleRate,
    eotThreshold: envNumber("VOICE_EOT_THRESHOLD"),
    eotTimeoutMs: envNumber("VOICE_EOT_TIMEOUT_MS"),
    onEvent: (ev) => {
      if (DEBUG && ev.transcript) callLog({ event: "stt", stt: ev.event, turn: ev.turnIndex, transcript: ev.transcript });
      void call.onStt(ev).catch(onError);
    },
    onError,
    log: (msg) => callLog({ event: "flux", msg }),
  });
  const tts = connectAura({
    apiKey: API_KEY!,
    voice: process.env.VOICE_TTS_MODEL,
    onAudio: (pcm) => call.onTtsAudio(pcm),
    onDone: () => call.onTtsDone(),
    onError: (err) => call.onTtsError(err),
    log: (msg) => callLog({ event: "aura", msg }),
  });

  const call = new VoiceCall({
    sessionId,
    stt,
    tts,
    interview: { submitAnswer, getTurns, recordTalkTime },
    send,
    sendAudio: (pcm) => socket.readyState === socket.OPEN && socket.send(pcm, { binary: true }),
    describeError,
    log: callLog,
  });

  socket.on("close", () => {
    stt.close();
    tts.close();
    callLog({ event: "call_closed" });
  });

  callLog({ event: "call_opened", sampleRate });
  call.start();

  return (data, isBinary) => {
    if (isBinary) return call.onAudio(data as Buffer);
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (CLIENT_MESSAGES.has(msg?.type)) void call.onClientMessage(msg).catch(onError);
  };
}

function describeError(err: unknown): string {
  if (err instanceof ConflictError || err instanceof NotFoundError) return err.message;
  if (err instanceof Anthropic.RateLimitError) return "The interviewer is busy. Say that again in a moment.";
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key is missing or invalid.";
  console.error(err);
  if (err instanceof ClaudeOutputError || err instanceof Anthropic.APIError) {
    return "The interviewer had trouble responding. Say that again.";
  }
  return "Something went wrong. Say that again.";
}

function envNumber(name: string): number | undefined {
  const v = process.env[name];
  return v ? Number(v) : undefined;
}

function log(event: Record<string, unknown>) {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...event }));
}

async function shutdown() {
  for (const client of wss.clients) client.close(1001, "Voice server shutting down");
  wss.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
