"use client";

import { Avatar, Badge, Button, Card, Inline, Progress, Stack, Stepper, Textarea } from "@tessera/react";
import { useState } from "react";
import { TaskCard } from "@/components/practice/TaskCard";
import { ScoringLive } from "@/components/ScoringLive";
import type { TaskView } from "@/lib/practice/store";
import type { ScoringProgress } from "@/lib/scoring/progress";

const BRANDS = [
  { id: "tessera", label: "Tessera (today)" },
  { id: "atelier", label: "Atelier (existing)" },
  { id: "graphite", label: "Graphite" },
  { id: "evergreen", label: "Evergreen" },
  { id: "dusk", label: "Dusk" },
  { id: "canopy", label: "Canopy (Evergreen + Dusk)" },
] as const;

export function ThemeLab() {
  const [brand, setBrand] = useState<(typeof BRANDS)[number]["id"]>("tessera");
  return (
    <div className="mb-lab">
      <div className="mb-lab-bar">
        <strong>Theme lab</strong>
        {BRANDS.map((b) => (
          <button key={b.id} type="button" aria-pressed={brand === b.id} onClick={() => setBrand(b.id)}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="mb-lab-brand" data-brand={brand} data-theme="light">
        <Screens />
      </div>
    </div>
  );
}

function Screens() {
  return (
    <>
      <header className="mb-lab-header">
        <span className="mb-logo">Mockingbird</span>
        <nav>
          <span>Interviews</span>
          <span>Practice</span>
        </nav>
        <Avatar name="Justin Wagner" size={32} />
      </header>

      <main className="mb-main">
        <Stack gap={10}>
          <section>
            <p className="mb-lab-note">Scorecard</p>
            <div className="mb-lab-row">
              <Stack gap={3}>
                <span className="mb-muted mb-small">Senior Full-Stack Engineer · October 20</span>
                <div className="mb-score">
                  <strong>3.4</strong>
                  <span>/ 5</span>
                </div>
                <p style={{ fontSize: "1.2rem", margin: 0, lineHeight: 1.45 }}>
                  Your system design was solid once pressed, but your stories open vague and need follow-ups to
                  reveal what you personally did.
                </p>
                <Inline gap={2} wrap>
                  <span className="mb-win">+1.0 impact since last interview</span>
                  <Badge tone="success">3 drills beaten</Badge>
                </Inline>
              </Stack>
              <Card title="Practice next" variant="raised">
                <ol className="mb-list">
                  <li>Lead every answer with the concrete version first.</li>
                  <li>Put one number on every result.</li>
                  <li>Prepare a direct &ldquo;why this team, why now&rdquo; answer.</li>
                </ol>
              </Card>
            </div>
            <Card title="By dimension" variant="flat" style={{ marginTop: "var(--space-5)" }}>
              <Stack gap={3}>
                <Progress value={3.0} max={5} label="Structure: 3.0 / 5" />
                <Progress value={4.0} max={5} label="Specificity: 4.0 / 5" />
                <Progress value={2.5} max={5} label="Impact: 2.5 / 5" />
              </Stack>
            </Card>
          </section>

          <section>
            <p className="mb-lab-note">Live scoring</p>
            <ScoringLive progress={PROGRESS} />
          </section>

          <section>
            <p className="mb-lab-note">Practice plan</p>
            <Stack gap={4}>
              <TaskCard task={DRILL} index={0} />
              <TaskCard task={READ} index={1} />
            </Stack>
          </section>

          <section>
            <p className="mb-lab-note">Interview room</p>
            <Stack gap={5}>
              <Stepper
                steps={[
                  { id: "intro", label: "Intro" },
                  { id: "behavioral", label: "Behavioral" },
                  { id: "technical", label: "Technical" },
                  { id: "closing", label: "Wrap-up" },
                ]}
                current={1}
                label="Interview stages"
              />
              <div className="mb-transcript">
                <div className="mb-bubble" data-speaker="interviewer">
                  <span className="mb-bubble-label">Interviewer</span>
                  Tell me about a time you raised the technical bar on a team.
                </div>
                <div className="mb-bubble" data-speaker="candidate">
                  <span className="mb-bubble-label">You</span>
                  When we started the staffing platform, I noticed the team was building pages in jQuery, so I moved us
                  to React and ran weekly pairing sessions.
                </div>
                <div className="mb-bubble" data-speaker="interviewer">
                  <span className="mb-bubble-label">Interviewer</span>
                  What changed as a result, and how did you know?
                </div>
              </div>
              <Textarea label="Your answer" hint="⌘ Enter to send." rows={3} />
              <Inline justify="between">
                <Button variant="ghost">End interview</Button>
                <Button variant="primary">Send answer</Button>
              </Inline>
            </Stack>
          </section>
        </Stack>
      </main>
    </>
  );
}

const PROGRESS: ScoringProgress = {
  startedAt: new Date(Date.now() - 14_000).toISOString(),
  phase: "questions",
  questions: [
    {
      id: "q2",
      question: "Tell me about a time you raised the technical bar on a team.",
      stage: "behavioral",
      competency: "Technical leadership",
      excerpt:
        "When we started the staffing platform, I noticed the team was building pages in jQuery, so I moved us to React and ran weekly pairing sessions. Pages that took a week took a day.",
      state: "done",
      score: 3.6,
      dimensions: { structure: 4, specificity: 4, ownership: 4, impact: 3, relevance: 3 },
      quotes: ["I moved us to React and ran weekly pairing sessions", "Pages that took a week took a day"],
      rejectedQuotes: 0,
    },
    {
      id: "q3",
      question: "Design a pipeline that turns a contractor's voice notes and photos into a repair estimate.",
      stage: "technical",
      competency: "System design",
      excerpt:
        "I'd capture audio and photos offline, sync them in chunks to object storage with timestamps, transcribe with a streaming speech-to-text API, and link photos to what was said around the same moment.",
      state: "scoring",
    },
  ],
};

const DRILL: TaskView = {
  id: 1,
  sessionId: "lab",
  kind: "drill",
  skill: "quantifying-impact",
  title: "Re-answer the React migration story with one hard number",
  why: "Impact averaged 2.5/5: the outcome was real but unmeasured.",
  evidence: { questionId: "q2", question: "", dimension: "impact", score: 2, quote: "There were also way less bugs" },
  resource: null,
  prompt: "Tell me about a time you raised the technical bar on a team.\n\nAnswer again in under 2 minutes, and end with one number that shows the result.",
  dimension: "impact",
  baseline: 2,
  status: "done",
  rating: null,
  attempts: 2,
  best: 4,
  lastAttempt: {
    score: 4,
    baseline: 2,
    createdAt: new Date().toISOString(),
    feedback: {
      rationale: "You named a clear, measurable outcome: page delivery went from five days to one, and regressions halved.",
      quotes: [],
      nextStep: "Say how you measured the regressions, so the number sounds earned.",
    },
  },
};

const READ: TaskView = {
  id: 2,
  sessionId: "lab",
  kind: "read",
  skill: "specific-examples",
  title: "See what a specific STAR answer sounds like",
  why: "Your answers name tools but skip the decisions you made.",
  evidence: null,
  resource: {
    kind: "article",
    title: "Behavioral Interviewing & The STAR Approach",
    url: "https://www.northwestern.edu/careers/jobs-internships/interviewing/the-star-approach.html",
    source: "Northwestern University",
    summary: "Structure answers around one real situation, your actions and a concrete result.",
    durationS: null,
    publishedAt: null,
  },
  prompt: null,
  dimension: null,
  baseline: null,
  status: "todo",
  rating: null,
  attempts: 0,
  best: null,
  lastAttempt: null,
};
