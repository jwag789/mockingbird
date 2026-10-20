"use client";

import { Alert, Button, EmptyState, SegmentedControl, Spinner, Stack } from "@tessera/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/client-types";
import type { PlanView, TaskView } from "@/lib/practice/store";
import { TaskCard } from "./TaskCard";

/** Every practice task across the user's interviews, newest plan first. */
export function PracticeBoard() {
  const [plans, setPlans] = useState<PlanView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("todo");

  useEffect(() => {
    fetchJson<{ plans: PlanView[] }>("/api/practice")
      .then(({ plans }) => setPlans(plans))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!plans) return <Spinner label="Loading practice" />;

  const ready = plans.filter((p) => p.status === "ready");
  const all = ready.flatMap((p) => p.tasks);
  const done = all.filter((t) => t.status === "done");
  const improved = all.filter((t) => t.best != null && t.baseline != null && t.best > t.baseline);

  if (all.length === 0) {
    return (
      <EmptyState
        title="No practice yet"
        description="Finish a mock interview and Mockingbird builds a plan from your scorecard: what to watch, read and re-answer."
        actions={
          <Link href="/new">
            <Button variant="primary">Start an interview</Button>
          </Link>
        }
      />
    );
  }

  const show = (t: TaskView) => filter === "all" || t.status === filter;

  return (
    <Stack gap={6}>
      <div className="mb-room-header">
        <div>
          <span className="mb-live-eyebrow" style={{ color: "var(--lapis)" }}>Practice</span>
          <h1 className="mb-plan-focus" style={{ fontSize: "2rem" }}>What to work on</h1>
        </div>
      </div>

      <div className="mb-live-stats">
        <div className="mb-live-stat">
          <strong>{all.length - done.length}</strong>
          <span>Tasks to do</span>
        </div>
        <div className="mb-live-stat">
          <strong>{done.length}</strong>
          <span>Done</span>
        </div>
        <div className="mb-live-stat" title="Drills and challenges where you beat your interview score">
          <strong>{improved.length}</strong>
          <span>Scores beaten</span>
        </div>
      </div>

      <SegmentedControl
        label="Show"
        options={[
          { value: "todo", label: "To do" },
          { value: "done", label: "Done" },
          { value: "all", label: "All" },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {ready.map((plan) => {
        const tasks = plan.tasks.filter(show);
        if (tasks.length === 0) return null;
        return (
          <section key={plan.sessionId} className="mb-plan">
            <Stack gap={4}>
              <div>
                <span className="mb-muted mb-small">
                  {plan.roleTitle} ·{" "}
                  {new Date(plan.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ·{" "}
                  <Link href={`/interview/${plan.sessionId}/report`}>Scorecard</Link>
                </span>
                <h2 className="mb-section-title" style={{ marginTop: "var(--space-1)" }}>{plan.focus}</h2>
              </div>
              {tasks.map((t) => (
                <div key={t.id} id={`task-${t.id}`} className="mb-task-anchor">
                  <TaskCard task={t} />
                </div>
              ))}
            </Stack>
          </section>
        );
      })}
    </Stack>
  );
}
