import { NextResponse } from "next/server";
import { errorResponse, isUuid, requireUser } from "@/lib/api";
import { pool } from "@/lib/db";
import type { SessionView } from "@/lib/client-types";
import { assertOwner, getSession } from "@/lib/interview/conductor";
import { getAnswerClips } from "@/lib/scoring/talk-time";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const user = await requireUser(req);
    await assertOwner(id, user.id);
    const { session, turns } = await getSession(id);
    const { rows } = await pool.query(
      "select model, summary, questions, metrics from reports where session_id = $1",
      [id],
    );
    // The job description and plan internals stay server-side; the client
    // only needs what it renders.
    const view: SessionView = {
      id: session.id,
      createdAt: session.createdAt,
      status: session.status,
      roleTitle: session.roleTitle,
      targetMinutes: session.targetMinutes,
      state: session.state,
      endedAt: session.endedAt,
      questions: session.plan.questions.map(({ id, stage, competency }) => ({ id, stage, competency })),
    };
    return NextResponse.json({
      session: view,
      turns,
      report: rows[0] ?? null,
      progress: session.progress,
      clips: await getAnswerClips(id),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
