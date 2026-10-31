"use client";

import Link from "next/link";
import { Mascot, type MascotMood } from "@/components/Mascot";
import { LABEL_STYLE, MISTAKE_NAMES, moveName } from "@/lib/describe";
import type { Baseline } from "@/lib/games";
import type { Phase, Profile } from "@/lib/profile";
import { TIPS } from "@/lib/templates";
import { TrendChart } from "./TrendChart";

const PHASE_NAMES: Record<Phase, string> = { opening: "Opening (moves 1-12)", middlegame: "Middlegame", endgame: "Endgame" };

/** Change vs. baseline, e.g. "-23%". Lower is better for blunders. */
function delta(now: number, then: number | undefined, lowerIsBetter: boolean) {
  if (then === undefined || then === 0) return null;
  const change = (now - then) / then;
  if (Math.abs(change) < 0.02) return { text: "same as day 1", good: null, up: false };
  const good = lowerIsBetter ? change < 0 : change > 0;
  return { text: `${change > 0 ? "+" : ""}${Math.round(change * 100)}% vs day 1`, good, up: change > 0 };
}

function StatTile({ label, value, sub, change }: { label: string; value: string; sub?: string; change?: ReturnType<typeof delta> }) {
  return (
    <div className="card flex flex-col gap-0.5 !p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</span>
      <span className="font-display text-3xl tabular-nums">{value}</span>
      {change && (
        <span
          className="text-xs font-semibold"
          style={{ color: change.good === null ? "var(--muted)" : change.good ? "var(--good)" : "var(--bad)" }}
        >
          {change.good !== null && <span aria-hidden>{change.up ? "▲ " : "▼ "}</span>}
          <span>{change.text}</span>
          {change.good !== null && <span className="sr-only">{change.good ? "(better)" : "(worse)"}</span>}
        </span>
      )}
      {sub && <span className="text-xs text-[var(--muted)]">{sub}</span>}
    </div>
  );
}

function Bar({ share, label, value }: { share: number; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-2.5 rounded-full bg-[var(--stripe)]">
        <div className="h-full rounded-full bg-[var(--wood-dark)]" style={{ width: `${Math.max(share * 100, 2)}%` }} />
      </div>
    </div>
  );
}

