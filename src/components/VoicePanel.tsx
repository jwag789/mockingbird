"use client";

import { Alert, Badge, Button, Inline, Stack } from "@tessera/react";
import { useEffect, useRef, type RefObject } from "react";
import type { TurnLatency } from "@/voice/protocol";
import type { CallStatus, useVoiceCall } from "./useVoiceCall";

const STATUS: Record<CallStatus, { label: string; tone: "neutral" | "brand" | "success" | "accent"; live?: boolean }> = {
  off: { label: "Voice off", tone: "neutral" },
  connecting: { label: "Connecting…", tone: "neutral" },
  listening: { label: "Listening", tone: "success", live: true },
  thinking: { label: "Interviewer is thinking", tone: "brand" },
  speaking: { label: "Interviewer is speaking", tone: "accent" },
  ended: { label: "Call ended", tone: "neutral" },
};

const HINT: Partial<Record<CallStatus, string>> = {
  listening: "Answer out loud. Pause when you're done, or press Done answering.",
  speaking: "Start talking to interrupt.",
  thinking: "Hold on while the interviewer reads your answer.",
};

export function VoicePanel({
  voice,
  onEnd,
  ending,
}: {
  voice: ReturnType<typeof useVoiceCall>;
  onEnd: () => void;
  ending: boolean;
}) {
  const { status, transcript, latency, error } = voice;
  const s = STATUS[status];

  return (
    <Stack gap={3}>
      <div className="mb-voice-status">
        <Badge tone={s.tone} dot={!s.live} live={s.live}>
          {s.label}
        </Badge>
        {status !== "off" && <MicMeter level={voice.level} />}
      </div>

      {status === "off" ? (
        <Stack gap={3}>
          {error && (
            <Alert tone="danger" onDismiss={voice.clearError}>
              {error}
            </Alert>
          )}
          <p className="mb-muted" style={{ margin: 0 }}>
            The interviewer speaks its questions and listens to your answers. Headphones work best. Your
            spoken answers are recorded so you can play them back on your scorecard.
          </p>
        </Stack>
      ) : (
        <>
          <p className="mb-live-transcript" data-empty={!transcript} aria-live="polite">
            {transcript || HINT[status] || " "}
          </p>
          {error && (
            <Alert tone="danger" onDismiss={voice.clearError}>
              {error}
            </Alert>
          )}
          {latency && <LatencyLine latency={latency} />}
        </>
      )}

      <Inline justify="between">
        <Button variant="ghost" onClick={onEnd} loading={ending} disabled={status === "thinking"}>
          End interview
        </Button>
        {status === "off" ? (
          <Button variant="primary" onClick={voice.start}>
            Start voice
          </Button>
        ) : (
          <Button variant="primary" onClick={voice.endTurn} disabled={status !== "listening" || !transcript}>
            Done answering
          </Button>
        )}
      </Inline>
    </Stack>
  );
}

function LatencyLine({ latency }: { latency: TurnLatency }) {
  const sec = (ms: number | null) => (ms == null ? "?" : `${(ms / 1000).toFixed(1)}s`);
  return (
    <span className="mb-muted mb-small">
      Last reply started {sec(latency.replyMs)} after your turn ended (interviewer {sec(latency.conductorMs)} · voice{" "}
      {sec(latency.ttsFirstByteMs)})
    </span>
  );
}

/** Reads the level from a ref on each frame, so it doesn't re-render the room. */
function MicMeter({ level }: { level: RefObject<number> }) {
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let frame = requestAnimationFrame(function tick() {
      // Speech RMS sits around 0.02-0.2; scale so normal talking fills most of the bar.
      const v = Math.min(1, Math.sqrt(level.current ?? 0) * 2.2);
      if (bar.current) bar.current.style.transform = `scaleX(${v})`;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [level]);
  return (
    <span className="mb-meter" role="img" aria-label="Microphone level">
      <span ref={bar} />
    </span>
  );
}
