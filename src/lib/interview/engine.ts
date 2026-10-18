// The interview's structure lives here, in plain code: which question comes
// next, how many follow-ups each stage allows, and what happens when time
// runs short. Claude judges answers; it never decides the flow on its own.
import {
  STAGES,
  type InterviewPlan,
  type InterviewState,
  type PlanOutput,
  type PlannedQuestion,
  type Stage,
  type TurnJudgment,
} from "./types";

export const FOLLOW_UP_LIMITS: Record<Stage, number> = {
  intro: 1,
  behavioral: 2,
  technical: 2,
  closing: 0,
};

export const MAX_CLARIFICATIONS = 2;

const DEFAULT_INTRO = "To start, could you walk me through your background and what draws you to this role?";
const DEFAULT_CLOSING = "That's all the questions I have. Is there anything you'd like to add, or anything you'd like to ask me?";

export const CLOSING_LINE =
  "Thanks for your time today. That's the end of the interview. Your scorecard will be ready in a minute.";

/** How many behavioral and technical questions fit in the time. */
export function questionMix(targetMinutes: number): { behavioral: number; technical: number } {
  // Roughly 4.5 minutes per core question with follow-ups, after the intro and wrap-up.
  const core = Math.max(2, Math.round((targetMinutes - 5) / 4.5));
  return { behavioral: Math.ceil(core / 2), technical: Math.floor(core / 2) };
}

/**
 * Turn Claude's plan into one the engine can rely on: exactly one intro
 * first, exactly one closing last, the right number of core questions in
 * stage order, and stable ids.
 */
export function normalizePlan(raw: PlanOutput, targetMinutes: number): InterviewPlan {
  const byStage = (stage: Stage) => raw.questions.filter((q) => q.stage === stage);
  const mix = questionMix(targetMinutes);

  const fallback = (stage: Stage, text: string) => ({
    stage,
    text,
    whyAsked: "",
    competency: stage === "intro" ? "Communication" : "Reflection",
    lookFor: [],
  });

  let behavioral = byStage("behavioral");
  let technical = byStage("technical");
  const total = mix.behavioral + mix.technical;
  // If Claude wrote too few of one kind, lend the slots to the other.
  const takeBehavioral = Math.min(behavioral.length, Math.max(mix.behavioral, total - technical.length));
  behavioral = behavioral.slice(0, takeBehavioral);
  technical = technical.slice(0, total - behavioral.length);

  const ordered = [
    byStage("intro")[0] ?? fallback("intro", DEFAULT_INTRO),
    ...behavioral,
    ...technical,
    byStage("closing")[0] ?? fallback("closing", DEFAULT_CLOSING),
  ];

  return {
    ...raw,
    questions: ordered.map((q, i): PlannedQuestion => ({ ...q, id: `q${i + 1}` })),
  };
}

export function initialState(now: Date): InterviewState {
  return {
    questionIndex: 0,
    followUpsUsed: 0,
    clarificationsUsed: 0,
    startedAt: now.toISOString(),
    finished: false,
  };
}

export type Step =
  | { action: "follow_up"; state: InterviewState }
  | { action: "clarify"; state: InterviewState }
  | { action: "advance"; state: InterviewState; from: PlannedQuestion; to: PlannedQuestion }
  | { action: "finish"; state: InterviewState };

/** Decide the next step from Claude's judgment, the plan, and the clock. */
export function nextStep(args: {
  plan: InterviewPlan;
  state: InterviewState;
  judgment: Pick<TurnJudgment, "intent">;
  targetMinutes: number;
  now: Date;
}): Step {
  const { plan, state, judgment, targetMinutes, now } = args;
  const questions = plan.questions;
  const current = questions[state.questionIndex];
  const closingIndex = questions.length - 1;

  const finish = (): Step => ({ action: "finish", state: { ...state, finished: true } });

  if (judgment.intent === "stop" || current.stage === "closing") return finish();

  const elapsedMin = (now.getTime() - new Date(state.startedAt).getTime()) / 60_000;
  const overTime = elapsedMin >= targetMinutes;
  // Behind schedule: this question has used more than its share of the clock.
  const perQuestion = targetMinutes / questions.length;
  const behind = elapsedMin > (state.questionIndex + 1) * perQuestion * 1.25;

  if (judgment.intent === "clarify" && state.clarificationsUsed < MAX_CLARIFICATIONS && !overTime) {
    return {
      action: "clarify",
      state: { ...state, clarificationsUsed: state.clarificationsUsed + 1 },
    };
  }

  if (
    judgment.intent === "follow_up" &&
    !overTime &&
    !behind &&
    state.followUpsUsed < FOLLOW_UP_LIMITS[current.stage]
  ) {
    return { action: "follow_up", state: { ...state, followUpsUsed: state.followUpsUsed + 1 } };
  }

  const nextIndex = overTime ? closingIndex : Math.min(state.questionIndex + 1, closingIndex);
  return {
    action: "advance",
    from: current,
    to: questions[nextIndex],
    state: { ...state, questionIndex: nextIndex, followUpsUsed: 0, clarificationsUsed: 0 },
  };
}

const STAGE_INTROS: Partial<Record<Stage, string>> = {
  behavioral: "Let's talk about some of your past experience.",
  technical: "Now I'd like to get into some technical questions.",
  closing: "We're coming up on time.",
};

/** The line an interviewer would say when moving into a new stage, if any. */
export function stageTransition(from: Stage, to: Stage): string | null {
  if (from === to || STAGES.indexOf(to) < STAGES.indexOf(from)) return null;
  return STAGE_INTROS[to] ?? null;
}
