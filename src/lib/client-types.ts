// Shapes the browser receives from GET /api/sessions/[id].
import type { SessionStatus } from "./interview/conductor";
import type { InterviewState, Stage, Turn } from "./interview/types";
import type { Report } from "./scoring/types";

export type SessionView = {
  id: string;
  createdAt: string;
  status: SessionStatus;
  roleTitle: string;
  targetMinutes: number;
  state: InterviewState;
  endedAt: string | null;
  questions: Array<{ id: string; stage: Stage; competency: string }>;
};

export type SessionResponse = {
  session: SessionView;
  turns: Turn[];
  report: Report | null;
};

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw Object.assign(new Error(body?.error ?? `Request failed (${res.status})`), { status: res.status });
  }
  return (res.status === 204 ? null : await res.json()) as T;
}
