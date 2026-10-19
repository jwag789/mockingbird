// Thin clients for Deepgram's streaming APIs: Flux (speech-to-text with
// built-in turn detection) and Aura-2 (text-to-speech). Both keep one
// WebSocket per call open, so a turn doesn't pay for a TLS handshake, and
// reconnect on demand if Deepgram closes an idle socket.
import WebSocket, { type RawData } from "ws";
import { TTS_SAMPLE_RATE } from "./protocol";

export type SttEvent = {
  event: "StartOfTurn" | "Update" | "EagerEndOfTurn" | "TurnResumed" | "EndOfTurn";
  /** Unique for the whole call, even across reconnects. */
  turnIndex: number;
  transcript: string;
  /** Word timings in ms from the start of the call's audio. */
  words: Array<{ word: string; startMs: number; endMs: number }>;
  /** Ms of audio sent to Deepgram when this event arrived, on the same clock as `words`. */
  audioSentMs: number;
};

export interface SpeechToText {
  sendAudio(pcm16: Buffer): void;
  /** End the current turn now (the candidate pressed "Done answering"). */
  endTurn(): void;
  close(): void;
}

export interface TextToSpeech {
  speak(text: string): void;
  /** Drop queued text and audio (barge-in). */
  clear(): void;
  close(): void;
}

const MAX_QUEUE = 250;

type Handlers = { onError: (err: Error) => void; log: (msg: string) => void };

/**
 * A WebSocket that opens on first use, queues sends while connecting, and
 * reopens on the next send after Deepgram closes it.
 */
class LazySocket {
  private ws: WebSocket | null = null;
  private queue: Array<string | Buffer> = [];
  private closed = false;

  constructor(
    private url: string,
    private apiKey: string,
    private handlers: Handlers & { onMessage: (data: RawData, binary: boolean) => void; onConnecting?: () => void },
  ) {}

  send(data: string | Buffer) {
    if (this.closed) return;
    if (this.ws?.readyState === WebSocket.OPEN) return this.ws.send(data);
    this.queue.push(data);
    // Don't buffer without bound if Deepgram stays unreachable.
    if (this.queue.length > MAX_QUEUE) this.queue.shift();
    if (!this.ws || this.ws.readyState >= WebSocket.CLOSING) this.open();
  }

  /** Open now rather than on first send, so the first turn is fast too. */
  warm() {
    if (!this.ws && !this.closed) this.open();
  }

  close(goodbye?: string) {
    this.closed = true;
    this.queue = [];
    if (this.ws?.readyState === WebSocket.OPEN && goodbye) this.ws.send(goodbye);
    this.ws?.close();
  }

  private open() {
    this.handlers.onConnecting?.();
    const ws = new WebSocket(this.url, { headers: { Authorization: `Token ${this.apiKey}` } });
    this.ws = ws;
    ws.on("open", () => {
      for (const item of this.queue.splice(0)) ws.send(item);
    });
    ws.on("message", (data, binary) => this.handlers.onMessage(data, binary));
    ws.on("unexpected-response", (_req, res) => {
      this.handlers.onError(new Error(`Deepgram refused the connection (HTTP ${res.statusCode})`));
    });
    ws.on("error", (err) => this.handlers.onError(err));
    ws.on("close", (code) => {
      if (!this.closed) this.handlers.log(`deepgram socket closed (${code}); will reopen on demand`);
    });
  }
}

export type FluxOptions = {
  apiKey: string;
  /** Of the mic audio: mono PCM16. */
  sampleRate: number;
  /** Confidence needed to end a turn. Interview answers have long pauses, so this runs higher than the 0.7 default. */
  eotThreshold?: number;
  /** End the turn after this much silence regardless of confidence. */
  eotTimeoutMs?: number;
  onEvent: (event: SttEvent) => void;
} & Handlers;

