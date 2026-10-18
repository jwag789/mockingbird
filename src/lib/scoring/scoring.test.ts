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
