import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { clearUpcoming, setUpcoming } from "@/lib/dashboard";

/** Set the real interview you're preparing for: { company, roleTitle, interviewOn: "YYYY-MM-DD" }. */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const company = typeof body?.company === "string" ? body.company.trim().slice(0, 80) : "";
  const roleTitle = typeof body?.roleTitle === "string" ? body.roleTitle.trim().slice(0, 120) : "";
  const interviewOn = typeof body?.interviewOn === "string" ? body.interviewOn : "";
  if (!company || !roleTitle) return NextResponse.json({ error: "Add the company and role." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(interviewOn) || Number.isNaN(Date.parse(interviewOn))) {
    return NextResponse.json({ error: "Pick the interview date." }, { status: 400 });
  }
  try {
    const user = await requireUser(req);
    await setUpcoming(user.id, { company, roleTitle, interviewOn });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    await clearUpcoming(user.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
