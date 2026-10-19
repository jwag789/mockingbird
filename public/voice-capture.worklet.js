// Runs on the audio thread. Converts the mic to mono PCM16 at the target rate
// and posts 80 ms chunks (the size Deepgram Flux recommends) plus a level for
// the mic meter. When the target is the context's own rate, samples pass
// straight through; otherwise they're downsampled.
const CHUNK_MS = 80;

class Capture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const targetRate = options.processorOptions?.targetRate ?? 16000;
    this.ratio = sampleRate / targetRate;
    this.chunkSamples = Math.round((targetRate * CHUNK_MS) / 1000);
    this.phase = 0;
    this.acc = 0;
    this.count = 0;
    this.energy = 0;
    this.chunk = new Int16Array(this.chunkSamples);
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      // Average the input samples that fall in each output sample: a box
      // filter, enough anti-aliasing for speech. At ratio 1 it's a copy.
      this.acc += input[i];
      this.count++;
      this.phase++;
      if (this.phase < this.ratio) continue;
      this.phase -= this.ratio;
      this.push(this.acc / this.count);
      this.acc = 0;
      this.count = 0;
    }
    return true;
  }

  push(sample) {
    const v = Math.max(-1, Math.min(1, sample));
    this.energy += v * v;
    this.chunk[this.filled++] = v < 0 ? v * 0x8000 : v * 0x7fff;
    if (this.filled < this.chunkSamples) return;
    const level = Math.sqrt(this.energy / this.chunkSamples);
    this.port.postMessage({ pcm: this.chunk.buffer, level }, [this.chunk.buffer]);
    this.chunk = new Int16Array(this.chunkSamples);
    this.filled = 0;
    this.energy = 0;
  }
}

registerProcessor("mb-capture", Capture);
