// Kept free of zod so client components can import it cheaply.
export const STAGES = ["intro", "behavioral", "technical", "closing"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  intro: "Intro",
  behavioral: "Behavioral",
  technical: "Technical",
  closing: "Wrap-up",
};
