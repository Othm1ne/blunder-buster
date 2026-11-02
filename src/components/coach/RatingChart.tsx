"use client";

import { useEffect, useRef, useState } from "react";

const H = 180;
const PAD = { top: 12, right: 12, bottom: 24, left: 40 };

/** Rating after each game, with the goal's start and target as dashed lines. */
export function RatingChart({ history, start, target }: { history: { endTime: number; rating: number }[]; start: number; target: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (history.length < 2) return <p className="text-sm text-[var(--muted)]">Play a few more games to see your rating chart.</p>;

  const ratings = history.map((h) => h.rating);
  const lo = Math.floor((Math.min(...ratings, start) - 20) / 50) * 50;
  const hi = Math.ceil((Math.max(...ratings, target) + 20) / 50) * 50;
  const t0 = history[0].endTime;
  const t1 = history.at(-1)!.endTime;
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW);
  const y = (r: number) => PAD.top + plotH - ((r - lo) / (hi - lo)) * plotH;
  const line = history.map((h) => `${x(h.endTime).toFixed(1)},${y(h.rating).toFixed(1)}`).join(" ");
  const step = hi - lo > 400 ? 200 : 100;
  const ticks: number[] = [];
  for (let r = Math.ceil(lo / step) * step; r <= hi; r += step) ticks.push(r);
  const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div ref={box} className="w-full min-w-0">
      <svg viewBox={`0 0 ${width} ${H}`} height={H} className="block w-full" role="img" aria-label={`Rating from ${ratings[0]} to ${ratings.at(-1)}, goal ${target}`}>
        {ticks.map((r) => (
          <g key={r}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(r)} y2={y(r)} stroke="var(--line)" strokeOpacity={0.35} />
            <text x={PAD.left - 6} y={y(r) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              {r}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={width - PAD.right} y1={y(target)} y2={y(target)} stroke="var(--good)" strokeWidth={2} strokeDasharray="6 4" />
        <text x={width - PAD.right} y={y(target) - 5} textAnchor="end" fontSize={11} fontWeight={700} fill="var(--good)">
          goal {target}
        </text>
        <polyline points={line} fill="none" stroke="var(--wood-dark)" strokeWidth={2.5} strokeLinejoin="round" />
        <circle cx={x(t1)} cy={y(ratings.at(-1)!)} r={4.5} fill="var(--gold)" stroke="var(--ink)" strokeWidth={1.5} />
        <text x={PAD.left} y={H - 6} fontSize={11} fill="var(--muted)">
          {fmt(t0)}
        </text>
        <text x={width - PAD.right} y={H - 6} textAnchor="end" fontSize={11} fill="var(--muted)">
          {fmt(t1)}
        </text>
      </svg>
    </div>
  );
}
