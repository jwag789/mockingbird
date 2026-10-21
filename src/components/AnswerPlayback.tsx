"use client";

import { Button } from "@tessera/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { annotate, formatTime } from "@/lib/playback/annotate";
import type { ClipWord } from "@/lib/scoring/talk-time";

const SPEEDS = [1, 1.25, 1.5];

/**
 * Plays back one spoken answer with its transcript: the word being said is
 * lit, words the scorer quoted are highlighted, fillers and hedges are
 * underlined, and clicking any word jumps there.
 */
export function AnswerPlayback({
  sessionId,
  seq,
  label,
  durationMs,
  words,
  quotes,
}: {
  sessionId: string;
  seq: number;
  label: string;
  durationMs: number;
  words: ClipWord[];
  quotes: string[];
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);
  const marked = useMemo(() => annotate(words, quotes), [words, quotes]);

  // Follow the audio frame by frame while it plays; timeupdate is too coarse to light words.
  useEffect(() => {
    if (!playing) return;
    let frame = requestAnimationFrame(function tick() {
      if (audio.current) setNowMs(audio.current.currentTime * 1000);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  function toggle() {
    const el = audio.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => setFailed(true));
    else el.pause();
  }

  function seek(ms: number, play = true) {
    const el = audio.current;
    if (!el) return;
    el.currentTime = Math.max(0, ms) / 1000;
    setNowMs(ms);
    if (play && el.paused) el.play().catch(() => setFailed(true));
  }

  function onWordClick(e: MouseEvent<HTMLParagraphElement>) {
    const start = (e.target as HTMLElement).closest<HTMLElement>(".mb-w")?.dataset.start;
    if (start != null) seek(Number(start));
  }

  function onBar(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - rect.left) / rect.width) * durationMs, false);
  }

  function onBarKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") seek(nowMs + 5000, false);
    else if (e.key === "ArrowLeft") seek(nowMs - 5000, false);
    else return;
    e.preventDefault();
  }

  const counts = {
    quote: marked.some((w) => w.quote),
    filler: marked.filter((w) => w.filler).length,
    hedge: marked.filter((w) => w.hedge).length,
  };

  return (
    <div className="mb-playback">
      <audio
        ref={audio}
        src={`/api/sessions/${sessionId}/audio/${seq}`}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setNowMs(durationMs);
        }}
        onError={() => setFailed(true)}
      />
      <div className="mb-playback-bar">
        <Button size="sm" variant="primary" onClick={toggle} disabled={failed} aria-label={playing ? `Pause ${label}` : `Play ${label}`}>
          {playing ? "Pause" : "Play"}
        </Button>
        <span className="mb-playback-label">{label}</span>
        <div
          className="mb-playback-track"
          role="slider"
          tabIndex={0}
          aria-label={`${label} position`}
          aria-valuemin={0}
          aria-valuemax={Math.round(durationMs / 1000)}
          aria-valuenow={Math.round(nowMs / 1000)}
          aria-valuetext={`${formatTime(nowMs)} of ${formatTime(durationMs)}`}
          onPointerDown={onBar}
          onKeyDown={onBarKey}
        >
          <div className="mb-playback-fill" style={{ width: `${Math.min(100, (nowMs / durationMs) * 100)}%` }} />
        </div>
        <span className="mb-playback-time">
          {formatTime(nowMs)} / {formatTime(durationMs)}
        </span>
        <button
          type="button"
          className="mb-playback-speed"
          onClick={() => {
            const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
            setSpeed(next);
            if (audio.current) audio.current.playbackRate = next;
          }}
          aria-label={`Playback speed ${speed}×`}
        >
          {speed}×
        </button>
      </div>

      {failed && <p className="mb-muted mb-small">This recording couldn&rsquo;t be played.</p>}

      {/* Plain text with real spaces, so it reads and copies as a transcript.
          Clicking a word seeks there; keyboard users seek with the slider above. */}
      <p className="mb-playback-words" onClick={onWordClick}>
        {marked.map((w, i) => (
          <span key={i}>
            <span
              className="mb-w"
              data-start={w.s}
              data-active={nowMs >= w.s && nowMs < w.e}
              data-said={nowMs >= w.e}
              data-quote={w.quote}
              data-filler={w.filler}
              data-hedge={w.hedge}
            >
              {w.w}
            </span>{" "}
          </span>
        ))}
      </p>

      {(counts.quote || counts.filler > 0 || counts.hedge > 0) && (
        <div className="mb-playback-legend mb-small">
          {counts.quote && (
            <span>
              <i className="mb-key mb-key-quote" /> quoted in your score
            </span>
          )}
          {counts.filler > 0 && (
            <span>
              <i className="mb-key mb-key-filler" /> filler words ({counts.filler})
            </span>
          )}
          {counts.hedge > 0 && (
            <span>
              <i className="mb-key mb-key-hedge" /> hedges ({counts.hedge})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
