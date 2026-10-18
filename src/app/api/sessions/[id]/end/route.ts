import { NextResponse } from "next/server";
import { errorResponse, isUuid } from "@/lib/api";
import { endSession } from "@/lib/interview/conductor";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await endSession(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
