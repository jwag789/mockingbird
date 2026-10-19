// Messages between the interview room and the voice server. Audio travels as
// binary frames: mono PCM16 up (mic, at the rate in the URL's `rate`), 24 kHz
// mono PCM16 down (TTS). Everything else is JSON.

/** Mic rates Deepgram Flux accepts. The browser sends its native rate when it's one of these, so there's no resampling. */
export const MIC_SAMPLE_RATES = [8_000, 16_000, 24_000, 44_100, 48_000];
/** The rate the browser resamples to otherwise. */
export const MIC_SAMPLE_RATE = 16_000;
export const TTS_SAMPLE_RATE = 24_000;

export type VoiceState = "connecting" | "listening" | "thinking" | "speaking";

export type ClientMessage =
  /** Speak the interviewer's latest line (sent when voice mode starts). */
  | { type: "speak_last" }
  /** The candidate pressed "Done answering": end the turn now. */
  | { type: "end_turn" }
  /** The browser finished playing the reply audio. */
  | { type: "playback_done" };

export type TurnLatency = {
  /** Last spoken word to end-of-turn event: how long turn detection waited. */
  endOfTurnMs: number | null;
  /** Claude judging the answer plus the engine and the database write. */
  conductorMs: number;
  /** Speak request to the first audio chunk from the TTS. */
  ttsFirstByteMs: number | null;
  /** End-of-turn event to the first reply audio sent to the browser. */
  replyMs: number | null;
};

export type ServerMessage =
  | { type: "state"; state: VoiceState }
  /** Live transcript of the turn in progress. */
  | { type: "transcript"; text: string }
  /** The candidate's turn ended; this text goes to the interviewer as the answer. */
  | { type: "answer"; text: string }
  /** The session's turns changed; refetch them. */
  | { type: "session_updated" }
  /** All reply audio has been sent; play out what's buffered, then send playback_done. */
  | { type: "reply_audio_end" }
  /** The candidate talked over the interviewer: stop playback now. */
  | { type: "barge_in" }
  | { type: "latency"; latency: TurnLatency }
  | { type: "ended" }
  | { type: "error"; message: string };
