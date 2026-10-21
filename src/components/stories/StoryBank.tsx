"use client";

import { Alert, Badge, Button, Dialog, EmptyState, Inline, SegmentedControl, Spinner, Stack, TextField, Textarea } from "@tessera/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/client-types";
import { COMPETENCIES } from "@/lib/stories/competencies";
import { STRONG_AT, bestTelling, coverage, storyGaps, type StoryView } from "@/lib/stories/insights";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function StoryBank() {
  const [stories, setStories] = useState<StoryView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetchJson<{ stories: StoryView[] }>("/api/stories")
      .then(({ stories }) => setStories(stories))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!stories) return <Spinner label="Loading stories" />;

  if (stories.length === 0) {
    return (
      <EmptyState
        title="No stories yet"
        description="Every interview adds the real experiences you talk about here, so you can see which ones are strong and which competencies still need a story."
        actions={
          <Link href="/new">
            <Button variant="primary">Start an interview</Button>
          </Link>
        }
      />
    );
  }

  const map = coverage(stories);
  const missing = map.filter((c) => !c.story);
  const strong = (s: StoryView) => (bestTelling(s)?.score ?? 0) >= STRONG_AT && storyGaps(s).length === 0;
  const shown = stories.filter((s) => filter === "all" || (filter === "strong" ? strong(s) : !strong(s)));

  return (
    <Stack gap={6}>
      <div className="mb-dash-head">
        <div>
          <span className="mb-live-eyebrow mb-eyebrow-brand">Story bank</span>
          <h1 className="mb-plan-focus" style={{ fontSize: "2rem" }}>
            Your stories
          </h1>
          <p className="mb-muted" style={{ margin: 0 }}>
            {stories.length} {stories.length === 1 ? "story" : "stories"} from your interviews ·{" "}
            {missing.length ? `${missing.length} competencies without one yet` : "every competency covered"}
          </p>
        </div>
      </div>

      <section aria-labelledby="coverage-title">
        <h2 id="coverage-title" className="mb-section-title">
          What you can answer
        </h2>
        <p className="mb-muted mb-small" style={{ marginTop: 0 }}>
          Your strongest story for each thing interviewers probe for. Gaps are worth preparing a story for before the real
          interview.
        </p>
        <div className="mb-coverage">
          {map.map((c) => (
            <div key={c.competency} className="mb-coverage-tile" data-missing={!c.story}>
              <span className="mb-coverage-name">{COMPETENCIES[c.competency].label}</span>
              {c.story ? (
                <a href={`#story-${c.story.id}`} className="mb-coverage-story">
                  <span>{c.story.title}</span>
                  <Badge tone={c.story.score >= STRONG_AT ? "success" : "warning"}>{c.story.score.toFixed(1)}</Badge>
                </a>
              ) : (
                <span className="mb-muted mb-small">&ldquo;{COMPETENCIES[c.competency].asks}&rdquo;</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <SegmentedControl
        label="Show"
        options={[
          { value: "all", label: `All (${stories.length})` },
          { value: "work", label: "Needs work" },
          { value: "strong", label: "Strong" },
        ]}
        value={filter}
        onChange={setFilter}
      />

      <Stack gap={4}>
        {shown.map((s) => (
          <StoryCard
            key={s.id}
            story={s}
            onChange={(next) => setStories((all) => all!.map((x) => (x.id === next.id ? next : x)))}
            onDelete={() => setStories((all) => all!.filter((x) => x.id !== s.id))}
          />
        ))}
        {shown.length === 0 && <p className="mb-muted">Nothing here yet.</p>}
      </Stack>
    </Stack>
  );
}

function StoryCard({
  story,
  onChange,
  onDelete,
}: {
  story: StoryView;
  onChange: (s: StoryView) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(story.title);
  const [notes, setNotes] = useState(story.notes);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const best = bestTelling(story);
  const gaps = storyGaps(story);
  const score = best?.score ?? 0;

  async function save(change: { title?: string; notes?: string }) {
    setError(null);
    try {
      await fetchJson(`/api/stories/${story.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(change),
      });
      onChange({ ...story, ...change });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove() {
    try {
      await fetchJson(`/api/stories/${story.id}`, { method: "DELETE" });
      onDelete();
    } catch (err) {
      setError((err as Error).message);
      setConfirming(false);
    }
  }

  return (
    <article id={`story-${story.id}`} className="mb-story">
      <header className="mb-story-head">
        <div>
          {renaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (title.trim()) save({ title: title.trim() }).then(() => setRenaming(false));
              }}
            >
              <Inline gap={2} align="end">
                <TextField label="Story name" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
                <Button type="submit" size="sm" variant="primary">
                  Save
                </Button>
              </Inline>
            </form>
          ) : (
            <h3>{story.title}</h3>
          )}
          <Inline gap={2} wrap>
            {story.competencies.map((c) => (
              <Badge key={c} tone="brand">
                {COMPETENCIES[c]?.label ?? c}
              </Badge>
            ))}
          </Inline>
        </div>
        <div className="mb-story-score" title="Your best telling of this story">
          <strong>{score.toFixed(1)}</strong>
          <span>best</span>
        </div>
      </header>

      <p className="mb-story-summary">{story.summary}</p>

      <dl className="mb-star">
        <div>
          <dt>Situation</dt>
          <dd>{story.situation || "–"}</dd>
        </div>
        <div>
          <dt>What you did</dt>
          <dd>{story.action || "–"}</dd>
        </div>
        <div>
          <dt>Result</dt>
          <dd>{story.result || <span className="mb-muted">Not said yet</span>}</dd>
        </div>
      </dl>

      {story.numbers.length > 0 && (
        <Inline gap={2} wrap align="center">
          <span className="mb-muted mb-small">Numbers you&rsquo;ve used:</span>
          {story.numbers.map((n) => (
            <span key={n} className="mb-chip">
              {n}
            </span>
          ))}
        </Inline>
      )}

      {gaps.length > 0 && (
        <div className="mb-story-gaps">
          <strong>To make it stronger</strong>
          <ul className="mb-list">
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      {best && (
        <div className="mb-story-telling">
          <span className="mb-muted mb-small">
            Best telling · {best.roleTitle} · {shortDate(best.createdAt)} · told {story.mentions.length}×
          </span>
          {best.quote && <blockquote className="mb-quote">&ldquo;{best.quote}&rdquo;</blockquote>}
          <span className="mb-small">
            Asked: {best.question} · <Link href={`/interview/${best.sessionId}/report`}>Scorecard</Link>
          </span>
        </div>
      )}

      <Textarea
        label="Your notes"
        hint="Details to add next time: names, numbers, what you learned. Saved when you click away."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== story.notes && save({ notes })}
        rows={2}
        autoResize
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <Inline gap={2}>
        <Button variant="ghost" size="sm" onClick={() => setRenaming((r) => !r)}>
          {renaming ? "Cancel rename" : "Rename"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          Delete
        </Button>
      </Inline>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this story?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={remove}>
              Delete story
            </Button>
          </>
        }
      >
        &ldquo;{story.title}&rdquo; and its {story.mentions.length} telling{story.mentions.length === 1 ? "" : "s"} will be
        removed from your story bank. Your interviews and scorecards stay.
      </Dialog>
    </article>
  );
}
