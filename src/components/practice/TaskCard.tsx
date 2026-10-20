"use client";

import { Alert, Badge, Button, Card, Inline, Stack, Textarea } from "@tessera/react";
import Image from "next/image";
import { useState } from "react";
import { fetchJson } from "@/lib/client-types";
import { SKILLS } from "@/lib/practice/skills";
import type { AttemptView, TaskKind, TaskView } from "@/lib/practice/store";

const KIND: Record<TaskKind, { label: string; tone: "brand" | "accent" | "warning" | "success" }> = {
  watch: { label: "Watch", tone: "accent" },
  read: { label: "Read", tone: "brand" },
  drill: { label: "Drill", tone: "warning" },
  challenge: { label: "Challenge", tone: "success" },
};

const DIM_LABEL: Record<string, string> = {
  structure: "Structure",
  specificity: "Specificity",
  ownership: "Ownership",
  impact: "Impact",
  relevance: "Relevance",
};

export function TaskCard({ task: initial, index }: { task: TaskView; index?: number }) {
  const [task, setTask] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const done = task.status === "done";
  const beaten = task.best != null && task.baseline != null && task.best > task.baseline;

  async function patch(change: { status?: "todo" | "done"; rating?: 1 | -1 | null }) {
    setError(null);
    try {
      const { task: next } = await fetchJson<{ task: TaskView }>(`/api/practice/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(change),
      });
      setTask(next);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Card
      variant="raised"
      // A drill you just beat is a win: show it, don't fade it like a finished chore.
      className={done && !beaten ? "mb-task mb-task-done" : "mb-task"}
      eyebrow={
        <Inline gap={2} align="center">
          <Badge tone={KIND[task.kind].tone}>{KIND[task.kind].label}</Badge>
          <span className="mb-muted mb-small">{SKILLS[task.skill]?.label ?? task.skill}</span>
        </Inline>
      }
      title={
        <span className="mb-task-title">
          {index != null && <span className="mb-task-num">{index + 1}</span>}
          {task.title}
        </span>
      }
      actions={beaten ? <span className="mb-win">Beaten</span> : done ? <Badge tone="success">Done</Badge> : undefined}
    >
      <Stack gap={4}>
        <p className="mb-task-why">{task.why}</p>

        {task.evidence?.quote && (
          <blockquote className="mb-quote">
            &ldquo;{task.evidence.quote}&rdquo;
            {task.evidence.dimension && task.evidence.score != null && (
              <span className="mb-quote-tag">
                {DIM_LABEL[task.evidence.dimension]} {task.evidence.score}/5
              </span>
            )}
          </blockquote>
        )}

        {task.resource?.kind === "video" && <Video resource={task.resource} onPlay={() => !done && patch({ status: "done" })} />}
        {task.resource?.kind === "article" && <Article resource={task.resource} onOpen={() => !done && patch({ status: "done" })} />}
        {(task.kind === "drill" || task.kind === "challenge") && task.prompt && (
          <Attempt task={task} onScored={setTask} />
        )}

        {error && <Alert tone="danger">{error}</Alert>}

        <Inline justify="between" align="center" wrap>
          <Button variant="ghost" size="sm" onClick={() => patch({ status: done ? "todo" : "done" })}>
            {done ? "Mark not done" : "Mark done"}
          </Button>
          {task.resource && (
            <Inline gap={2} align="center">
              <span className="mb-muted mb-small">Helpful?</span>
              <button
                type="button"
                className="mb-vote"
                aria-pressed={task.rating === 1}
                aria-label="Helpful"
                onClick={() => patch({ rating: task.rating === 1 ? null : 1 })}
              >
                👍
              </button>
              <button
                type="button"
                className="mb-vote"
                aria-pressed={task.rating === -1}
                aria-label="Not helpful"
                onClick={() => patch({ rating: task.rating === -1 ? null : -1 })}
              >
                👎
              </button>
            </Inline>
          )}
        </Inline>
      </Stack>
    </Card>
  );
}

function Video({ resource, onPlay }: { resource: NonNullable<TaskView["resource"]>; onPlay: () => void }) {
  const [playing, setPlaying] = useState(false);
  const id = new URL(resource.url).searchParams.get("v");
  if (!id) return null;

  return (
    <div className="mb-video">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={resource.title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className="mb-video-thumb"
          onClick={() => {
            setPlaying(true);
            onPlay();
          }}
          aria-label={`Play ${resource.title}`}
        >
          <Image src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" fill sizes="(max-width: 760px) 100vw, 640px" />
          <span className="mb-play" aria-hidden />
        </button>
      )}
      <div className="mb-resource-meta">
        <strong>{resource.title}</strong>
        <span className="mb-muted mb-small">
          {[resource.source, minutes(resource.durationS), monthYear(resource.publishedAt)].filter(Boolean).join(" · ")}
        </span>
        <span className="mb-small">{resource.summary}</span>
      </div>
    </div>
  );
}

function Article({ resource, onOpen }: { resource: NonNullable<TaskView["resource"]>; onOpen: () => void }) {
  return (
    <a className="mb-article" href={resource.url} target="_blank" rel="noopener noreferrer" onClick={onOpen}>
      <span className="mb-muted mb-small">
        {[resource.source, monthYear(resource.publishedAt)].filter(Boolean).join(" · ")}
      </span>
      <strong>{resource.title} ↗</strong>
      <span className="mb-small">{resource.summary}</span>
    </a>
  );
}

function Attempt({ task, onScored }: { task: TaskView; onScored: (t: TaskView) => void }) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<AttemptView | null>(task.lastAttempt);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchJson<{ attempt: AttemptView; task: TaskView }>(`/api/practice/tasks/${task.id}/attempts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      setLatest(res.attempt);
      setAnswer("");
      onScored(res.task);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const target = task.kind === "drill" && task.dimension ? DIM_LABEL[task.dimension] : "Design";

  return (
    <Stack gap={3}>
      <div className="mb-prompt">{task.prompt}</div>

      {latest && <AttemptResult attempt={latest} target={target} attempts={task.attempts} />}

      <Textarea
        label={latest ? "Try again" : task.kind === "drill" ? "Your answer" : "Your design"}
        hint={
          task.kind === "drill"
            ? `Scored on ${target.toLowerCase()} only${task.baseline != null ? `. Beat your interview score of ${task.baseline}/5` : ""}.`
            : "Write it the way you'd talk it through. Aim for 10-15 minutes."
        }
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={task.kind === "drill" ? 6 : 10}
        autoResize
        disabled={busy}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      <div>
        <Button variant="primary" onClick={submit} loading={busy} disabled={answer.trim().length < 20}>
          {busy ? "Scoring…" : "Submit for scoring"}
        </Button>
      </div>
    </Stack>
  );
}

function AttemptResult({ attempt, target, attempts }: { attempt: AttemptView; target: string; attempts: number }) {
  const { score, baseline, feedback } = attempt;
  const delta = baseline != null ? score - baseline : null;
  return (
    <div className="mb-attempt" data-improved={delta != null && delta > 0}>
      <div className="mb-attempt-score">
        {baseline != null && (
          <>
            <span className="mb-muted">{baseline}</span>
            <span aria-hidden>→</span>
          </>
        )}
        <strong className="mb-pop">{score}</strong>
        <span className="mb-muted">/ 5 {target.toLowerCase()}</span>
        {delta != null && delta !== 0 && (
          <Badge tone={delta > 0 ? "success" : "danger"}>
            {delta > 0 ? "+" : ""}
            {Math.round(delta * 10) / 10} vs interview
          </Badge>
        )}
        {attempts > 1 && <span className="mb-muted mb-small">attempt {attempts}</span>}
      </div>
      <p style={{ margin: 0 }}>{feedback.rationale}</p>
      {feedback.strengths && feedback.strengths.length > 0 && (
        <p className="mb-small" style={{ margin: 0 }}>
          <strong>Strong:</strong> {feedback.strengths.join(" ")}
        </p>
      )}
      {feedback.gaps && feedback.gaps.length > 0 && (
        <p className="mb-small" style={{ margin: 0 }}>
          <strong>Missing:</strong> {feedback.gaps.join(" ")}
        </p>
      )}
      <p className="mb-small" style={{ margin: 0 }}>
        <strong>Next time:</strong> {feedback.nextStep}
      </p>
    </div>
  );
}

const minutes = (s: number | null) => (s ? `${Math.round(s / 60)} min` : null);
const monthYear = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : null;
