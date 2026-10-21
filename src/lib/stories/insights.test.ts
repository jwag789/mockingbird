import { describe, expect, it } from "vitest";
import { bestTelling, coverage, storyGaps, type StoryView } from "./insights";

const story = (over: Partial<StoryView> = {}): StoryView => ({
  id: 1,
  title: "The sarcasm-alert fix",
  summary: "",
  situation: "Alerts were noisy",
  action: "Required quotes",
  result: "False alerts fell",
  competencies: ["ownership", "customer-focus"],
  numbers: ["1 in 3"],
  notes: "",
  updatedAt: "2026-10-20T00:00:00Z",
  mentions: [],
  ...over,
});

const mention = (score: number, scores = {}) => ({
  sessionId: "s",
  roleTitle: "Engineer",
  createdAt: "2026-10-20T00:00:00Z",
  question: "q",
  quote: "",
  score,
  scores,
});

describe("storyGaps", () => {
  it("asks for a result and a number when they're missing", () => {
    expect(storyGaps(story({ result: "", numbers: [] }))).toEqual([
      "Say how it ended: the result is missing.",
      "Add one number that shows the result.",
    ]);
  });

  it("judges the best telling, not the latest", () => {
    const s = story({ mentions: [mention(2, { ownership: 2 }), mention(4, { ownership: 4 })] });
    expect(storyGaps(s)).toEqual([]);
    expect(bestTelling(s)?.score).toBe(4);
  });

  it("flags weak ownership and structure from the best telling's scores", () => {
    const gaps = storyGaps(story({ mentions: [mention(2.5, { ownership: 2, structure: 2 })] }));
    expect(gaps).toContain("Make your own role clearer: say \"I\", not just \"we\".");
    expect(gaps).toContain("Tell it in order: situation, what you did, result.");
  });
});

describe("coverage", () => {
  it("picks the strongest story per competency and marks the rest missing", () => {
    const stories = [
      story({ id: 1, title: "A", competencies: ["ownership"], mentions: [mention(3)] }),
      story({ id: 2, title: "B", competencies: ["ownership", "conflict"], mentions: [mention(4)] }),
    ];
    const byId = Object.fromEntries(coverage(stories).map((c) => [c.competency, c.story?.title ?? null]));
    expect(byId.ownership).toBe("B");
    expect(byId.conflict).toBe("B");
    expect(byId.failure).toBeNull();
  });
});
