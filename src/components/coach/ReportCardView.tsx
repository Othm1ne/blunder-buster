"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Mascot } from "@/components/Mascot";
import type { GameDoc } from "@/lib/analysis";
import { MISTAKE_NAMES } from "@/lib/describe";
import type { ReviewedGame } from "@/lib/profile";
import { previousWeek, reportCard, weekStart, weekStats } from "@/lib/weekly";

const GRADE_COLOR: Record<string, string> = { "A+": "var(--good)", A: "var(--good)", B: "#d29b0f", C: "#e47a24", D: "var(--bad)", "-": "var(--muted)" };

/** Sir Blunderbuss's Weekly Report Card: this week (so far) or last week, each vs the week before. */
export function ReportCardView({ games, reviewed }: { games: GameDoc[]; reviewed: ReviewedGame[] }) {
  const [which, setWhich] = useState<"this" | "last">("this");
  const { week, card } = useMemo(() => {
    const start = which === "this" ? weekStart() : previousWeek(weekStart());
    const week = weekStats(games, reviewed, start);
    return { week, card: reportCard(week, weekStats(games, reviewed, previousWeek(start))) };
  }, [games, reviewed, which]);

  const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const changes = Object.entries(week.ratingChange);
  const pill = (active: boolean) =>
    `rounded-full border-2 px-3 py-0.5 text-sm font-semibold ${
      active ? "border-[var(--gold)] bg-[var(--gold)] text-[var(--on-gold)]" : "border-[var(--line)] bg-[var(--card)]"
    }`;

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-xl">Weekly Report Card</h2>
        <span className="ml-auto flex gap-2">
          <button className={pill(which === "this")} onClick={() => setWhich("this")}>
            This week
          </button>
          <button className={pill(which === "last")} onClick={() => setWhich("last")}>
            Last week
          </button>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div
          className="font-display grid size-20 shrink-0 place-items-center rounded-2xl border-4 text-4xl"
          style={{ borderColor: GRADE_COLOR[card.grade], color: GRADE_COLOR[card.grade] }}
          aria-label={`Grade ${card.grade}`}
        >
          {card.grade}
        </div>
        <div className="min-w-48 flex-1">
          <p className="text-xs text-[var(--muted)]">
            Week of {fmt(week.start)}
            {which === "this" ? " (so far)" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Mascot mood={card.mood} size={36} />
            <p className="text-sm">{card.verdict}</p>
          </div>
        </div>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {card.subjects.map((s) => (
          <li key={s.name} className="flex items-center gap-2 rounded-lg bg-[var(--stripe)] px-3 py-2 text-sm">
            <span
              className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
              style={{ background: s.passed === null ? "var(--muted)" : s.passed ? "var(--good)" : "var(--bad)" }}
              aria-label={s.passed === null ? "not enough data" : s.passed ? "passed" : "not yet"}
            >
              {s.passed === null ? "?" : s.passed ? "✓" : "✗"}
            </span>
            <span className="font-semibold">{s.name}</span>
            <span className="ml-auto text-right text-xs text-[var(--muted)]">{s.detail}</span>
          </li>
        ))}
      </ul>

      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg border-2 border-[var(--line)] px-3 py-2">
          <p className="text-xs font-semibold text-[var(--muted)]">Rating</p>
          {changes.length ? (
            changes.map(([tc, d]) => (
              <p key={tc} className="capitalize">
                {tc}{" "}
                <strong style={{ color: d > 0 ? "var(--good)" : d < 0 ? "var(--bad)" : undefined }}>
                  {d > 0 ? "+" : ""}
                  {d}
                </strong>
              </p>
            ))
          ) : (
            <p className="text-[var(--muted)]">No games</p>
          )}
        </div>
        <div className="rounded-lg border-2 border-[var(--line)] px-3 py-2">
          <p className="text-xs font-semibold text-[var(--muted)]">Best game</p>
          {week.best ? (
            <Link href={`/review?id=${week.best.game.id}`} className="underline">
              vs {week.best.game.oppName} ({Math.round(week.best.accuracy)}%)
            </Link>
          ) : (
            <p className="text-[var(--muted)]">Analyze this week&apos;s games</p>
          )}
        </div>
        <div className="rounded-lg border-2 border-[var(--line)] px-3 py-2">
          <p className="text-xs font-semibold text-[var(--muted)]">Nemesis of the week</p>
          {week.nemesis ? (
            <p>
              <strong>{MISTAKE_NAMES[week.nemesis.type]}</strong> ({week.nemesis.count}×)
            </p>
          ) : (
            <p className="text-[var(--muted)]">{week.analyzed ? "None! Clean week." : "-"}</p>
          )}
        </div>
      </div>
    </section>
  );
}
