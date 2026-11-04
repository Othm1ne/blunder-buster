"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mascot } from "./Mascot";
import type { GameAnalysis, GameDoc } from "@/lib/analysis";
import { useOpeningBook } from "@/lib/openings";
import { reviewCached } from "@/lib/profile";
import { explain, LABEL_STYLE, MISTAKE_NAMES, moveName } from "@/lib/describe";
import { mascotLine } from "@/lib/templates";
import { siteOf } from "@/lib/chesscom";

const RESULT_STYLE = {
  win: { label: "W", color: "#2f9447" },
  loss: { label: "L", color: "#d93a3f" },
  draw: { label: "D", color: "#8a7d6b" },
} as const;

function accuracyColor(accuracy: number): string {
  return accuracy >= 80 ? LABEL_STYLE.best.color : accuracy >= 60 ? LABEL_STYLE.inaccuracy.color : LABEL_STYLE.blunder.color;
}

function formatTimeControl(tc: string): string {
  const [base, inc] = tc.split("+").map(Number);
  return `${Math.round(base / 60)}${inc ? `+${inc}` : " min"}`;
}

export function GameRow({
  game: g,
  analysis,
  queued,
  percent,
  onAnalyze,
}: {
  game: GameDoc;
  analysis?: GameAnalysis;
  queued: boolean;
  percent?: number;
  onAnalyze: () => void;
}) {
  const [open, setOpen] = useState(false);
  const book = useOpeningBook();
  // Only review games that scroll into view: the list can hold 300 games and reviewing all of them
  // up front froze the page for seconds on phones.
  const row = useRef<HTMLLIElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = row.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  const review = useMemo(
    () => (analysis && seen && book !== undefined ? reviewCached(g, analysis, book) : null),
    [analysis, g, book, seen],
  );
  const r = RESULT_STYLE[g.result];
  const mistakes = review?.moves.filter((m) => m.mine && (m.label === "blunder" || m.label === "mistake")) ?? [];

  return (
    <li ref={row} className="card !py-2">
      {/* On phones the chips and buttons wrap onto a second line so the name isn't squeezed. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:flex-nowrap">
        <span className="font-display grid size-9 shrink-0 place-items-center rounded-full text-white" style={{ background: r.color }}>
          {r.label}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            vs {g.oppName} <span className="text-[var(--muted)] font-normal">({g.oppRating})</span>
          </p>
          <p className="truncate text-xs text-[var(--muted)]">
            {review?.opening ?? g.opening} · {Math.ceil(g.moves.length / 2)} moves · {g.resultDetail}
          </p>
        </div>
        <div className="hidden text-right text-xs text-[var(--muted)] shrink-0 sm:block">
          <p>
            {g.myColor === "white" ? "♔" : "♚"} {g.myRating} · {formatTimeControl(g.timeControl)}
          </p>
          <p>{new Date(g.endTime).toLocaleDateString()}</p>
        </div>
        <div className={`flex items-center justify-end gap-3 sm:w-auto ${analysis ? "w-full" : ""}`}>
          {review ? (
            <button
              onClick={() => setOpen(!open)}
              className="flex shrink-0 items-center gap-1 rounded-full p-0.5 hover:bg-[var(--stripe)]"
              aria-expanded={open}
              title={open ? "Hide mistakes" : "Show mistakes"}
            >
              <span className="chip" style={{ color: accuracyColor(review.accuracy) }} title="Your accuracy">
                {Math.round(review.accuracy)}%
              </span>
              <span className="chip" title="Blunders">
                <span style={{ color: LABEL_STYLE.blunder.color }}>??</span>
                {review.counts.blunder}
              </span>
              <span className="chip" title="Mistakes">
                <span style={{ color: LABEL_STYLE.mistake.color }}>?</span>
                {review.counts.mistake}
              </span>
              <span className="w-4 text-xs text-[var(--muted)]">{open ? "▲" : "▼"}</span>
            </button>
          ) : null}
          {analysis ? (
            <Link href={`/review?id=${g.id}`} className="btn-primary shrink-0 !px-3 !py-0.5 text-sm !shadow-none">
              Review
            </Link>
          ) : (
            <AnalysisBadge queued={queued} percent={percent} onAnalyze={onAnalyze} />
          )}
          <a href={g.url} target="_blank" rel="noreferrer" className="hidden text-xs underline shrink-0 sm:inline">
            {siteOf(g) === "lichess" ? "lichess" : "chess.com"}
          </a>
        </div>
      </div>

      {open && review && (
        <div className="mt-3 border-t-2 border-dashed border-[var(--muted)] pt-3 text-sm">
          {mistakes.length === 0 ? (
            <p className="flex items-center gap-2">
              <Mascot mood="proud" size={32} /> Clean game: no mistakes or blunders. Sir Blunderbuss is proud!
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {mistakes.map((m) => (
                <li key={m.ply} className="flex gap-2">
                  <Link
                    href={`/review?id=${g.id}&ply=${m.ply}`}
                    className="font-bold shrink-0 underline"
                    style={{ color: LABEL_STYLE[m.label].color }}
                  >
                    {moveName(m)}
                    {LABEL_STYLE[m.label].symbol}
                  </Link>
                  <span>
                    {m.type && <strong>{MISTAKE_NAMES[m.type]}: </strong>}
                    {g.coach?.analyzedAt === analysis?.analyzedAt && g.coach?.moves[String(m.ply)]
                      ? g.coach.moves[String(m.ply)]
                      : (mascotLine(m, g.id) ?? explain(m))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {review.failedToConvert && (
            <p className="mt-2 text-[var(--muted)]">
              You were winning ({Math.round(review.peakWin)}% chances) but didn&apos;t win this one.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function AnalysisBadge({
  queued,
  percent,
  onAnalyze,
}: {
  queued: boolean;
  percent?: number;
  onAnalyze: () => void;
}) {
  if (percent !== undefined) return <span className="chip chip-gold">Analyzing {Math.round(percent)}%</span>;
  if (queued) return <span className="chip text-[var(--muted)]">Queued</span>;
  return (
    <button className="btn-secondary shrink-0 !px-3 !py-0.5 text-sm !shadow-none" onClick={onAnalyze}>
      Analyze
    </button>
  );
}
