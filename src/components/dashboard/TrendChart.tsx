"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export type TrendPoint = { label: string; sub?: string; value: number };

/**
 * A single-series line over interviews: 2px line, a light area wash, an end
 * dot with a surface ring, the latest value labeled at the end, and a
 * crosshair tooltip on hover or arrow keys. One series, so no legend: the
 * caller's title names it.
 */
export function TrendChart({
  points,
  domain = [1, 5],
  height = 88,
  name,
  format = (v) => v.toFixed(1),
  showTicks = true,
}: {
  points: TrendPoint[];
  domain?: [number, number];
  height?: number;
  name: string;
  format?: (v: number) => string;
  showTicks?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pad = { top: 8, right: 30, bottom: 6, left: showTicks ? 18 : 6 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : innerW);
  const y = (v: number) => pad.top + innerH - ((v - domain[0]) / (domain[1] - domain[0])) * innerH;

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const area = points.length > 1 ? `${line} L${x(points.length - 1)},${y(domain[0])} L${x(0)},${y(domain[0])} Z` : "";
  const last = points.length - 1;
  const ticks = [domain[0], (domain[0] + domain[1]) / 2, domain[1]];

  function onPointer(e: PointerEvent<SVGSVGElement>) {
    if (points.length < 2) return setActive(0);
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left - pad.left) / innerW;
    setActive(Math.max(0, Math.min(last, Math.round(rel * last))));
  }

  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const from = active ?? last;
    setActive(Math.max(0, Math.min(last, from + (e.key === "ArrowRight" ? 1 : -1))));
  }

  const summary =
    points.length > 1
      ? `${name}: ${format(points[0].value)} to ${format(points[last].value)} across ${points.length} interviews`
      : `${name}: ${format(points[0]?.value ?? 0)}`;
  const shown = active != null ? points[active] : null;

  return (
    <div ref={wrap} className="mb-trend" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={summary}
          tabIndex={0}
          onPointerMove={onPointer}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(last)}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
        >
          {showTicks &&
            ticks.map((t) => (
              <g key={t}>
                <line className="mb-trend-grid" x1={pad.left} x2={pad.left + innerW} y1={y(t)} y2={y(t)} />
                <text className="mb-trend-tick" x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                  {t}
                </text>
              </g>
            ))}
          {area && <path className="mb-trend-area" d={area} />}
          {points.length > 1 && <path className="mb-trend-line" d={line} />}
          {active != null && <line className="mb-trend-cross" x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + innerH} />}
          {(active != null ? [active] : [last]).map((i) =>
            points[i] ? <circle key={i} className="mb-trend-dot" cx={x(i)} cy={y(points[i].value)} r={4} /> : null,
          )}
          {points[last] && active == null && (
            <text className="mb-trend-end" x={x(last) + 8} y={y(points[last].value)} dy="0.32em">
              {format(points[last].value)}
            </text>
          )}
        </svg>
      )}
      {shown && (
        <div
          className="mb-trend-tip"
          role="status"
          style={{ left: Math.min(Math.max(x(active!), 60), width - 60) }}
        >
          <strong>{format(shown.value)}</strong>
          <span>{shown.label}</span>
          {shown.sub && <span>{shown.sub}</span>}
        </div>
      )}
    </div>
  );
}
