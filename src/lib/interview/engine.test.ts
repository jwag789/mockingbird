import { describe, expect, it } from "vitest";
import { FOLLOW_UP_LIMITS, initialState, nextStep, normalizePlan, questionMix, stageTransition } from "./engine";
import type { InterviewPlan, PlanOutput, Stage } from "./types";

const q = (stage: Stage, text = `${stage} question`) => ({
  stage,
  text,
  whyAsked: "",
  competency: "x",
  lookFor: [],
});

const rawPlan = (questions: PlanOutput["questions"]): PlanOutput => ({
  roleTitle: "Engineer",
  candidateSummary: "",
  focusAreas: [],
  questions,
});

const T0 = new Date("2026-01-01T10:00:00Z");
const minutesLater = (m: number) => new Date(T0.getTime() + m * 60_000);

// 20 minutes: intro, 2 behavioral, 1 technical, closing.
const plan: InterviewPlan = normalizePlan(
  rawPlan([q("intro"), q("behavioral"), q("behavioral"), q("technical"), q("closing")]),
  20,
);

describe("normalizePlan", () => {
  it("puts one intro first and one closing last, in stage order, with stable ids", () => {
    const p = normalizePlan(
      rawPlan([q("technical"), q("closing"), q("behavioral"), q("intro"), q("intro"), q("behavioral")]),
      20,
    );
    expect(p.questions.map((x) => x.stage)).toEqual(["intro", "behavioral", "behavioral", "technical", "closing"]);
    expect(p.questions.map((x) => x.id)).toEqual(["q1", "q2", "q3", "q4", "q5"]);
  });

  it("adds a default intro and closing when Claude leaves them out", () => {
    const p = normalizePlan(rawPlan([q("behavioral"), q("technical")]), 10);
    expect(p.questions[0].stage).toBe("intro");
    expect(p.questions.at(-1)!.stage).toBe("closing");
  });

  it("trims extra questions to fit the time", () => {
    const many = Array.from({ length: 6 }, () => q("behavioral"));
    const p = normalizePlan(rawPlan([q("intro"), ...many, q("technical"), q("closing")]), 10);
    const mix = questionMix(10);
    expect(p.questions.length).toBe(2 + mix.behavioral + mix.technical);
  });

  it("gives unused technical slots to behavioral questions", () => {
    const p = normalizePlan(rawPlan([q("intro"), q("behavioral"), q("behavioral"), q("behavioral"), q("closing")]), 20);
    expect(p.questions.filter((x) => x.stage === "behavioral").length).toBe(3);
  });
});

describe("nextStep", () => {
  const at = (questionIndex: number, followUpsUsed = 0) => ({
    ...initialState(T0),
    questionIndex,
    followUpsUsed,
  });

  it("allows a follow-up while the stage has budget", () => {
    const step = nextStep({ plan, state: at(1), judgment: { intent: "follow_up" }, targetMinutes: 20, now: minutesLater(5) });
    expect(step.action).toBe("follow_up");
    expect(step.state.followUpsUsed).toBe(1);
  });

  it("overrules a follow-up once the stage's limit is used", () => {
    const step = nextStep({
      plan,
      state: at(1, FOLLOW_UP_LIMITS.behavioral),
      judgment: { intent: "follow_up" },
      targetMinutes: 20,
      now: minutesLater(5),
    });
    expect(step.action).toBe("advance");
    expect(step.state).toMatchObject({ questionIndex: 2, followUpsUsed: 0 });
  });

  it("skips follow-ups when behind schedule", () => {
    // Question 2 of 5 in a 20-minute interview should be done by ~8 minutes.
    const step = nextStep({ plan, state: at(1), judgment: { intent: "follow_up" }, targetMinutes: 20, now: minutesLater(12) });
    expect(step.action).toBe("advance");
  });

  it("jumps to the closing question when time is up", () => {
    const step = nextStep({ plan, state: at(1), judgment: { intent: "move_on" }, targetMinutes: 20, now: minutesLater(21) });
    expect(step.action).toBe("advance");
    if (step.action === "advance") expect(step.to.stage).toBe("closing");
  });

  it("finishes after the closing question is answered", () => {
    const step = nextStep({ plan, state: at(4), judgment: { intent: "follow_up" }, targetMinutes: 20, now: minutesLater(15) });
    expect(step.action).toBe("finish");
    expect(step.state.finished).toBe(true);
  });

  it("finishes when the candidate asks to stop", () => {
    const step = nextStep({ plan, state: at(1), judgment: { intent: "stop" }, targetMinutes: 20, now: minutesLater(2) });
    expect(step.action).toBe("finish");
  });

  it("answers clarifying questions without using the follow-up budget, up to a limit", () => {
    let state = at(1);
    for (let i = 0; i < 2; i++) {
      const step = nextStep({ plan, state, judgment: { intent: "clarify" }, targetMinutes: 20, now: minutesLater(5) });
      expect(step.action).toBe("clarify");
      expect(step.state.followUpsUsed).toBe(0);
      state = step.state;
    }
    const step = nextStep({ plan, state, judgment: { intent: "clarify" }, targetMinutes: 20, now: minutesLater(5) });
    expect(step.action).toBe("advance");
  });
});

describe("stageTransition", () => {
  it("announces new stages only", () => {
    expect(stageTransition("intro", "behavioral")).toMatch(/past experience/);
    expect(stageTransition("behavioral", "behavioral")).toBeNull();
  });
});
