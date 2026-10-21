import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { listStories } from "@/lib/stories/store";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return NextResponse.json({ stories: await listStories(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}
