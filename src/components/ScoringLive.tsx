"use client";

import { Badge, Card, Stepper } from "@tessera/react";
import { useEffect, useState, type ReactNode } from "react";
import { STAGE_LABELS } from "@/lib/interview/stages";
import { useNow } from "./useNow";
import type { QuestionProgress, ScoringProgress } from "@/lib/scoring/progress";
import type { Dimension } from "@/lib/scoring/types";

const DIMS: Array<[Dimension, string]> = [
  ["structure", "Structure"],
  ["specificity", "Specificity"],
  ["ownership", "Ownership"],
  ["impact", "Impact"],
  ["relevance", "Relevance"],
];

// What the scorer is actually checking: the rubric, in plain words.
const LOOKING_FOR = [
  "Tracing the arc: situation, action, result",
  "Looking for names, numbers and real decisions",
  "Separating what you did from what the team did",
  "Checking for outcomes and evidence",
  "Matching your answer to what the role needs",
  "Pulling quotes and checking them against your words",
];

const STEPS = [
  { id: "queued", label: "Queued" },
  { id: "answers", label: "Scoring answers" },
  { id: "summary", label: "Writing summary" },
  { id: "done", label: "Scorecard" },
];

export const tone = (score: number) => (score >= 4 ? "success" : score >= 3 ? "warning" : "danger");

export function ScoringLive({ progress }: { progress: ScoringProgress | null }) {
  const questions = progress?.questions ?? [];
  const done = questions.filter((q) => q.state === "done");
  const verified = done.reduce((n, q) => n + (q.quotes?.length ?? 0), 0);
  const dropped = done.reduce((n, q) => n + (q.rejectedQuotes ?? 0), 0);

  const step = !progress ? 0 : progress.phase === "questions" ? 1 : progress.phase === "summary" ? 2 : 3;

  return (
    <div className="mb-live">
      <div className="mb-live-head">
        <div>
          <span className="mb-live-eyebrow">
            <span className="mb-live-dot" aria-hidden /> Live
          </span>
          <h1>Scoring your interview</h1>
        </div>
        {progress && <Elapsed since={progress.startedAt} />}
      </div>

      <Stepper steps={STEPS} current={step} label="Scoring progress" />

      <div className="mb-live-stats" aria-live="polite">
        <Stat label="Answers scored" value={`${done.length}/${questions.length || "–"}`} />
        <Stat label="Quotes verified" value={verified} />
        <Stat label="Quotes dropped" value={dropped} hint="Cited but not in your words" />
      </div>

      {!progress && (
        <Card variant="flat">
          <p className="mb-muted" style={{ margin: 0 }}>
            Waiting for the scorer to pick up your interview…
          </p>
        </Card>
      )}

      <div className="mb-live-grid">
        {questions.map((q, i) => (
          <LiveQuestion key={q.id} q={q} index={i} />
        ))}
      </div>

      {progress?.phase === "summary" && (
        <Card variant="tile" className="mb-live-summary">
          <span className="mb-typing" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          Reading across all {questions.length} answers to write your summary and what to practice next…
        </Card>
      )}
    </div>
  );
}

function LiveQuestion({ q, index }: { q: QuestionProgress; index: number }) {
  const scoring = q.state === "scoring";
  return (
    <Card
      variant="raised"
      className="mb-live-card"
      eyebrow={`Q${index + 1} · ${STAGE_LABELS[q.stage]} · ${q.competency}`}
      title={<span className="mb-clamp-2">{q.question}</span>}
      actions={
        scoring ? (
          <Badge tone="brand" live>
            Scoring
          </Badge>
        ) : (
          <span className="mb-pop">
            <Badge tone={tone(q.score ?? 0)}>{(q.score ?? 0).toFixed(1)}</Badge>
          </span>
        )
      }
    >
      <div className="mb-live-body" data-state={q.state}>
        <p className="mb-excerpt" data-reading={scoring}>
          {scoring ? q.excerpt : highlight(q.excerpt, q.quotes ?? [])}
        </p>

        <div className="mb-minibars">
          {DIMS.map(([dim, label], d) => {
            const score = q.dimensions?.[dim];
            return (
              <div key={dim} className="mb-minibar">
                <span>{label}</span>
                <div className="mb-minibar-track">
                  <div
                    className="mb-minibar-fill"
                    data-tone={score != null ? tone(score) : undefined}
                    style={{
                      width: score != null ? `${(score / 5) * 100}%` : undefined,
                      animationDelay: `${d * 120}ms`,
                      transitionDelay: `${d * 90}ms`,
                    }}
                  />
                </div>
                <b>{score ?? ""}</b>
              </div>
            );
          })}
        </div>

        {scoring && <LookingFor offset={index} />}
      </div>
    </Card>
  );
}

function LookingFor({ offset }: { offset: number }) {
  const [i, setI] = useState(offset % LOOKING_FOR.length);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % LOOKING_FOR.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <p key={i} className="mb-looking">
      {LOOKING_FOR[i]}…
    </p>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="mb-live-stat" title={hint}>
      <strong key={String(value)} className="mb-pop">
        {value}
      </strong>
      <span>{label}</span>
    </div>
  );
}

function Elapsed({ since }: { since: string }) {
  const now = useNow(100);
  if (now == null) return null;
  const s = Math.max(0, (now - new Date(since).getTime()) / 1000);
  return <span className="mb-clock">{s.toFixed(1)}s</span>;
}

/** Mark each verified quote inside the excerpt. Quotes outside the excerpt are skipped. */
function highlight(text: string, quotes: string[]): ReactNode {
  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const quote of quotes) {
    const needle = quote
      .replace(/\s+/g, " ")
      .replace(/^["'“”‘’…\s]+|["'“”‘’….,;:!?\s]+$/g, "")
      .toLowerCase();
    if (needle.length < 8) continue;
    const at = lower.indexOf(needle);
    if (at >= 0 && !ranges.some(([s, e]) => at < e && at + needle.length > s)) {
      ranges.push([at, at + needle.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);

  const out: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([s, e], k) => {
    out.push(text.slice(cursor, s));
    out.push(
      <mark key={k} className="mb-hl" style={{ animationDelay: `${300 + k * 250}ms` }}>
        {text.slice(s, e)}
      </mark>,
    );
    cursor = e;
  });
  out.push(text.slice(cursor));
  return out;
}
