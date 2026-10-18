import { NextResponse } from "next/server";
import { errorResponse, isUuid } from "@/lib/api";
import { submitAnswer } from "@/lib/interview/conductor";

const MAX_ANSWER_CHARS = 8000;

/** Submit the candidate's answer. The client refetches the session afterwards. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { answer?: unknown } | null;
  const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
  if (!answer) return NextResponse.json({ error: "Type an answer first." }, { status: 400 });
  if (answer.length > MAX_ANSWER_CHARS) {
    return NextResponse.json({ error: "That answer is too long. Try to keep it under 5 minutes." }, { status: 400 });
  }

  try {
    await submitAnswer(id, answer);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
