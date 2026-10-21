// One voice call: a small state machine between the candidate's mic, the
// interview conductor and the interviewer's voice. It has no I/O of its own;
// the server wires in Deepgram, the conductor and the browser socket, and
// tests wire in fakes.
//
//   listening ──EndOfTurn──▶ thinking ──reply saved──▶ speaking ──playback_done──▶ listening
//       ▲                                                  │
//       └────────────── candidate talks (barge-in) ────────┘
//
// The interview logic isn't here: an answer goes through the same
// submitAnswer() as text mode, and the reply is whatever turn it saved.
import type { Turn } from "../lib/interview/types";
import type { SpeechToText, SttEvent, SttWord, TextToSpeech } from "./deepgram";
import { isEcho } from "./echo";
import type { ClientMessage, ServerMessage, TurnLatency, VoiceState } from "./protocol";

export type InterviewPort = {
  submitAnswer(sessionId: string, answer: string): Promise<void>;
  getTurns(sessionId: string): Promise<Turn[]>;
  /** Talk time, and the audio for playback, for an answer that was just saved. */
  recordAnswer(sessionId: string, answer: string, words: SttWord[]): Promise<void>;
};

export type CallDeps = {
  sessionId: string;
  stt: SpeechToText;
  tts: TextToSpeech;
  interview: InterviewPort;
  send: (msg: ServerMessage) => void;
  sendAudio: (pcm16: Buffer) => void;
  describeError: (err: unknown) => string;
  log: (event: Record<string, unknown>) => void;
  now?: () => number;
};

type Speaking = {
  requestedAt: number;
  firstAudio: boolean;
  /** Set when this reply answers a turn, for the latency record. */
  turn: { endedAt: number; endOfTurnMs: number | null; conductorMs: number } | null;
};

export class VoiceCall {
  private state: VoiceState = "listening";
  private ended = false;
  private speaking: Speaking | null = null;
  /** What the interviewer last said, to tell echo from the candidate. */
  private lastSpoken = "";
  /** Turns the candidate started while the interviewer was thinking; dropped, like a disabled text box. */
  private ignoredTurns = new Set<number>();
  /** Turns first heard while the interviewer was talking; may be echo. */
  private overlappingTurns = new Set<number>();
  private now: () => number;

  constructor(private deps: CallDeps) {
    this.now = deps.now ?? Date.now;
  }

  start() {
    this.deps.send({ type: "state", state: this.state });
  }

  onAudio(pcm16: Buffer) {
    if (!this.ended) this.deps.stt.sendAudio(pcm16);
  }

  async onClientMessage(msg: ClientMessage) {
    switch (msg.type) {
      case "speak_last": {
        if (this.state !== "listening") return;
        const last = (await this.deps.interview.getTurns(this.deps.sessionId)).at(-1);
        if (this.state !== "listening" || last?.speaker !== "interviewer") return;
        if (last.kind === "closing") this.ended = true;
        this.speak(last.content, null);
        return;
      }
      case "end_turn":
        if (this.state === "listening") this.deps.stt.endTurn();
        return;
      case "playback_done":
        if (this.state !== "speaking") return;
        this.speaking = null;
        if (this.ended) return this.deps.send({ type: "ended" });
        this.setState("listening");
        return;
    }
  }

  async onStt(ev: SttEvent) {
    if (this.ended || this.ignoredTurns.has(ev.turnIndex)) return;

    if (this.state === "thinking") {
      // Flux sends updates for the next turn even in silence; only drop a
      // turn the candidate actually started talking in.
      if (ev.transcript) this.ignoredTurns.add(ev.turnIndex);
      return;
    }

    if (this.state === "speaking") {
      this.overlappingTurns.add(ev.turnIndex);
      if (!ev.transcript || isEcho(ev.transcript, this.lastSpoken)) return;
      this.overlappingTurns.delete(ev.turnIndex);
      this.bargeIn();
      if (this.ended) return;
    }

    if (ev.event !== "EndOfTurn") {
      this.deps.send({ type: "transcript", text: ev.transcript });
      return;
    }

    // A turn that began under the interviewer's voice and is still just its
    // words was echo all along.
    const echo = this.overlappingTurns.delete(ev.turnIndex) && isEcho(ev.transcript, this.lastSpoken);
    if (!ev.transcript || echo) {
      this.deps.send({ type: "transcript", text: "" });
      return;
    }
    await this.submit(ev);
  }

