import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { ClaudeOutputError } from "./claude";
import { ConflictError, NotFoundError } from "./interview/conductor";

/** Map domain errors to HTTP responses so route handlers stay small. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof NotFoundError) return json(404, err.message);
  if (err instanceof ConflictError) return json(409, err.message);
  if (err instanceof Anthropic.RateLimitError) return json(503, "The interviewer is busy. Try again in a moment.");
  if (err instanceof Anthropic.AuthenticationError) return json(500, "The Anthropic API key is missing or invalid.");
  if (err instanceof ClaudeOutputError || err instanceof Anthropic.APIError) {
    console.error(err);
    return json(502, "The interviewer had trouble responding. Try again.");
  }
  console.error(err);
  return json(500, "Something went wrong.");
}

function json(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
