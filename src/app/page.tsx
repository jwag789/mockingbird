import Link from "next/link";
import { headers } from "next/headers";
import { Suspense } from "react";
import { Badge, Card, Stack } from "@tessera/react";
import { SetupForm } from "@/components/SetupForm";
import { getUser } from "@/lib/auth";
import { listSessions, type SessionStatus } from "@/lib/interview/conductor";

const STATUS: Record<SessionStatus, { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" }> = {
  active: { label: "In progress", tone: "brand" },
  ended: { label: "Scoring", tone: "warning" },
  scoring: { label: "Scoring", tone: "warning" },
  scored: { label: "Scored", tone: "success" },
  failed: { label: "Scoring failed", tone: "danger" },
};

export default function Home() {
  return (
    <Stack gap={8}>
      <div className="mb-hero">
        <h1>Practice the interview before the interview.</h1>
        <p>
          Mockingbird reads your resume and the job description, asks the questions that role would
          ask, pushes back when an answer is vague, and scores every answer with quotes from what you
          said.
        </p>
      </div>

      <SetupForm />

      <Suspense>
        <PastInterviews />
      </Suspense>
    </Stack>
  );
}

async function PastInterviews() {
  // Reading the request's cookies also keeps this out of the build-time cache.
  const user = await getUser(await headers());
  if (!user) return null;
  const sessions = await listSessions(user.id, 10);
  if (sessions.length === 0) return null;

  return (
    <Card title="Past interviews" variant="flat">
      {sessions.map((s) => (
        <Link
          key={s.id}
          href={s.status === "active" ? `/interview/${s.id}` : `/interview/${s.id}/report`}
          className="mb-row-link"
        >
          <span>
            <strong>{s.roleTitle}</strong>
            <br />
            <span className="mb-muted mb-small">
              {new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </span>
          {s.overallScore != null ? (
            <Badge tone="success">{s.overallScore.toFixed(1)} / 5</Badge>
          ) : (
            <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
          )}
        </Link>
      ))}
    </Card>
  );
}
