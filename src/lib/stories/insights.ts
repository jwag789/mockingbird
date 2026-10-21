// What to fix in each story, and which competencies have no story yet.
// Pure, so it's unit tested and usable on the client.
import { COMPETENCY_IDS, type Competency } from "./competencies";

export type Mention = {
  sessionId: string;
  roleTitle: string;
  createdAt: string;
  question: string;
  quote: string;
  score: number;
  scores: Partial<Record<"structure" | "specificity" | "ownership" | "impact" | "relevance", number>>;
};

export type StoryView = {
  id: number;
  title: string;
  summary: string;
  situation: string;
  action: string;
  result: string;
  competencies: Competency[];
  numbers: string[];
  notes: string;
  updatedAt: string;
  mentions: Mention[];
};

export const STRONG_AT = 3.5;

/** The best time the story was told. */
export function bestTelling(story: StoryView): Mention | null {
  return story.mentions.reduce<Mention | null>((best, m) => (!best || m.score > best.score ? m : best), null);
}

/** Concrete fixes, judged on the best telling so one rough run doesn't count against it. */
export function storyGaps(story: StoryView): string[] {
  const best = bestTelling(story);
  const s = best?.scores ?? {};
  const gaps: string[] = [];
  if (!story.result.trim()) gaps.push("Say how it ended: the result is missing.");
  if (story.numbers.length === 0) gaps.push("Add one number that shows the result.");
  else if ((s.impact ?? 5) < 3) gaps.push("Make the result land: say what changed and why it mattered.");
  if ((s.ownership ?? 5) < 3) gaps.push("Make your own role clearer: say \"I\", not just \"we\".");
  if ((s.structure ?? 5) < 3) gaps.push("Tell it in order: situation, what you did, result.");
  if ((s.specificity ?? 5) < 3) gaps.push("Add a concrete detail: a name, a constraint, a decision.");
  return gaps;
}

export type Coverage = { competency: Competency; story: { id: number; title: string; score: number } | null };

/** For each competency, the strongest story that shows it, or null if there's none yet. */
export function coverage(stories: StoryView[]): Coverage[] {
  return COMPETENCY_IDS.map((competency) => {
    const best = stories
      .filter((s) => s.competencies.includes(competency))
      .map((s) => ({ id: s.id, title: s.title, score: bestTelling(s)?.score ?? 0 }))
      .sort((a, b) => b.score - a.score)[0];
    return { competency, story: best ?? null };
  });
}
