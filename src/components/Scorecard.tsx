"use client";

import { Alert, Badge, Button, Card, Progress, Spinner, Stack } from "@tessera/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchJson, type SessionResponse } from "@/lib/client-types";
import type { ScoringProgress } from "@/lib/scoring/progress";
import { PracticePlan } from "./practice/PracticePlan";
import { ScoringLive } from "./ScoringLive";
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
  const [progress, setProgress] = useState<ScoringProgress | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stream scoring progress over SSE until the report exists. If the stream
  // fails, fall back to polling.
  useEffect(() => {
    let cancelled = false;
    let events: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout>;

    const load = async () => {
      const next = await fetchJson<SessionResponse>(`/api/sessions/${id}`);
      if (cancelled) return null;
      setData(next);
      if (next.progress) setProgress(next.progress);
      return next;
    };

    const finish = async () => {
      events?.close();
      const next = await load();
      if (next?.report) setRevealed(true);
    };

    const poll = async () => {
      const next = await load();
      if (next && !next.report && next.session.status !== "failed") timer = setTimeout(poll, 2000);
      else if (next?.report) setRevealed(true);
    };

    load()
      .then((first) => {
        if (!first || first.report || ["active", "failed"].includes(first.session.status)) return;
        events = new EventSource(`/api/sessions/${id}/events`);
        events.onmessage = (e) => {
          const msg = JSON.parse(e.data) as { status: string; progress: ScoringProgress | null };
          setProgress(msg.progress);
          if (msg.status === "scored" || msg.status === "failed") finish().catch((err) => setError(err.message));
        };
        // Also fires when the server closes the stream after scoring; poll()
        // then just picks up the finished report.
        events.onerror = () => {
          events?.close();
          if (!cancelled) poll().catch((err) => setError(err.message));
        };
      })
      .catch((err) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
      events?.close();
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
  if (!report) return <ScoringLive progress={progress} />;

  const { summary, questions, metrics } = report;

  return (
    <Stack gap={6} className={revealed ? "mb-reveal" : undefined}>
      <Stack gap={2}>
        <span className="mb-muted mb-small">
          {session.roleTitle} ·{" "}
          {new Date(session.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}
        </span>
        <div className="mb-score">
          <strong>{revealed ? <CountUp to={summary.overallScore} /> : summary.overallScore.toFixed(1)}</strong>
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

      <PracticePlan sessionId={id} />

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

/** Count the overall score up from zero when it's first revealed. */
function CountUp({ to }: { to: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(to);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / 1100);
      setValue(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [to]);
  return <>{value.toFixed(1)}</>;
}
