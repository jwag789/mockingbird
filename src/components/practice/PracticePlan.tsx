"use client";

import { Card, Progress, Stack } from "@tessera/react";
import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/client-types";
import type { PlanView } from "@/lib/practice/store";
import { TaskCard } from "./TaskCard";

/** The practice plan on a scorecard. Polls while the coach is still building it. */
export function PracticePlan({ sessionId }: { sessionId: string }) {
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    async function tick() {
      try {
        const { plan } = await fetchJson<{ plan: PlanView | null }>(`/api/sessions/${sessionId}/plan`);
        if (cancelled) return;
        setPlan(plan);
        // No plan row a while after scoring means none is coming (e.g. an old interview).
        if (!plan && ++tries > 5) return setGone(true);
        if (!plan || plan.status === "building") timer = setTimeout(tick, 2500);
      } catch {
        if (!cancelled) setGone(true);
      }
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionId]);

  if (gone && !plan) return null;

  if (!plan || plan.status === "building") {
    return (
      <Card variant="tile" className="mb-live-summary">
        <span className="mb-typing" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        Building your practice plan from this scorecard…
      </Card>
    );
  }
  if (plan.status === "failed") return null;

  const done = plan.tasks.filter((t) => t.status === "done").length;

  return (
    <section className="mb-plan mb-reveal" aria-labelledby="plan-title">
      <Stack gap={4}>
        <div>
          <span className="mb-live-eyebrow" style={{ color: "var(--lapis)" }}>
            Your practice plan
          </span>
          <h2 id="plan-title" className="mb-plan-focus">
            {plan.focus}
          </h2>
          <Progress value={done} max={plan.tasks.length} label={`${done} of ${plan.tasks.length} done`} tone="success" />
        </div>
        {plan.tasks.map((t, i) => (
          <TaskCard key={t.id} task={t} index={i} />
        ))}
      </Stack>
    </section>
  );
}
