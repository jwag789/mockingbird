import { NextResponse } from "next/server";
import { errorResponse, isUuid } from "@/lib/api";
import { pool } from "@/lib/db";
import type { SessionView } from "@/lib/client-types";
import { getSession } from "@/lib/interview/conductor";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
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
    });
  } catch (err) {
    return errorResponse(err);
  }
}
