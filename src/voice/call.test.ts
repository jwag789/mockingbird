import { describe, expect, it, vi } from "vitest";
import type { Turn } from "../lib/interview/types";
import { VoiceCall } from "./call";
import type { SttEvent } from "./deepgram";
import { isEcho } from "./echo";
import type { ServerMessage } from "./protocol";

const QUESTION = "Tell me about a time you had to push back on a deadline.";
const FOLLOW_UP = "What did your manager say when you raised it?";

function setup(reply: Partial<Turn> = {}) {
  const turns: Turn[] = [{ seq: 0, speaker: "interviewer", questionId: "q1", kind: "question", content: QUESTION }];
  const sent: ServerMessage[] = [];
  let clock = 0;
  const interview = {
    submitAnswer: vi.fn(async (_id: string, answer: string) => {
      clock += 1500;
      turns.push(
        { seq: turns.length, speaker: "candidate", questionId: "q1", kind: "answer", content: answer },
        { seq: turns.length + 1, speaker: "interviewer", questionId: "q1", kind: "follow_up", content: FOLLOW_UP, ...reply },
      );
    }),
    getTurns: vi.fn(async () => [...turns]),
    recordAnswer: vi.fn(async () => {}),
  };
  const stt = { sendAudio: vi.fn(), endTurn: vi.fn(), close: vi.fn() };
  const tts = { speak: vi.fn(), clear: vi.fn(), close: vi.fn() };
  const call = new VoiceCall({
    sessionId: "s1",
    stt,
    tts,
    interview,
    send: (m) => sent.push(m),
    sendAudio: vi.fn(),
    describeError: (err) => (err as Error).message,
    log: () => {},
    now: () => clock,
  });
  call.start();
  const states = () => sent.filter((m) => m.type === "state").map((m) => (m as { state: string }).state);
  return { call, sent, states, stt, tts, interview, tick: (ms: number) => (clock += ms) };
}

function ev(event: SttEvent["event"], turnIndex: number, transcript: string, audioSentMs = 0): SttEvent {
  const words = transcript
    .split(" ")
    .filter(Boolean)
    .map((word, i) => ({ word, startMs: 1000 + i * 400, endMs: 1300 + i * 400 }));
  return { event, turnIndex, transcript, words, audioSentMs };
}

