"use client";

import { Alert, Badge, Button, Card, Progress, Spinner, Stack } from "@tessera/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchJson, type SessionResponse } from "@/lib/client-types";
import { STAGE_LABELS } from "@/lib/interview/stages";
import type { AnswerMetrics } from "@/lib/scoring/metrics";
import type { Dimension, QuestionReport } from "@/lib/scoring/types";

const DIMENSIONS: Array<[Dimension, string, string]> = [
  ["structure", "Structure", "A clear arc from situation to result"],
  ["specificity", "Specificity", "Real examples, names and numbers"],
  ["ownership", "Ownership", "What you did, not just the team"],
  ["impact", "Impact", "Outcomes, and evidence for them"],
  ["relevance", "Relevance", "Answers the question, fits the role"],
];
const LABEL = Object.fromEntries(DIMENSIONS.map(([d, l]) => [d, l])) as Record<Dimension, string>;

const tone = (score: number) => (score >= 4 ? "success" : score >= 3 ? "warning" : "danger");

export function Scorecard({ id }: { id: string }) {
  const [data, setData] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll until the worker has written the report.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    async function tick() {
      try {
        const next = await fetchJson<SessionResponse>(`/api/sessions/${id}`);
        if (cancelled) return;
        setData(next);
        if (!next.report && next.session.status !== "failed") timer = setTimeout(tick, 2000);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <Spinner label="Loading scorecard" />;

  const { session, report } = data;

  if (session.status === "active") {
    return (
      <Alert tone="info" title="This interview is still in progress">
        <Link href={`/interview/${id}`}>Go back to the interview</Link>
      </Alert>
    );
  }
  if (session.status === "failed") {
    return (
      <Alert tone="danger" title="Scoring failed">
        The scorer couldn&apos;t finish this interview after several tries. Check the worker logs.
      </Alert>
    );
  }
  if (!report) {
    return (
      <Card variant="flat">
        <Stack gap={3} align="center">
          <Spinner size={28} label="Scoring" />
          <p className="mb-muted" style={{ margin: 0 }}>
            Scoring each answer against the role. This takes about a minute.
          </p>
        </Stack>
      </Card>
    );
  }

  const { summary, questions, metrics } = report;

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <span className="mb-muted mb-small">
          {session.roleTitle} ·{" "}
          {new Date(session.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}
        </span>
        <div className="mb-score">
          <strong>{summary.overallScore.toFixed(1)}</strong>
          <span>/ 5</span>
        </div>
        <p style={{ fontSize: "1.25rem", margin: 0 }}>{summary.headline}</p>
      </Stack>

      <div className="mb-grid-2">
        <Card title="Practice next" variant="raised">
          <ol className="mb-list">
            {summary.priorities.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </Card>
        <Card title="What worked" variant="raised">
          <ul className="mb-list">
            {summary.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="By dimension" eyebrow="Behavioral and technical questions" variant="flat">
        <Stack gap={4}>
          {DIMENSIONS.map(([dim, label, hint]) => (
            <Progress
              key={dim}
              value={summary.dimensionAverages[dim]}
              max={5}
              label={`${label}: ${summary.dimensionAverages[dim].toFixed(1)} / 5 · ${hint}`}
            />
          ))}
        </Stack>
      </Card>

      <SpeakingMetrics metrics={metrics} />

      <Stack gap={4}>
        <h2 className="mb-section-title">Question by question</h2>
        {questions.map((q, i) => (
          <QuestionCard key={q.questionId} q={q} index={i} />
        ))}
      </Stack>

      <div>
        <Link href="/">
          <Button variant="secondary">Start another interview</Button>
        </Link>
      </div>
    </Stack>
  );
}

function SpeakingMetrics({ metrics }: { metrics: AnswerMetrics }) {
  const topFillers = Object.entries(metrics.fillerBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w, n]) => `"${w}" ×${n}`)
    .join(", ");
  return (
    <div className="mb-grid-2">
      <Card variant="flat">
        <div className="mb-stat">
          <span className="mb-muted mb-small">Filler words</span>
          <strong>{metrics.fillersPer100Words} per 100 words</strong>
          <span className="mb-muted mb-small">{topFillers || "None detected"}</span>
        </div>
      </Card>
      <Card variant="flat">
        <div className="mb-stat">
          <span className="mb-muted mb-small">&ldquo;I&rdquo; vs &ldquo;we&rdquo;</span>
          <strong>
            {metrics.ownershipRatio == null ? "n/a" : `${Math.round(metrics.ownershipRatio * 100)}% "I"`}
          </strong>
          <span className="mb-muted mb-small">
            {metrics.firstPersonSingular} &ldquo;I&rdquo; · {metrics.firstPersonPlural} &ldquo;we&rdquo; across {metrics.words} words
          </span>
        </div>
      </Card>
      {/* Voice answers only; reports from text interviews have no talk time. */}
      {metrics.wordsPerMinute != null && (
        <Card variant="flat">
          <div className="mb-stat">
            <span className="mb-muted mb-small">Pace</span>
            <strong>{metrics.wordsPerMinute} words/min</strong>
            <span className="mb-muted mb-small">
              {formatDuration(metrics.talkMs ?? 0)} of talk · about 120–160 is easy to follow
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}

function QuestionCard({ q, index }: { q: QuestionReport; index: number }) {
  const avg = q.dimensions.reduce((a, d) => a + d.score, 0) / q.dimensions.length;
  return (
    <Card
      eyebrow={`Q${index + 1} · ${STAGE_LABELS[q.stage]} · ${q.competency}`}
      title={q.question}
      actions={<Badge tone={tone(avg)}>{avg.toFixed(1)}</Badge>}
      variant="raised"
    >
      <Stack gap={5}>
        <div>
          {q.dimensions.map((d) => (
            <div key={d.dimension} className="mb-dimension">
              <strong>{LABEL[d.dimension]}</strong>
              <Badge tone={tone(d.score)}>{d.score}/5</Badge>
              <div>
                <span>{d.rationale}</span>
                {d.evidence.map((quote) => (
                  <blockquote key={quote} className="mb-quote">
                    &ldquo;{quote}&rdquo;
                  </blockquote>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mb-grid-2">
          <div>
            <h3 className="mb-section-title">Strengths</h3>
            <ul className="mb-list">
              {q.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-section-title">To improve</h3>
            <ul className="mb-list">
              {q.improvements.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <h3 className="mb-section-title">A stronger answer</h3>
          <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{q.strongerAnswer}</p>
        </div>

        {q.rejectedQuotes > 0 && (
          <span className="mb-muted mb-small">
            {q.rejectedQuotes} quote{q.rejectedQuotes === 1 ? "" : "s"} the scorer cited didn&apos;t match your
            words exactly, so {q.rejectedQuotes === 1 ? "it was" : "they were"} left out.
          </span>
        )}
      </Stack>
    </Card>
  );
}

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
