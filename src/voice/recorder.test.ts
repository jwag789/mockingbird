import { describe, expect, it } from "vitest";
import { AnswerRecorder, CLIP_RATE, encodeMp3 } from "./recorder";

/** A chunk of 16-bit PCM where every sample holds `value`. */
const chunk = (rate: number, ms: number, value: number) => {
  const buf = Buffer.alloc(Math.round((rate * ms) / 1000) * 2);
  for (let i = 0; i < buf.length; i += 2) buf.writeInt16LE(value, i);
  return buf;
};

describe("AnswerRecorder", () => {
  it("cuts the right span on the call clock, across chunks, from 48 kHz", () => {
    const rec = new AnswerRecorder(48_000);
    // 1s of silence, then 1s at 1000, then 1s at 2000, in 100ms chunks.
    for (let t = 0; t < 10; t++) rec.append(chunk(48_000, 100, 0));
    for (let t = 0; t < 10; t++) rec.append(chunk(48_000, 100, 1000));
    for (let t = 0; t < 10; t++) rec.append(chunk(48_000, 100, 2000));

    const clip = rec.clip(1500, 2500);
    expect(clip.length).toBe(CLIP_RATE); // one second at 16 kHz
    expect(clip[0]).toBe(1000);
    expect(clip[clip.length - 1]).toBe(2000);
  });

  it("keeps time at 44.1 kHz, which doesn't divide evenly", () => {
    const rec = new AnswerRecorder(44_100);
    for (let t = 0; t < 30; t++) rec.append(chunk(44_100, 100, 500));
    // 3s in: within a sample or two of 48,000 samples at 16 kHz.
    expect(Math.abs(rec.clip(0, 3000).length - 3 * CLIP_RATE)).toBeLessThanOrEqual(2);
  });

  it("clamps a clip to the audio it has", () => {
    const rec = new AnswerRecorder(16_000);
    rec.append(chunk(16_000, 500, 7));
    expect(rec.clip(-200, 9000).length).toBe(8000);
    expect(rec.clip(800, 900).length).toBe(0);
  });
});

describe("encodeMp3", () => {
  it("produces MP3 frames", async () => {
    const tone = Int16Array.from({ length: CLIP_RATE }, (_, i) => Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / CLIP_RATE)));
    const mp3 = await encodeMp3(tone);
    expect(mp3.length).toBeGreaterThan(1000);
    // MPEG audio frame sync: 11 set bits.
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1] & 0xe0).toBe(0xe0);
  });
});
