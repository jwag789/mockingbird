// Keeps the last few minutes of a call's mic audio, so a finished answer can
// be cut out for playback. Audio is resampled to 16 kHz on the way in (plenty
// for speech, a third of 48 kHz's memory). Times are ms on the same clock as
// the speech-to-text word timings: total audio sent since the call started.

export const CLIP_RATE = 16_000;
const KEEP_MS = 6 * 60_000;

export class AnswerRecorder {
  private chunks: Array<{ start: number; data: Int16Array }> = [];
  /** Output samples written so far: the recorder's clock. */
  private written = 0;
  // Resampler state carried across chunks.
  private pos = 0;
  private last = 0;
  private group: number[] = [];

  constructor(private inputRate: number) {}

  append(pcm16: Buffer) {
    const input = new Int16Array(pcm16.length >> 1);
    for (let i = 0; i < input.length; i++) input[i] = pcm16.readInt16LE(i * 2);
    const out = this.resample(input);
    if (out.length === 0) return;
    this.chunks.push({ start: this.written, data: out });
    this.written += out.length;
    const keepFrom = this.written - (KEEP_MS / 1000) * CLIP_RATE;
    while (this.chunks.length && this.chunks[0].start + this.chunks[0].data.length < keepFrom) this.chunks.shift();
  }

  /** Audio between two call times in ms, clamped to what's still kept. */
  clip(startMs: number, endMs: number): Int16Array {
    const from = Math.max(Math.floor((startMs / 1000) * CLIP_RATE), this.chunks[0]?.start ?? 0);
    const to = Math.min(Math.ceil((endMs / 1000) * CLIP_RATE), this.written);
    if (to <= from) return new Int16Array(0);
    const out = new Int16Array(to - from);
    for (const c of this.chunks) {
      const s = Math.max(from, c.start);
      const e = Math.min(to, c.start + c.data.length);
      if (e > s) out.set(c.data.subarray(s - c.start, e - c.start), s - from);
    }
    return out;
  }

  /** Start of the audio still kept, in call ms. */
  get keptFromMs(): number {
    return ((this.chunks[0]?.start ?? 0) / CLIP_RATE) * 1000;
  }

  private resample(input: Int16Array): Int16Array {
    const rate = this.inputRate;
    if (rate === CLIP_RATE) return input;
    if (rate % CLIP_RATE === 0) {
      // Whole-number factor (48 kHz → 16 kHz): average each group, which also
      // filters out most of what would alias.
      const factor = rate / CLIP_RATE;
      const out: number[] = [];
      for (const sample of input) {
        this.group.push(sample);
        if (this.group.length === factor) {
          out.push(Math.round(this.group.reduce((a, b) => a + b, 0) / factor));
          this.group = [];
        }
      }
      return Int16Array.from(out);
    }
    // Anything else (44.1 kHz, 8 kHz): linear interpolation across chunks.
    const step = rate / CLIP_RATE;
    const out: number[] = [];
    let pos = this.pos;
    while (pos < input.length) {
      const i = Math.floor(pos);
      const frac = pos - i;
      const a = i === 0 ? this.last : input[i - 1];
      const b = input[i];
      out.push(Math.round(a + (b - a) * frac));
      pos += step;
    }
    this.pos = pos - input.length;
    this.last = input[input.length - 1] ?? this.last;
    return Int16Array.from(out);
  }
}

// The package's CommonJS entry is a browser build without exports, and the
// voice server runs as CommonJS under tsx, so load the ESM build explicitly.
let lame: Promise<typeof import("@breezystack/lamejs")> | null = null;

/** Mono 16 kHz PCM to a small MP3 (32 kbps, about 240 KB a minute). */
export async function encodeMp3(samples: Int16Array): Promise<Buffer> {
  lame ??= import("@breezystack/lamejs");
  const { Mp3Encoder } = await lame;
  const encoder = new Mp3Encoder(1, CLIP_RATE, 32);
  const parts: Uint8Array[] = [];
  const BLOCK = 1152;
  for (let i = 0, n = 0; i < samples.length; i += BLOCK, n++) {
    const buf = encoder.encodeBuffer(samples.subarray(i, i + BLOCK));
    if (buf.length) parts.push(buf);
    // Yield every ~4s of audio (~20ms of work) so a long answer never stalls
    // the call's event loop, which is also streaming the interviewer's voice.
    if (n % 56 === 55) await new Promise((resolve) => setImmediate(resolve));
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(tail);
  return Buffer.concat(parts.map((p) => Buffer.from(p)));
}
