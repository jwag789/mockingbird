import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { MAX_ATTEMPT_CHARS, submitAttempt } from "@/lib/practice/drills";
import { getTask } from "@/lib/practice/store";

/** Submit an answer to a drill or challenge; returns the score and the updated task. */
export async function POST(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const taskId = Number((await params).taskId);
  if (!Number.isSafeInteger(taskId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { answer?: unknown } | null;
  const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
  if (answer.length < 20) return NextResponse.json({ error: "Write a full answer first." }, { status: 400 });
  if (answer.length > MAX_ATTEMPT_CHARS) return NextResponse.json({ error: "That answer is too long." }, { status: 400 });

  try {
    const user = await requireUser(req);
    const attempt = await submitAttempt(taskId, user.id, answer);
    return NextResponse.json({ attempt, task: await getTask(taskId, user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}