describe("VoiceCall", () => {
  it("sends a finished turn through the conductor and speaks the saved reply", async () => {
    const { call, interview, tts, states, sent } = setup();
    await call.onStt(ev("StartOfTurn", 0, "So"));
    await call.onStt(ev("EndOfTurn", 0, "So I told my manager we needed two more weeks", 5500));

    expect(interview.submitAnswer).toHaveBeenCalledWith("s1", "So I told my manager we needed two more weeks");
    // The answer's word timings go along, for talk time and playback.
    expect(interview.recordAnswer).toHaveBeenCalledWith("s1", expect.any(String), expect.arrayContaining([expect.objectContaining({ startMs: 1000 })]));
    expect((interview.recordAnswer.mock.calls[0] as unknown[])[2]).toHaveLength(10);
    expect(tts.speak).toHaveBeenCalledWith(FOLLOW_UP);
    expect(states()).toEqual(["listening", "thinking", "speaking"]);
    expect(sent).toContainEqual({ type: "session_updated" });
  });

  it("reports latency when the first reply audio arrives", async () => {
    const { call, sent, tick } = setup();
    await call.onStt(ev("EndOfTurn", 0, "We shipped it late", 3000)); // last word ends at 2500
    tick(300);
    call.onTtsAudio(Buffer.alloc(4));
    expect(sent.find((m) => m.type === "latency")).toEqual({
      type: "latency",
      latency: { endOfTurnMs: 500, conductorMs: 1500, ttsFirstByteMs: 300, replyMs: 1800 },
    });
  });

  it("stops the interviewer when the candidate talks over it", async () => {
    const { call, tts, sent, states } = setup();
    await call.onClientMessage({ type: "speak_last" });
    expect(tts.speak).toHaveBeenCalledWith(QUESTION);

    await call.onStt(ev("StartOfTurn", 0, "Sorry can you repeat that"));
    expect(tts.clear).toHaveBeenCalled();
    expect(sent).toContainEqual({ type: "barge_in" });
    expect(states().at(-1)).toBe("listening");
    call.onTtsAudio(Buffer.alloc(4));
    expect(sent.filter((m) => m.type === "latency")).toHaveLength(0);
  });

  it("ignores the interviewer's own voice coming back through the mic", async () => {
    const { call, tts, interview, states } = setup();
    await call.onClientMessage({ type: "speak_last" });
    await call.onStt(ev("StartOfTurn", 0, "tell me about a time"));
    await call.onStt(ev("Update", 0, "tell me about a time you had to push"));
    expect(tts.clear).not.toHaveBeenCalled();

    await call.onClientMessage({ type: "playback_done" });
    await call.onStt(ev("EndOfTurn", 0, "tell me about a time you had to push back"));
    expect(interview.submitAnswer).not.toHaveBeenCalled();
    expect(states().at(-1)).toBe("listening");
  });

  it("drops speech that starts while the interviewer is thinking, like a disabled text box", async () => {
    const { call, interview } = setup();
    let release!: () => void;
    interview.submitAnswer.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    const first = call.onStt(ev("EndOfTurn", 0, "First answer"));
    await call.onStt(ev("StartOfTurn", 1, "Oh and also"));
    release();
    await first;
    await call.onClientMessage({ type: "playback_done" });
    await call.onStt(ev("EndOfTurn", 1, "Oh and also one more thing"));
    expect(interview.submitAnswer).toHaveBeenCalledTimes(1);
  });

  it("still hears the next answer after silent updates arrive while thinking", async () => {
    const { call, interview } = setup();
    let release!: () => void;
    interview.submitAnswer.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    const first = call.onStt(ev("EndOfTurn", 0, "First answer"));
    await call.onStt(ev("Update", 1, ""));
    release();
    await first;
    await call.onClientMessage({ type: "playback_done" });
    await call.onStt(ev("StartOfTurn", 1, "Second"));
    await call.onStt(ev("EndOfTurn", 1, "Second answer"));
    expect(interview.submitAnswer).toHaveBeenCalledTimes(2);
  });

  it("ends the call after the closing line plays", async () => {
    const { call, sent } = setup({ kind: "closing", content: "Thanks, that's all I had." });
    await call.onStt(ev("EndOfTurn", 0, "I'd like to stop here"));
    await call.onClientMessage({ type: "playback_done" });
    expect(sent.at(-1)).toEqual({ type: "ended" });
    await call.onStt(ev("EndOfTurn", 1, "hello"));
  });

  it("goes back to listening when the conductor fails", async () => {
    const { call, interview, sent, states } = setup();
    interview.submitAnswer.mockRejectedValueOnce(new Error("The interview moved on."));
    await call.onStt(ev("EndOfTurn", 0, "An answer"));
    expect(sent).toContainEqual({ type: "error", message: "The interview moved on." });
    expect(states().at(-1)).toBe("listening");
  });

  it("forwards Done answering to the speech-to-text only while listening", async () => {
    const { call, stt } = setup();
    await call.onClientMessage({ type: "end_turn" });
    expect(stt.endTurn).toHaveBeenCalledTimes(1);
    await call.onClientMessage({ type: "speak_last" });
    await call.onClientMessage({ type: "end_turn" });
    expect(stt.endTurn).toHaveBeenCalledTimes(1);
  });
});

describe("isEcho", () => {
  it("matches a garbled transcript of what was said", () => {
    expect(isEcho("tell me about the time you had to push back", QUESTION)).toBe(true);
  });

  it("doesn't match an answer that reuses the question's words", () => {
    expect(isEcho("I had a deadline once and I pushed back on it", QUESTION)).toBe(false);
    expect(isEcho("wait", QUESTION)).toBe(false);
  });
});
