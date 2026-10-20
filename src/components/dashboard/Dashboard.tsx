"use client";

import { Badge, Button, Card, Progress } from "@tessera/react";
import Link from "next/link";
import type { DashboardData } from "@/lib/dashboard";
import { SKILLS } from "@/lib/practice/skills";
import type { Dimension } from "@/lib/scoring/types";
import { useNow } from "../useNow";
import { NextInterview } from "./NextInterview";
import { TrendChart } from "./TrendChart";

const DIMS: Array<[Dimension, string, string]> = [
  ["structure", "Structure", "a clear arc from situation to result"],
  ["specificity", "Specificity", "real examples, names and numbers"],
  ["ownership", "Ownership", "what you did, not just the team"],
  ["impact", "Impact", "outcomes, and evidence for them"],
  ["relevance", "Relevance", "answering the question for this role"],
];

const KIND = { watch: "Watch", read: "Read", drill: "Drill", challenge: "Challenge" } as const;

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function Dashboard({ data, name }: { data: DashboardData; name: string }) {
  const { history, recent, upNext, openTasks, latestPlan, week, streak, upcoming } = data;
  const latest = history.at(-1);
  const previous = history.at(-2);
  const delta = latest && previous ? Math.round((latest.overall - previous.overall) * 10) / 10 : null;
  const weakest = latest
    ? DIMS.map(([d, label, hint]) => ({ d, label, hint, score: latest.dimensions[d] })).sort((a, b) => a.score - b.score)[0]
    : null;

  return (
    <div className="mb-dash">
      <header className="mb-dash-head">
        <div>
          <span className="mb-live-eyebrow mb-eyebrow-brand">Dashboard</span>
          <h1>
            <Greeting /> {name.split(" ")[0]}
          </h1>
          <p className="mb-muted">{subline(streak, openTasks)}</p>
        </div>
        <Link href="/new">
          <Button variant="primary" size="lg">
            New mock interview
          </Button>
        </Link>
      </header>

      {!latest ? (
        <FirstRun />
      ) : (
        <>
          <section className="mb-dash-top">
            <Card variant="raised" className="mb-dash-hero">
              <span className="mb-dash-label">Readiness</span>
              <div className="mb-hero-figure">
                <strong>{latest.overall.toFixed(1)}</strong>
                <span>/ 5</span>
              </div>
              {delta != null && delta > 0 && <span className="mb-win">↑ {delta.toFixed(1)} since last interview</span>}
              {delta != null && delta <= 0 && (
                <span className="mb-muted mb-small">
                  {delta === 0 ? "Same as" : `↓ ${Math.abs(delta).toFixed(1)} from`} last interview
                </span>
              )}
              {delta == null && <span className="mb-muted mb-small">From your first interview</span>}
              {history.length > 1 && (
                <TrendChart
                  name="Readiness"
                  height={64}
                  showTicks={false}
                  points={history.map((h) => ({ label: shortDate(h.createdAt), sub: h.roleTitle, value: h.overall }))}
                />
              )}
            </Card>

            <NextInterview upcoming={upcoming} openTasks={openTasks} />

            <Card variant="raised" className="mb-dash-week">
              <span className="mb-dash-label">This week</span>
              <dl>
                <div>
                  <dt>Interviews</dt>
                  <dd>{week.interviews}</dd>
                </div>
                <div>
                  <dt>Tasks done</dt>
                  <dd>{week.tasksDone}</dd>
                </div>
                <div>
                  <dt>Drills beaten</dt>
                  <dd>{week.drillsBeaten}</dd>
                </div>
                <div>
                  <dt>Day streak</dt>
                  <dd>{streak}</dd>
                </div>
              </dl>
            </Card>
          </section>

          <section className="mb-dash-mid">
            <Card variant="raised" className="mb-dash-next" title="Up next" actions={<Link href="/practice">All practice</Link>}>
              {latestPlan && (
                <div className="mb-dash-plan">
                  <p>{latestPlan.focus}</p>
                  <Progress
                    value={latestPlan.done}
                    max={latestPlan.total}
                    label={`${latestPlan.done} of ${latestPlan.total} tasks done in your latest plan`}
                    tone="success"
                  />
                </div>
              )}
              {upNext.length === 0 ? (
                <p className="mb-muted" style={{ margin: 0 }}>
                  Nothing open. Run another interview to get a fresh plan.
                </p>
              ) : (
                <ul className="mb-dash-tasks">
                  {upNext.map((t) => (
                    <li key={t.id}>
                      <Link href={`/practice#task-${t.id}`}>
                        <Badge tone={t.kind === "drill" ? "warning" : t.kind === "challenge" ? "success" : "brand"}>
                          {KIND[t.kind]}
                        </Badge>
                        <span>
                          <strong>{t.title}</strong>
                          <span className="mb-muted mb-small">{SKILLS[t.skill]?.label ?? t.skill}</span>
                        </span>
                        <span aria-hidden className="mb-dash-arrow">
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {weakest && (
              <Card variant="tile" className="mb-dash-lever">
                <span className="mb-dash-label">Biggest lever</span>
                <div className="mb-hero-figure mb-hero-small">
                  <strong>{weakest.score.toFixed(1)}</strong>
                  <span>{weakest.label.toLowerCase()}</span>
                </div>
                <p>
                  Your lowest score last time was {weakest.label.toLowerCase()}: {weakest.hint}. Lifting it moves your
                  readiness most.
                </p>
                <Link href="/practice">Practice it →</Link>
              </Card>
            )}
          </section>

          <section aria-labelledby="trend-title">
            <div className="mb-dash-section-head">
              <h2 id="trend-title" className="mb-section-title">
                How you&rsquo;re trending
              </h2>
              <span className="mb-muted mb-small">
                Behavioral and technical answers, last {history.length} interview{history.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mb-dash-trends">
              {DIMS.map(([d, label]) => {
                const first = history[0].dimensions[d];
                const now = latest.dimensions[d];
                const change = Math.round((now - first) * 10) / 10;
                return (
                  <Card key={d} variant="flat" className="mb-dash-trend">
                    <div className="mb-dash-trend-head">
                      <span>{label}</span>
                      {history.length > 1 && change !== 0 && (
                        <span className={change > 0 ? "mb-up" : "mb-down"}>
                          {change > 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}
                        </span>
                      )}
                    </div>
                    <TrendChart
                      name={label}
                      points={history.map((h) => ({ label: shortDate(h.createdAt), sub: h.roleTitle, value: h.dimensions[d] }))}
                    />
                  </Card>
                );
              })}
            </div>
            <details className="mb-dash-table">
              <summary>Show as a table</summary>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Interview</th>
                    <th scope="col">Overall</th>
                    {DIMS.map(([d, label]) => (
                      <th key={d} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <th scope="row">
                        {shortDate(h.createdAt)} · {h.roleTitle}
                      </th>
                      <td>{h.overall.toFixed(1)}</td>
                      {DIMS.map(([d]) => (
                        <td key={d}>{h.dimensions[d].toFixed(1)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>
        </>
      )}

      {recent.length > 0 && (
        <Card variant="flat" title="Recent interviews">
          {recent.map((s) => (
            <Link
              key={s.id}
              href={s.status === "active" ? `/interview/${s.id}` : `/interview/${s.id}/report`}
              className="mb-row-link"
            >
              <span>
                <strong>{s.roleTitle}</strong>
                <br />
                <span className="mb-muted mb-small">{shortDate(s.createdAt)}</span>
              </span>
              {s.overallScore != null ? (
                <span className="mb-dash-score">{s.overallScore.toFixed(1)}</span>
              ) : (
                <Badge tone={s.status === "active" ? "brand" : s.status === "failed" ? "danger" : "warning"}>
                  {s.status === "active" ? "In progress" : s.status === "failed" ? "Scoring failed" : "Scoring"}
                </Badge>
              )}
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}

/** Time of day comes from the browser's clock, so it's rendered after hydration. */
function Greeting() {
  const now = useNow(60_000);
  if (now == null) return <>Welcome back,</>;
  const hour = new Date(now).getHours();
  return <>{hour < 12 ? "Good morning," : hour < 18 ? "Good afternoon," : "Good evening,"}</>;
}

function subline(streak: number, openTasks: number): string {
  const parts = [];
  if (streak > 1) parts.push(`${streak} days in a row`);
  if (openTasks > 0) parts.push(`${openTasks} practice task${openTasks === 1 ? "" : "s"} waiting`);
  return parts.length ? parts.join(" · ") : "Pick up where you left off.";
}

function FirstRun() {
  const steps = [
    ["Interview", "A mock interview built from your resume and the real job description."],
    ["Scorecard", "Every answer scored, with quotes from what you actually said."],
    ["Practice", "A plan for what held you back, and drills that prove you improved."],
  ];
  return (
    <Card variant="raised" className="mb-dash-first">
      <h2 className="mb-plan-focus">Your first interview takes about 10 minutes.</h2>
      <ol>
        {steps.map(([title, body], i) => (
          <li key={title}>
            <span className="mb-task-num">{i + 1}</span>
            <span>
              <strong>{title}</strong>
              <span className="mb-muted">{body}</span>
            </span>
          </li>
        ))}
      </ol>
      <div>
        <Link href="/new">
          <Button variant="primary" size="lg">
            Start your first interview
          </Button>
        </Link>
      </div>
    </Card>
  );
}
