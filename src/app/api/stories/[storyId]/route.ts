import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { deleteStory, updateStory } from "@/lib/stories/store";

type Ctx = { params: Promise<{ storyId: string }> };

/** Rename a story or edit its notes: { title?, notes? }. */
export async function PATCH(req: Request, { params }: Ctx) {
  const id = Number((await params).storyId);
  if (!Number.isSafeInteger(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { title?: unknown; notes?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 80) : undefined;
  const notes = typeof body?.notes === "string" ? body.notes.slice(0, 4000) : undefined;
  if (title === "" || (title === undefined && notes === undefined)) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }
  try {
    const user = await requireUser(req);
    await updateStory(id, user.id, { title, notes });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const id = Number((await params).storyId);
  if (!Number.isSafeInteger(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const user = await requireUser(req);
    await deleteStory(id, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