  onTtsAudio(pcm16: Buffer) {
    const s = this.speaking;
    if (!s || this.state !== "speaking") return;
    if (!s.firstAudio) {
      s.firstAudio = true;
      const at = this.now();
      const ttsFirstByteMs = at - s.requestedAt;
      if (s.turn) {
        const latency: TurnLatency = {
          endOfTurnMs: s.turn.endOfTurnMs,
          conductorMs: s.turn.conductorMs,
          ttsFirstByteMs,
          replyMs: at - s.turn.endedAt,
        };
        this.deps.send({ type: "latency", latency });
        this.deps.log({ event: "turn_latency", ...latency });
      } else {
        this.deps.log({ event: "tts_latency", ttsFirstByteMs });
      }
    }
    this.deps.sendAudio(pcm16);
  }

  onTtsDone() {
    if (this.state === "speaking") this.deps.send({ type: "reply_audio_end" });
  }

  onTtsError(err: unknown) {
    this.deps.send({ type: "error", message: "The interviewer's voice dropped out. The reply is in the transcript." });
    this.deps.log({ event: "tts_error", error: String(err) });
    if (this.state !== "speaking") return;
    this.speaking = null;
    if (this.ended) return this.deps.send({ type: "ended" });
    this.setState("listening");
  }

  private bargeIn() {
    this.deps.tts.clear();
    this.speaking = null;
    this.deps.send({ type: "barge_in" });
    this.deps.log({ event: "barge_in" });
    if (this.ended) return this.deps.send({ type: "ended" });
    this.setState("listening");
  }

  private async submit(ev: SttEvent) {
    const endedAt = this.now();
    const first = ev.words[0];
    const last = ev.words.at(-1);
    const endOfTurnMs = last ? Math.max(0, Math.round(ev.audioSentMs - last.endMs)) : null;

    this.setState("thinking");
    this.deps.send({ type: "answer", text: ev.transcript });

    let reply: Turn | undefined;
    let conductorMs: number;
    try {
      await this.deps.interview.submitAnswer(this.deps.sessionId, ev.transcript);
      conductorMs = this.now() - endedAt;
      // Save it before replying: if this answer ended the interview, the worker is about to score it.
      if (first && last) {
        await this.deps.interview
          .recordAnswer(this.deps.sessionId, ev.transcript, ev.words)
          .catch((err) => this.deps.log({ event: "answer_record_error", error: String(err) }));
      }
      reply = (await this.deps.interview.getTurns(this.deps.sessionId)).at(-1);
    } catch (err) {
      this.deps.send({ type: "error", message: this.deps.describeError(err) });
      this.deps.send({ type: "session_updated" });
      this.setState("listening");
      return;
    }

    this.deps.send({ type: "session_updated" });
    if (reply?.speaker !== "interviewer") return this.setState("listening");
    if (reply.kind === "closing") this.ended = true;
    this.speak(reply.content, { endedAt, endOfTurnMs, conductorMs });
  }

  private speak(text: string, turn: Speaking["turn"]) {
    this.lastSpoken = text;
    this.speaking = { requestedAt: this.now(), firstAudio: false, turn };
    this.setState("speaking");
    this.deps.tts.speak(text.replace(/\s+/g, " ").trim());
  }

  private setState(state: VoiceState) {
    if (this.state === state) return;
    this.state = state;
    this.deps.send({ type: "state", state });
  }
}
