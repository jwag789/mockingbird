import { NextResponse } from "next/server";
import { errorResponse, isUuid, requireUser } from "@/lib/api";
import { assertOwner, endSession } from "@/lib/interview/conductor";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const user = await requireUser(req);
    await assertOwner(id, user.id);
    await endSession(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
