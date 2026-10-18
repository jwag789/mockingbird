import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { listSessions, startSession } from "@/lib/interview/conductor";
import type { ResumeInput } from "@/lib/interview/plan";

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const LENGTHS = [10, 20, 30];

export async function GET() {
  try {
    return NextResponse.json({ sessions: await listSessions() });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Start an interview: multipart form with jobDescription, targetMinutes, and resumeText or resumeFile. */
export async function POST(req: Request) {
  const form = await req.formData();
  const jobDescription = String(form.get("jobDescription") ?? "").trim();
  const targetMinutes = Number(form.get("targetMinutes"));
  const resumeText = String(form.get("resumeText") ?? "").trim();
  const resumeFile = form.get("resumeFile");

  if (jobDescription.length < 50) return bad("Paste the full job description.");
  if (!LENGTHS.includes(targetMinutes)) return bad("Pick an interview length.");

  let resume: ResumeInput;
  if (resumeFile instanceof File && resumeFile.size > 0) {
    if (resumeFile.type !== "application/pdf") return bad("Upload your resume as a PDF.");
    if (resumeFile.size > MAX_PDF_BYTES) return bad("That PDF is over 5 MB.");
    resume = { kind: "pdf", base64: Buffer.from(await resumeFile.arrayBuffer()).toString("base64") };
  } else if (resumeText.length >= 100) {
    resume = { kind: "text", text: resumeText };
  } else {
    return bad("Add your resume: upload a PDF or paste the text.");
  }

  try {
    const id = await startSession({ resume, jobDescription, targetMinutes });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
