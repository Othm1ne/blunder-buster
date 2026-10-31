"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Profile } from "@/lib/profile";
import { ROLLING } from "@/lib/profile";

const H = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 32 };

/** Blunders per game over time: a dot per game, a line for the rolling average, an optional baseline. */
export function TrendChart({ trend, baseline }: { trend: Profile["trend"]; baseline?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxY = Math.max(2, ...trend.map((t) => t.blunders), baseline ?? 0);
  const yStep = maxY > 8 ? 2 : 1;
  const top = Math.ceil(maxY / yStep) * yStep;
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (trend.length <= 1 ? plotW / 2 : (i / (trend.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const line = trend.map((t, i) => `${x(i).toFixed(1)},${y(t.rolling).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: top / yStep + 1 }, (_, i) => i * yStep);
  const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    for (let i = 1; i < trend.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  }

  const h = hover !== null ? trend[hover] : null;

  return (
    <div ref={box} className="relative w-full min-w-0">
      {/* The SVG fills the box (CSS width), and we draw in the box's measured pixel width, so
          the chart never pushes the page wider than the screen. */}
      <svg
        viewBox={`0 0 ${width} ${H}`}
        height={H}
        className="block w-full cursor-pointer select-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onClick={() => h && router.push(`/review?id=${h.gameId}`)}
        role="img"
        aria-label={`Blunders per game over your last ${trend.length} analyzed games`}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeOpacity={0.35} />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              {v}
            </text>
          </g>
        ))}
        {trend.length > 0 && (
          <>
            <text x={PAD.left} y={H - 8} fontSize={11} fill="var(--muted)">
              {fmt(trend[0].endTime)}
            </text>
            <text x={width - PAD.right} y={H - 8} fontSize={11} fill="var(--muted)" textAnchor="end">
              {fmt(trend[trend.length - 1].endTime)}
            </text>
          </>
        )}
        {baseline !== undefined && (
          <g>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(baseline)}
              y2={y(baseline)}
              stroke="var(--muted)"
              strokeWidth={1.5}
              strokeDasharray="5 5"
            />
            <text x={width - PAD.right} y={y(baseline) - 5} textAnchor="end" fontSize={11} fill="var(--muted)">
              day-1 baseline
            </text>
          </g>
        )}
        {trend.map((t, i) => (
          <circle key={t.gameId} cx={x(i)} cy={y(t.blunders)} r={4} fill="var(--muted)" fillOpacity={0.45} />
        ))}
        <polyline points={line} fill="none" stroke="var(--wood-dark)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {h && hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--ink)" strokeOpacity={0.3} />
            <circle cx={x(hover)} cy={y(h.blunders)} r={5} fill="var(--muted)" stroke="var(--card)" strokeWidth={2} />
            <circle cx={x(hover)} cy={y(h.rolling)} r={5} fill="var(--wood-dark)" stroke="var(--card)" strokeWidth={2} />
          </g>
        )}
      </svg>

      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg border-2 border-[var(--line)] bg-[var(--card)] px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(x(hover) - 80, 0), width - 170), width: 170 }}
        >
          <p className="font-semibold">
            {fmt(h.endTime)} · vs {h.oppName}
          </p>
          <p>
            {h.blunders} blunder{h.blunders === 1 ? "" : "s"} this game
          </p>
          <p className="text-[var(--muted)]">
            {ROLLING}-game average: {h.rolling.toFixed(1)}
          </p>
          <p className="text-[var(--muted)]">Click to review</p>
        </div>
      )}

      <div className="mt-1 flex flex-wrap gap-4 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-full bg-[var(--muted)] opacity-60" /> each game
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 rounded bg-[var(--wood-dark)]" /> {ROLLING}-game average
        </span>
      </div>
    </div>
  );
}
