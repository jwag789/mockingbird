"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MIC_SAMPLE_RATE,
  MIC_SAMPLE_RATES,
  TTS_SAMPLE_RATE,
  type ClientMessage,
  type ServerMessage,
  type TurnLatency,
  type VoiceState,
} from "@/voice/protocol";

const VOICE_URL = process.env.NEXT_PUBLIC_VOICE_URL ?? "ws://localhost:3001";

export type CallStatus = "off" | VoiceState | "ended";

type Callbacks = {
  /** The candidate's turn ended; show it as a pending answer. */
  onAnswer: (text: string) => void;
  /** The session's turns changed on the server. */
  onSessionUpdated: () => void;
};

/**
 * A voice call with the voice server: mic up as PCM16, reply audio
 * down as 24 kHz PCM16, played gaplessly by scheduling each chunk right
 * after the last.
 */
export function useVoiceCall(sessionId: string, callbacks: Callbacks) {
  const [status, setStatus] = useState<CallStatus>("off");
  const [transcript, setTranscript] = useState("");
  // Updated ~12 times a second; a ref so the meter can read it without re-rendering the room.
  const level = useRef(0);
  const [latency, setLatency] = useState<TurnLatency | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cb = useRef(callbacks);
  useEffect(() => {
    cb.current = callbacks;
  });

  const call = useRef<Call | null>(null);
  // Bumped by start() and stop(), so a start that's still awaiting the mic knows it was cancelled.
  const generation = useRef(0);

  const stop = useCallback(() => {
    generation.current++;
    const c = call.current;
    if (!c) return;
    call.current = null;
    clearTimeout(c.doneTimer);
    c.ws.close();
    c.stream.getTracks().forEach((t) => t.stop());
    void c.ctx.close();
    setStatus((s) => (s === "ended" ? s : "off"));
    setTranscript("");
    level.current = 0;
  }, []);

  const start = useCallback(async () => {
    if (call.current) return;
    const gen = ++generation.current;
    setError(null);
    setStatus("connecting");
    // Created before any await, while we're still inside the click.
    const ctx = new AudioContext();
    let stream: MediaStream;
    try {
      [stream] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }),
        ctx.audioWorklet.addModule("/voice-capture.worklet.js?v=2"),
      ]);
    } catch (err) {
      void ctx.close();
      if (gen !== generation.current) return;
      setStatus("off");
      setError(
        (err as Error).name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in the browser to use voice mode."
          : `Couldn't start the microphone: ${(err as Error).message}`,
      );
      return;
    }
    if (gen !== generation.current) {
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      return;
    }
    void ctx.resume();

    // Send the mic at its native rate when Flux takes it; resampling only loses quality.
    const rate = MIC_SAMPLE_RATES.includes(ctx.sampleRate) ? ctx.sampleRate : MIC_SAMPLE_RATE;
    const ws = new WebSocket(`${VOICE_URL}?session=${encodeURIComponent(sessionId)}&rate=${rate}`);
    ws.binaryType = "arraybuffer";
    const c = {
      ws,
      ctx,
      stream,
      sources: new Set<AudioBufferSourceNode>(),
      playHead: 0,
      carry: null,
      ended: false,
    } satisfies Call as Call;
    call.current = c;

    const send = (msg: ClientMessage) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));
    const stopPlayback = () => {
      clearTimeout(c.doneTimer);
      c.sources.forEach((s) => s.stop());
      c.sources.clear();
      c.playHead = 0;
      c.carry = null;
    };

    const capture = new AudioWorkletNode(ctx, "mb-capture", { processorOptions: { targetRate: rate } });
    capture.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(e.data.pcm);
      level.current = e.data.level;
    };
    ctx.createMediaStreamSource(stream).connect(capture);
    // The node writes no output; connecting it just keeps the graph pulling it.
    capture.connect(ctx.destination);

    ws.onopen = () => send({ type: "speak_last" });
    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) return play(c, e.data);
      const msg = JSON.parse(e.data) as ServerMessage;
      switch (msg.type) {
        case "state":
          setStatus(msg.state);
          if (msg.state !== "listening") setTranscript("");
          break;
        case "transcript":
          setTranscript(msg.text);
          break;
        case "answer":
          setTranscript("");
          cb.current.onAnswer(msg.text);
          break;
        case "session_updated":
          cb.current.onSessionUpdated();
          break;
        case "reply_audio_end":
          // Tell the server once the buffered audio has actually played.
          c.doneTimer = setTimeout(
            () => send({ type: "playback_done" }),
            Math.max(0, (c.playHead - ctx.currentTime) * 1000) + 100,
          );
          break;
        case "barge_in":
          stopPlayback();
          break;
        case "latency":
          setLatency(msg.latency);
          break;
        case "ended":
          c.ended = true;
          setStatus("ended");
          stop();
          break;
        case "error":
          setError(msg.message);
          break;
      }
    };
    ws.onclose = (e) => {
      if (call.current !== c) return;
      if (!c.ended) {
        setError(
          e.reason ||
            "Lost the connection to the voice server. Is it running? Start it with `npm run voice`.",
        );
      }
      stop();
    };
  }, [sessionId, stop]);

  useEffect(() => stop, [stop]);

  const endTurn = useCallback(() => {
    const ws = call.current?.ws;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "end_turn" } satisfies ClientMessage));
  }, []);

  return { status, transcript, level, latency, error, clearError: () => setError(null), start, stop, endTurn };
}

type Playback = {
  ctx: AudioContext;
  sources: Set<AudioBufferSourceNode>;
  playHead: number;
  /** A chunk can end mid-sample; its last byte waits for the next chunk. */
  carry: number | null;
};

type Call = Playback & {
  ws: WebSocket;
  stream: MediaStream;
  doneTimer?: ReturnType<typeof setTimeout>;
  ended: boolean;
};

function play(c: Playback, data: ArrayBuffer) {
  let bytes = new Uint8Array(data);
  if (c.carry != null) {
    const joined = new Uint8Array(bytes.length + 1);
    joined[0] = c.carry;
    joined.set(bytes, 1);
    bytes = joined;
    c.carry = null;
  }
  if (bytes.length % 2) c.carry = bytes[bytes.length - 1];
  const samples = bytes.length >> 1;
  if (!samples) return;

  const view = new DataView(bytes.buffer, bytes.byteOffset, samples * 2);
  const buffer = c.ctx.createBuffer(1, samples, TTS_SAMPLE_RATE);
  const out = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;

  const src = c.ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(c.ctx.destination);
  // A little lead on the first chunk absorbs network jitter between chunks.
  const at = Math.max(c.playHead, c.ctx.currentTime + 0.05);
  src.start(at);
  c.playHead = at + buffer.duration;
  c.sources.add(src);
  src.onended = () => c.sources.delete(src);
}
