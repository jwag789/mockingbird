import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getTask, updateTask } from "@/lib/practice/store";

/** Mark a task done or not, and/or rate it: { status?: "todo" | "done", rating?: 1 | -1 | null }. */
export async function PATCH(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const taskId = Number((await params).taskId);
  if (!Number.isSafeInteger(taskId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { status?: unknown; rating?: unknown } | null;
  const status = body?.status === "todo" || body?.status === "done" ? body.status : undefined;
  const rating = body?.rating === 1 || body?.rating === -1 || body?.rating === null ? body.rating : undefined;
  if (status === undefined && rating === undefined) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  try {
    const user = await requireUser(req);
    await updateTask(taskId, user.id, { status, rating });
    return NextResponse.json({ task: await getTask(taskId, user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}
