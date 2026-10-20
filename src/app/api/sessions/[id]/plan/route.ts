import { NextResponse } from "next/server";
import { errorResponse, isUuid, requireUser } from "@/lib/api";
import { getPlan } from "@/lib/practice/store";

/** The practice plan for one interview: null until scoring has queued it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const user = await requireUser(req);
    return NextResponse.json({ plan: await getPlan(id, user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}
