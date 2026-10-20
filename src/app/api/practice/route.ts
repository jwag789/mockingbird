import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { listPlans } from "@/lib/practice/store";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return NextResponse.json({ plans: await listPlans(user.id) });
  } catch (err) {
    return errorResponse(err);
  }
}