export function ProfileView({
  profile,
  baseline,
  onResetBaseline,
}: {
  profile: Profile;
  baseline?: Baseline;
  onResetBaseline?: () => void;
}) {
  const recent = profile.trend.slice(-10);
  const earlier = profile.trend.slice(-20, -10);
  const avg = (xs: { blunders: number }[]) => xs.reduce((s, t) => s + t.blunders, 0) / (xs.length || 1);
  const improving = earlier.length >= 5 && avg(recent) < avg(earlier) - 0.2;
  const worsening = earlier.length >= 5 && avg(recent) > avg(earlier) + 0.2;
  const mood: MascotMood = improving ? "proud" : worsening ? "shocked" : "happy";
  const top = profile.types.filter((t) => t.type !== "other").slice(0, 3);
  const phaseTotal = Object.values(profile.phases).reduce((a, b) => a + b, 0) || 1;
  const worstPhase = (Object.entries(profile.phases) as [Phase, number][]).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-wrap items-center gap-4">
        <Mascot mood={mood} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl">Your Blunder Profile</h1>
          <p className="text-sm">
            {improving
              ? `You're improving! Your last 10 games average ${avg(recent).toFixed(1)} blunders, down from ${avg(earlier).toFixed(1)}.`
              : worsening
                ? `Careful: your last 10 games average ${avg(recent).toFixed(1)} blunders, up from ${avg(earlier).toFixed(1)}. Slow down and blunder-check!`
                : top[0]
                  ? `Your number one enemy: "${MISTAKE_NAMES[top[0].type].toLowerCase()}". Let's hunt it down.`
                  : "Keep playing and analyzing: Sir Blunderbuss is learning your habits."}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Blunders / game"
          value={profile.blundersPerGame.toFixed(1)}
          change={delta(profile.blundersPerGame, baseline?.blundersPerGame, true)}
        />
        <StatTile
          label="Mistakes / game"
          value={profile.mistakesPerGame.toFixed(1)}
          change={delta(profile.mistakesPerGame, baseline?.mistakesPerGame, true)}
        />
        <StatTile label="Accuracy" value={`${Math.round(profile.accuracy)}%`} change={delta(profile.accuracy, baseline?.accuracy, false)} />
        <StatTile label="Games analyzed" value={String(profile.games)} sub={`${profile.failedToConvert} winning position${profile.failedToConvert === 1 ? "" : "s"} not converted`} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl">Your top {top.length || ""} mistake types</h2>
        {top.length === 0 ? (
          <p className="card text-sm">No mistakes or blunders found yet. Impressive (or analyze more games)!</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {top.map((t, i) => (
              <div key={t.type} className="card flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-lg">
                    #{i + 1} {MISTAKE_NAMES[t.type]}
                  </h3>
                  <span className="font-display text-2xl tabular-nums">{Math.round(t.share * 100)}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-[var(--stripe)]">
                  <div className="h-full rounded-full bg-[var(--wood-dark)]" style={{ width: `${t.share * 100}%` }} />
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {t.count} of your mistakes and blunders ({(t.count / profile.games).toFixed(1)} per game)
                </p>
                {TIPS[t.type] && (
                  <p className="rounded-lg bg-[var(--stripe)] px-3 py-2 text-sm">
                    <strong>Fix it:</strong> {TIPS[t.type]}
                  </p>
                )}
                <div className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-semibold text-[var(--muted)]">Examples from your games</span>
                  {t.examples.map((ex) => (
                    <Link key={`${ex.gameId}-${ex.ply}`} href={`/review?id=${ex.gameId}&ply=${ex.ply}`} className="underline">
                      <span style={{ color: LABEL_STYLE[ex.move.label].color }}>
                        {moveName(ex.move)}
                        {LABEL_STYLE[ex.move.label].symbol}
                      </span>{" "}
                      vs {ex.oppName}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-2">
        <h2 className="font-display text-xl">Blunders per game over time</h2>
        <p className="text-sm text-[var(--muted)]">
          Lower is better. Hover a game to see it, click to review it.
        </p>
        <TrendChart trend={profile.trend} baseline={baseline?.blundersPerGame} />
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="card flex flex-col gap-3">
          <h2 className="font-display text-xl">When do you slip?</h2>
          {(Object.keys(PHASE_NAMES) as Phase[]).map((p) => (
            <Bar
              key={p}
              label={PHASE_NAMES[p]}
              share={profile.phases[p] / phaseTotal}
              value={`${profile.phases[p]} (${Math.round((profile.phases[p] / phaseTotal) * 100)}%)`}
            />
          ))}
          {worstPhase && worstPhase[1] > 0 && (
            <p className="text-sm text-[var(--muted)]">
              Most of your mistakes happen in the <strong>{worstPhase[0]}</strong>.
            </p>
          )}
        </section>

        <section className="card flex flex-col gap-3">
          <h2 className="font-display text-xl">Clock trouble</h2>
          <Bar
            label="Mistakes made with under 30 seconds left"
            share={profile.timeTroubleShare}
            value={`${Math.round(profile.timeTroubleShare * 100)}%`}
          />
          <p className="text-sm text-[var(--muted)]">
            {profile.timeTroubleShare >= 0.25
              ? "A lot of your mistakes come from rushing at the end. Try 10+5 or 15+10 games and spend time early on."
              : "The clock isn't your main problem: most mistakes happen with time to spare. Use it to blunder-check!"}
          </p>
        </section>
      </div>

      {baseline && (
        <section className="card flex flex-wrap items-center gap-3 text-sm">
          <div className="flex-1">
            <h2 className="font-display text-xl">Day-1 baseline</h2>
            <p className="text-[var(--muted)]">
              Saved {new Date(baseline.createdAt).toLocaleDateString()} from {baseline.games} games:{" "}
              {baseline.rapidRating !== undefined && <>rapid {baseline.rapidRating} · </>}
              {baseline.blitzRating !== undefined && <>blitz {baseline.blitzRating} · </>}
              {baseline.blundersPerGame.toFixed(1)} blunders/game · {Math.round(baseline.accuracy)}% accuracy.
            </p>
          </div>
          {onResetBaseline && (
            <button className="btn-secondary text-sm" onClick={onResetBaseline}>
              Reset to today
            </button>
          )}
        </section>
      )}
    </div>
  );
}
