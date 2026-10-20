"use client";

import { Alert, Button, Card, Stack, TextField } from "@tessera/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { fetchJson } from "@/lib/client-types";
import type { UpcomingInterview } from "@/lib/dashboard";
import { useNow } from "../useNow";

/** Countdown to the real interview, and how to pace the open tasks before it. */
export function NextInterview({ upcoming, openTasks }: { upcoming: UpcomingInterview | null; openTasks: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!upcoming);
  const [company, setCompany] = useState(upcoming?.company ?? "");
  const [roleTitle, setRoleTitle] = useState(upcoming?.roleTitle ?? "");
  const [interviewOn, setInterviewOn] = useState(upcoming?.interviewOn ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(60_000);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await fetchJson("/api/upcoming", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company, roleTitle, interviewOn }),
      });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (editing || !upcoming) {
    return (
      <Card variant="raised" className="mb-dash-upcoming">
        <span className="mb-dash-label">Your real interview</span>
        <form onSubmit={save}>
          <Stack gap={3}>
            <TextField label="Company" value={company} onChange={(e) => setCompany(e.target.value)} required />
            <TextField label="Role" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} required />
            <TextField label="Date" type="date" value={interviewOn} onChange={(e) => setInterviewOn(e.target.value)} required />
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="mb-dash-actions">
              <Button type="submit" variant="primary" loading={busy}>
                Save
              </Button>
              {upcoming && (
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </Stack>
        </form>
      </Card>
    );
  }

  // Whole days until the interview, by the browser's calendar.
  const days =
    now == null
      ? null
      : Math.round((new Date(`${upcoming.interviewOn}T00:00`).getTime() - new Date(new Date(now).toDateString()).getTime()) / 86_400_000);

  return (
    <Card variant="raised" className="mb-dash-upcoming">
      <span className="mb-dash-label">Your real interview</span>
      <div className="mb-hero-figure">
        <strong>{days == null ? "–" : days < 0 ? "Done" : days === 0 ? "Today" : days}</strong>
        {days != null && days > 0 && <span>day{days === 1 ? "" : "s"} to go</span>}
      </div>
      <p className="mb-dash-upcoming-role">
        <strong>{upcoming.roleTitle}</strong> at {upcoming.company}
        <span className="mb-muted mb-small">
          {new Date(`${upcoming.interviewOn}T00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </span>
      </p>
      {days != null && days > 0 && openTasks > 0 && (
        <p className="mb-small mb-muted" style={{ margin: 0 }}>
          {openTasks} tasks left: about {Math.ceil(openTasks / days)} a day gets you there with time to spare.
        </p>
      )}
      <div>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Change
        </Button>
      </div>
    </Card>
  );
}
