"use client";

import { useState, type FormEvent } from "react";
import { Mascot } from "@/components/Mascot";
import { ProgressBar } from "@/components/ProgressBar";
import type { GameDoc } from "@/lib/analysis";
import type { TimeClass } from "@/lib/chesscom";
import { goalProgress, ratingHistory, suggestedTarget, type RatingGoal } from "@/lib/goal";
import { RatingChart } from "./RatingChart";

const fmtDate = (t: number | string) =>
  new Date(typeof t === "string" ? `${t}T12:00:00` : t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Set a rating goal, then track it: progress bar, chart, pace and an estimated arrival date. */
export function GoalCard({ goal, games, onSave }: { goal?: RatingGoal; games: GameDoc[]; onSave: (goal: RatingGoal | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  if (!goal || editing) return <GoalForm goal={goal} games={games} onCancel={goal ? () => setEditing(false) : undefined} onSave={async (g) => {
    await onSave(g);
    setEditing(false);
  }} />;

  const p = goalProgress(goal, games);
  const history = ratingHistory(games, goal.timeClass).filter((h) => h.endTime >= goal.createdAt - 14 * 24 * 60 * 60 * 1000);
  const sign = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n)}`;

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Mascot mood={p.reached ? "proud" : p.gained < 0 ? "shocked" : "happy"} size={56} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl">
            Goal: {goal.target} {goal.timeClass}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            From {goal.start} on {fmtDate(goal.createdAt)}
            {goal.deadline ? ` · by ${fmtDate(goal.deadline)}` : ""}
          </p>
        </div>
        <button className="btn-secondary text-sm" onClick={() => setEditing(true)}>
          Change
        </button>
      </div>
      <ProgressBar
        percent={p.percent}
        label={`${p.current} now · ${sign(p.gained)} so far · ${Math.max(0, goal.target - p.current)} to go`}
      />
      <p className="text-sm">
        {p.reached
          ? "GOAL REACHED! Sir Blunderbuss is throwing a party. Set a new one?"
          : p.pacePerWeek === null
            ? "Play a few more games this month and Sir Blunderbuss will work out your pace."
            : p.pacePerWeek > 0
              ? `You're climbing ${sign(p.pacePerWeek)} points a week. At this pace you'll get there around ${fmtDate(p.eta!)}.`
              : `Your rating moved ${sign(p.pacePerWeek)} points a week lately. Fewer blunders will turn that around: follow the plan!`}
        {p.neededPerWeek !== undefined &&
          (p.onTrack
            ? " You're on track for your deadline."
            : ` To make your deadline you need about ${sign(p.neededPerWeek)} a week.`)}
      </p>
      <RatingChart history={history} start={goal.start} target={goal.target} />
    </section>
  );
}

function GoalForm({
  goal,
  games,
  onSave,
  onCancel,
}: {
  goal?: RatingGoal;
  games: GameDoc[];
  onSave: (goal: RatingGoal | null) => Promise<void>;
  onCancel?: () => void;
}) {
  const [timeClass, setTimeClass] = useState<TimeClass>(goal?.timeClass ?? "rapid");
  const current = ratingHistory(games, timeClass).at(-1)?.rating;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const target = Number(form.get("target"));
    const deadline = String(form.get("deadline") ?? "");
    if (!current) return setError(`No ${timeClass} games yet: play one first.`);
    if (!(target > current)) return setError(`Pick a target above your current ${current}.`);
    // Firestore rejects undefined: only add the deadline when there is one.
    const next: RatingGoal = { timeClass, start: current, target, createdAt: Date.now(), ...(deadline && { deadline }) };
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Mascot size={56} />
        <div>
          <h2 className="font-display text-xl">{goal ? "Change your goal" : "Set a rating goal"}</h2>
          <p className="text-sm text-[var(--muted)]">A target keeps the training honest. Sir Blunderbuss will track every game.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Time control</span>
          <select
            value={timeClass}
            onChange={(e) => setTimeClass(e.target.value as TimeClass)}
            className="rounded-full border-2 border-[var(--line)] bg-[var(--paper)] px-3 py-1"
          >
            <option value="rapid">Rapid</option>
            <option value="blitz">Blitz</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">From</span>
          <span className="py-1 tabular-nums">{current ?? "no games yet"}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">To</span>
          <input
            key={timeClass}
            name="target"
            type="number"
            min={(current ?? 0) + 1}
            step={10}
            defaultValue={goal?.timeClass === timeClass ? goal.target : current ? suggestedTarget(current) : undefined}
            className="w-24 rounded-full border-2 border-[var(--line)] bg-[var(--paper)] px-3 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">By (optional)</span>
          <input
            name="deadline"
            type="date"
            defaultValue={goal?.deadline}
            className="rounded-full border-2 border-[var(--line)] bg-[var(--paper)] px-3 py-1"
          />
        </label>
      </div>
      {error && <p className="text-sm text-[var(--bad)]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save goal"}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        {goal && (
          <button type="button" className="ml-auto text-sm underline" onClick={() => onSave(null)}>
            Remove goal
          </button>
        )}
      </div>
    </form>
  );
}
