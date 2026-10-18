import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = "claude-opus-5-5";

const client = new Anthropic();

export class ClaudeOutputError extends Error {}

type Effort = "low" | "medium" | "high";

/**
 * One structured Claude call: the response is parsed and validated against
 * `schema`. Refusals and unparseable output throw instead of returning
 * half-formed data.
 */
export async function structured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  effort: Effort;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    // On a safety decline, re-run on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: opts.effort,
      format: betaZodOutputFormat(opts.schema),
    },
    // The system prompt is stable across a session, so cache it.
    system: [
      { type: "text", text: opts.system, cache_control: { type: "ephemeral" } },
    ],
    messages: opts.messages,
  });

  if (response.stop_reason === "refusal") {
    throw new ClaudeOutputError(
      `Claude declined the request (${response.stop_details?.category ?? "unknown"})`,
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new ClaudeOutputError("Claude ran out of output tokens");
  }
  if (response.parsed_output == null) {
    throw new ClaudeOutputError("Claude returned output that failed validation");
  }
  return response.parsed_output;
}
