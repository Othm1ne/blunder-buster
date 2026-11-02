"use client";

import Link from "next/link";
import { Mascot } from "@/components/Mascot";
import { ProgressBar } from "@/components/ProgressBar";
import type { StoredPlan } from "@/lib/plan";
import type { PlanDay } from "@/lib/planTypes";

const PLAY_URL = "https://www.chess.com/play/online/new";
const KIND_ICON: Record<PlanDay["kind"], string> = { puzzles: "🧩", play: "♟️", review: "🔍", study: "📚", rest: "😴" };

/** Where a plan day takes you. */
export function DayAction({ day, className = "btn-primary text-sm" }: { day: PlanDay; className?: string }) {
  if (day.kind === "puzzles")
    return (
      <Link href={day.theme ? `/puzzles?theme=${day.theme}` : "/puzzles"} className={className}>
        Go to puzzles
      </Link>
    );
  if (day.kind === "play")
    return (
      <a href={PLAY_URL} target="_blank" rel="noreferrer" className={className}>
        Play on Chess.com
      </a>
    );
  if (day.kind === "review")
    return (
      <Link href="/games" className={className}>
        Pick a game
      </Link>
    );
  return null;
}

export function PlanCard({
  stored,
  state,
  error,
  today,
  onToggle,
  onRegenerate,
}: {
  stored: StoredPlan | null;
  state: "loading" | "ready";
  error: string | null;
  today: number;
  onToggle: (day: number) => void;
  onRegenerate: () => void;
}) {
  if (!stored)
    return (
      <section className="card flex items-center gap-4">
        <Mascot size={56} />
        <div className="min-w-48 flex-1">
          <h2 className="font-display text-xl">This week&apos;s plan</h2>
          {state === "loading" ? (
            <ProgressBar label="Sir Blunderbuss is writing your plan from your Blunder Profile…" />
          ) : (
            <p className="text-sm text-[var(--muted)]">{error ?? "Analyze a few games first: the plan is built from your mistakes."}</p>
          )}
        </div>
      </section>
    );

  const { plan, done } = stored;
  return (
    <section className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <Mascot mood={done.length === 7 ? "proud" : "happy"} size={56} />
        <div className="min-w-48 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">This week&apos;s plan</p>
          <h2 className="font-display text-2xl">{plan.title}</h2>
          <p className="text-sm">{plan.focus}</p>
        </div>
        <span className={`chip ${stored.source === "ai" ? "chip-gold" : "text-[var(--muted)]"}`}>
          {stored.source === "ai" ? "✨ AI coach" : "Quick plan"}
        </span>
      </div>
      <p className="rounded-lg bg-[var(--stripe)] px-3 py-2 text-sm">
        <strong>Rule of the week:</strong> {plan.rule}
      </p>
      <ProgressBar percent={(done.length / 7) * 100} label={`${done.length}/7 days done`} />
      <ol className="flex flex-col gap-2">
        {plan.days.map((day, i) => {
          const checked = done.includes(i);
          const isToday = i === today;
          return (
            <li
              key={day.day}
              className={`flex items-start gap-3 rounded-xl border-2 p-3 ${isToday ? "border-[var(--gold)]" : "border-transparent bg-[var(--stripe)]"}`}
            >
              <button
                onClick={() => onToggle(i)}
                className="grid size-7 shrink-0 place-items-center rounded-full border-2 text-sm font-bold"
                style={checked ? { background: "var(--good)", borderColor: "var(--good)", color: "#fff" } : { borderColor: "var(--line)" }}
                aria-label={checked ? `Mark ${day.day} as not done` : `Mark ${day.day} as done`}
                aria-pressed={checked}
              >
                {checked ? "✓" : ""}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-bold">{day.day}</span>
                  {isToday && <span className="chip chip-gold ml-2">Today</span>}{" "}
                  <span aria-hidden>{KIND_ICON[day.kind]}</span> <span className="font-semibold">{day.title}</span>
                </p>
                <p className={`text-sm ${checked ? "text-[var(--muted)] line-through" : ""}`}>{day.task}</p>
                {isToday && !checked && (
                  <div className="mt-2">
                    <DayAction day={day} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        {state === "loading" ? (
          <ProgressBar label="Asking the AI coach for a fresh plan…" />
        ) : (
          <>
            {error && <span>AI coach unavailable ({error}).</span>}
            <button className="underline" onClick={onRegenerate}>
              {stored.source === "ai" ? "Write a new plan" : "Try the AI coach"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
