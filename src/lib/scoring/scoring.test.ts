import { describe, expect, it } from "vitest";
import { verifyQuotes } from "./evidence";
import { answerMetrics, combineMetrics } from "./metrics";

describe("verifyQuotes", () => {
  const source = "So I rewrote the billing service in Go.\nIt cut p99 latency from 900ms to 120ms — we shipped it in two weeks.";

  it("accepts exact quotes despite case, whitespace, punctuation and dash differences", () => {
    const { verified, rejected } = verifyQuotes(
      ["I rewrote the billing service", '"it cut p99 latency from 900ms to 120ms - we shipped it."', "…shipped it in two weeks"],
      source,
    );
    expect(verified).toHaveLength(3);
    expect(rejected).toHaveLength(0);
  });

  it("rejects paraphrases and invented quotes", () => {
    const { verified, rejected } = verifyQuotes(
      ["I rebuilt the billing system", "reduced latency by 87%"],
      source,
    );
    expect(verified).toHaveLength(0);
    expect(rejected).toHaveLength(2);
  });

  it("rejects quotes too short to prove anything", () => {
    expect(verifyQuotes(["billing"], source).verified).toHaveLength(0);
  });
});

describe("answerMetrics", () => {
  it("counts fillers without flagging ordinary uses of 'like' and 'you know'", () => {
    const m = answerMetrics("Um, so it was, like, slow. I'd like to say it looks like you know what to do, basically.");
    expect(m.fillerBreakdown).toEqual({ um: 1, like: 1, basically: 1 });
  });

  it("measures I vs we", () => {
    const m = answerMetrics("We planned it, but I wrote the migration and I ran the rollout for our team.");
    expect(m.firstPersonSingular).toBe(2);
    expect(m.firstPersonPlural).toBe(2);
    expect(m.ownershipRatio).toBe(0.5);
  });

  it("handles empty answers", () => {
    expect(answerMetrics("").ownershipRatio).toBeNull();
    expect(combineMetrics([]).words).toBe(0);
  });
});

describe("talk time and pace", () => {
  it("only measures pace for spoken answers", () => {
    expect(answerMetrics("I typed this").wordsPerMinute).toBeNull();
    const spoken = answerMetrics("one two three four five six seven eight nine ten", { talkMs: 4000 });
    expect(spoken.talkMs).toBe(4000);
    expect(spoken.wordsPerMinute).toBe(150);
  });

  it("combines pace across spoken answers and skips typed ones", () => {
    const m = combineMetrics([
      answerMetrics("one two three four five six seven eight nine ten", { talkMs: 4000 }),
      answerMetrics("a typed answer that has no timing at all"),
      answerMetrics("one two three four five", { talkMs: 4000 }),
    ]);
    expect(m.words).toBe(24);
    expect(m.talkMs).toBe(8000);
    expect(m.wordsPerMinute).toBe(113);
  });

  it("has no pace when nothing was spoken", () => {
    expect(combineMetrics([answerMetrics("typed")]).talkMs).toBeNull();
  });
});
