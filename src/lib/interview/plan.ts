import type Anthropic from "@anthropic-ai/sdk";
import { structured } from "../claude";
import { normalizePlan } from "./engine";
import { planSystemPrompt } from "./prompts";
import { PlanOutput, type InterviewPlan } from "./types";

export type ResumeInput = { kind: "text"; text: string } | { kind: "pdf"; base64: string };

/** Read the resume and job description, and plan a targeted interview. */
export async function generatePlan(args: {
  resume: ResumeInput;
  jobDescription: string;
  targetMinutes: number;
}): Promise<InterviewPlan> {
  const resumeBlock: Anthropic.Beta.BetaContentBlockParam =
    args.resume.kind === "pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: args.resume.base64 },
          title: "Candidate resume",
        }
      : { type: "text", text: `<resume>\n${args.resume.text}\n</resume>` };

  const raw = await structured({
    schema: PlanOutput,
    system: planSystemPrompt(args.targetMinutes),
    effort: "medium",
    messages: [
      {
        role: "user",
        content: [
          resumeBlock,
          {
            type: "text",
            text: `<job_description>\n${args.jobDescription}\n</job_description>\n\nPlan the interview.`,
          },
        ],
      },
    ],
  });

  return normalizePlan(raw, args.targetMinutes);
}
