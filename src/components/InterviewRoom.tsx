"use client";

import {
  Alert,
  Button,
  Card,
  Inline,
  Progress,
  SegmentedControl,
  Spinner,
  Stack,
  Stepper,
  Textarea,
} from "@tessera/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { fetchJson, type SessionResponse } from "@/lib/client-types";
import { useNow } from "./useNow";
import { STAGES, STAGE_LABELS } from "@/lib/interview/stages";
import { useVoiceCall } from "./useVoiceCall";
import { VoicePanel } from "./VoicePanel";

const STEPS = STAGES.map((s) => ({ id: s, label: STAGE_LABELS[s] }));

export function InterviewRoom({ id }: { id: string }) {
  const [data, setData] = useState<SessionResponse | null>(null);
  const [answer, setAnswer] = useState("");
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"text" | "voice">("text");

  const load = useCallback(async () => {
    setData(await fetchJson<SessionResponse>(`/api/sessions/${id}`));
  }, [id]);

  // Voice is another way in and out of the same turns: the voice server
  // saves them through the same conductor, and we refetch when it does.
  const voice = useVoiceCall(id, {
    onAnswer: setPendingAnswer,
    onSessionUpdated: () => {
      load()
        .catch((err) => setError(err.message))
        .finally(() => setPendingAnswer(null));
    },
  });

  // Hang up (and release the mic) once the interview is over, however it
  // ended. If it ended by voice, let the closing line play first: the voice
  // server hangs up itself once it has.
  const stopVoice = voice.stop;
  const ended = data != null && data.session.status !== "active";
  const replying = voice.status === "thinking" || voice.status === "speaking";
  useEffect(() => {
    if (ended && !replying) stopVoice();
  }, [ended, replying, stopVoice]);

  function switchMode(next: string) {
    if (next === "voice") {
      setMode("voice");
      void voice.start();
    } else {
      voice.stop();
      setMode("text");
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchJson<SessionResponse>(`/api/sessions/${id}`)
      .then((next) => !cancelled && setData(next))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Scroll to the page bottom so the latest message sits just above the
  // sticky answer box. Jump on load; glide for new messages after that.
  const scrolledOnce = useRef(false);
  useEffect(() => {
    if (!data) return;
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: scrolledOnce.current ? "smooth" : "auto",
    });
    scrolledOnce.current = true;
  }, [data, pendingAnswer]);

  async function send() {
    const text = answer.trim();
    if (!text || pendingAnswer) return;
    setError(null);
    setPendingAnswer(text);
    setAnswer("");
    try {
      await fetchJson(`/api/sessions/${id}/turns`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answer: text }),
      });
      await load();
    } catch (err) {
      const e = err as Error & { status?: number };
      // 409: the session moved on (another tab, a double submit). Show the real state.
      if (e.status === 409) await load();
      else setAnswer(text);
      setError(e.message);
    } finally {
      setPendingAnswer(null);
    }
  }

  async function end() {
    setEnding(true);
    try {
      await fetchJson(`/api/sessions/${id}/end`, { method: "POST" });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnding(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  }

  if (!data) {
    return error ? <Alert tone="danger">{error}</Alert> : <Spinner label="Loading interview" />;
  }

  const { session, turns } = data;
  const active = session.status === "active";
  const current = session.questions[session.state.questionIndex];
  const stepIndex = active ? STAGES.indexOf(current.stage) : STEPS.length;
  // Don't switch modes while an answer is with the interviewer.
  const busy = !!pendingAnswer || voice.status === "thinking";

  return (
    <Stack gap={6}>
      <div className="mb-room-header">
        <h1>{session.roleTitle}</h1>
        {active && <Clock startedAt={session.state.startedAt} targetMinutes={session.targetMinutes} />}
      </div>

      <Stepper steps={STEPS} current={stepIndex} label="Interview stages" />
      {active && (
        <Progress
          value={session.state.questionIndex + 1}
          max={session.questions.length}
          label={`Question ${session.state.questionIndex + 1} of ${session.questions.length}`}
        />
      )}

      <div className="mb-transcript" aria-live="polite">
        {turns.map((t) => (
          <div key={t.seq} className="mb-bubble" data-speaker={t.speaker}>
            <span className="mb-bubble-label">{t.speaker === "interviewer" ? "Interviewer" : "You"}</span>
            {t.content}
          </div>
        ))}
        {pendingAnswer && (
          <>
            <div className="mb-bubble" data-speaker="candidate" data-pending="true">
              <span className="mb-bubble-label">You</span>
              {pendingAnswer}
            </div>
            <div className="mb-thinking">
              <Spinner size={16} label="Interviewer is thinking" />
              <span>Interviewer is thinking…</span>
            </div>
          </>
        )}
      </div>

      {error && (
        <Alert tone="danger" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {active ? (
        <div className="mb-composer">
          <Stack gap={3}>
            <div className="mb-composer-mode">
              <SegmentedControl
                label="Answer by"
                size="sm"
                value={mode}
                onChange={switchMode}
                options={[
                  { value: "text", label: "Typing", disabled: busy && mode !== "text" },
                  { value: "voice", label: "Speaking", disabled: busy && mode !== "voice" },
                ]}
              />
            </div>
            {mode === "voice" ? (
              <VoicePanel voice={voice} onEnd={end} ending={ending} />
            ) : (
              <>
                <Textarea
                  label="Your answer"
                  hint="⌘ Enter to send. Answer the way you would out loud."
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={5}
                  autoResize
                  disabled={!!pendingAnswer}
                />
                <Inline justify="between">
                  <Button variant="ghost" onClick={end} loading={ending} disabled={!!pendingAnswer}>
                    End interview
                  </Button>
                  <Button variant="primary" onClick={send} disabled={!answer.trim() || !!pendingAnswer}>
                    Send answer
                  </Button>
                </Inline>
              </>
            )}
          </Stack>
        </div>
      ) : (
        <Card title="Interview complete" variant="tile">
          <Stack gap={3}>
            <p className="mb-muted" style={{ margin: 0 }}>
              Your answers are being scored against the role. It takes about a minute.
            </p>
            <div>
              <Link href={`/interview/${id}/report`}>
                <Button variant="primary">See your scorecard</Button>
              </Link>
            </div>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

function Clock({ startedAt, targetMinutes }: { startedAt: string; targetMinutes: number }) {
  const now = useNow(1000);
  if (now == null) return null;
  const elapsed = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  return (
    <span className="mb-clock" data-over={elapsed > targetMinutes * 60}>
      {mm}:{ss} / {targetMinutes}:00
    </span>
  );
}