export function connectFlux(opts: FluxOptions): SpeechToText {
  const params = new URLSearchParams({
    model: "flux-general-en",
    encoding: "linear16",
    sample_rate: String(opts.sampleRate),
    eot_threshold: String(opts.eotThreshold ?? 0.8),
    eot_timeout_ms: String(opts.eotTimeoutMs ?? 5000),
  });

  const bytesPerMs = (opts.sampleRate * 2) / 1000;
  // Flux's turn indexes and word timings restart with each connection; keep
  // them unique and on one clock for the whole call.
  let bytesSent = 0;
  let connectionStartMs = 0;
  let turnOffset = 0;
  let maxTurn = -1;

  const socket = new LazySocket(`wss://api.deepgram.com/v2/listen?${params}`, opts.apiKey, {
    ...opts,
    // Runs before the chunk that triggered a reconnect is counted, so a new
    // connection's t=0 lines up with the first audio it receives.
    onConnecting: () => {
      connectionStartMs = bytesSent / bytesPerMs;
      turnOffset = maxTurn + 1;
    },
    onMessage: (data, binary) => {
      if (binary) return;
      const msg = JSON.parse(data.toString());
      if (msg.type === "TurnInfo") {
        const turnIndex = turnOffset + Number(msg.turn_index);
        maxTurn = Math.max(maxTurn, turnIndex);
        opts.onEvent({
          event: msg.event,
          turnIndex,
          transcript: String(msg.transcript ?? "").trim(),
          words: (msg.words ?? [])
            .filter((w: { start?: number; end?: number }) => w.start != null && w.end != null)
            .map((w: { word: string; start: number; end: number }) => ({
              word: w.word,
              startMs: connectionStartMs + Number(w.start) * 1000,
              endMs: connectionStartMs + Number(w.end) * 1000,
            })),
          audioSentMs: bytesSent / bytesPerMs,
        });
      } else if (msg.type === "Error") {
        opts.onError(new Error(`Flux error ${msg.code}: ${msg.description}`));
      } else if (msg.type === "Warning") {
        opts.log(`flux warning ${msg.code}: ${msg.description}`);
      }
    },
  });
  socket.warm();

  return {
    sendAudio(pcm16) {
      socket.send(pcm16);
      bytesSent += pcm16.length;
    },
    endTurn: () => socket.send(JSON.stringify({ type: "ForceEndTurn" })),
    close: () => socket.close(JSON.stringify({ type: "CloseStream" })),
  };
}

export type AuraOptions = {
  apiKey: string;
  voice?: string;
  onAudio: (pcm16: Buffer) => void;
  /** All audio for the last speak() has been sent. */
  onDone: () => void;
} & Handlers;

export function connectAura(opts: AuraOptions): TextToSpeech {
  const params = new URLSearchParams({
    model: opts.voice ?? "aura-2-thalia-en",
    encoding: "linear16",
    sample_rate: String(TTS_SAMPLE_RATE),
  });
  // After a Clear, audio already in flight is stale until Deepgram confirms.
  let clearing = false;

  const socket = new LazySocket(`wss://api.deepgram.com/v1/speak?${params}`, opts.apiKey, {
    ...opts,
    onMessage: (data, binary) => {
      if (binary) {
        if (!clearing) opts.onAudio(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
        return;
      }
      const msg = JSON.parse(data.toString());
      if (msg.type === "Flushed" && !clearing) opts.onDone();
      else if (msg.type === "Cleared") clearing = false;
      else if (msg.type === "Warning") opts.log(`aura warning ${msg.code}: ${msg.description}`);
      else if (msg.type === "Error") opts.onError(new Error(`Aura error: ${msg.description ?? msg.err_msg}`));
    },
  });
  socket.warm();

  return {
    speak(text) {
      socket.send(JSON.stringify({ type: "Speak", text }));
      socket.send(JSON.stringify({ type: "Flush" }));
    },
    clear() {
      clearing = true;
      socket.send(JSON.stringify({ type: "Clear" }));
    },
    close: () => socket.close(JSON.stringify({ type: "Close" })),
  };
}
