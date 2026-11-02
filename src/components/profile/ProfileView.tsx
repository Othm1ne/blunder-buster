"use client";

import Link from "next/link";
import { Mascot, type MascotMood } from "@/components/Mascot";
import { LABEL_STYLE, MISTAKE_NAMES, moveName } from "@/lib/describe";
import type { Baseline } from "@/lib/games";
import type { Phase, Profile } from "@/lib/profile";
import { TIPS } from "@/lib/templates";
import { CLOCK_BUCKETS, HABITS, QUICK_SECONDS, type TiltStats } from "@/lib/insights";
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

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl">Opening habits</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {profile.habits.map((h) => (
            <div key={h.habit} className="card flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-lg">{HABITS[h.habit].name}</h3>
                <span className="font-display text-2xl tabular-nums">{Math.round(h.share * 100)}%</span>
              </div>
              <p className="text-xs text-[var(--muted)]">
                In {h.games} of your {profile.games} games
              </p>
              {h.scoreWith !== null && h.scoreWithout !== null && (
                <p className="text-sm">
                  You score <strong>{Math.round(h.scoreWith)}%</strong> when you do this, and{" "}
                  <strong>{Math.round(h.scoreWithout)}%</strong> when you don&apos;t.
                </p>
              )}
              {h.games > 0 ? (
                <>
                  <p className="rounded-lg bg-[var(--stripe)] px-3 py-2 text-sm">
                    <strong>Fix it:</strong> {HABITS[h.habit].tip}
                  </p>
                  <div className="flex flex-col gap-1 text-sm">
                    <span className="text-xs font-semibold text-[var(--muted)]">Recent games</span>
                    {h.examples.map((ex) => (
                      <Link key={ex.gameId} href={`/review?id=${ex.gameId}&ply=${ex.ply}`} className="underline">
                        {ex.text} vs {ex.oppName}
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-[var(--good)]">Never! Great opening discipline.</p>
              )}
            </div>
          ))}
        </div>
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

        <ClockCard profile={profile} />
      </div>

      {profile.tilt && <TiltCard tilt={profile.tilt} />}

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

const rate = (r: { moves: number; errors: number }) => (r.moves ? r.errors / r.moves : 0);
/** Below this many moves, a rate is too noisy to call out. */
const MIN_MOVES = 20;

function ClockCard({ profile }: { profile: Profile }) {
  const time = profile.time;
  const maxRate = Math.max(...(time?.byClock.map(rate) ?? [0]), 0.01);
  const quick = time ? rate(time.quick) : 0;
  const slow = time ? rate(time.slow) : 0;
  const speedKnown = !!time && time.quick.moves >= MIN_MOVES && time.slow.moves >= MIN_MOVES;

  return (
    <section className="card flex flex-col gap-3">
      <h2 className="font-display text-xl">Your clock</h2>
      {time ? (
        <>
          <p className="text-xs font-semibold text-[var(--muted)]">Thinking time per move</p>
          {(Object.keys(PHASE_NAMES) as Phase[]).map((p) => (
            <Bar
              key={p}
              label={PHASE_NAMES[p]}
              share={time.phases[p].share}
              value={time.phases[p].moves ? `${time.phases[p].avgSeconds.toFixed(1)} s · ${Math.round(time.phases[p].share * 100)}% of your time` : "-"}
            />
          ))}
          <p className="text-xs font-semibold text-[var(--muted)]">Mistake rate by time left on your clock</p>
          {CLOCK_BUCKETS.map((label, i) => (
            <Bar
              key={label}
              label={label}
              share={rate(time.byClock[i]) / maxRate}
              value={time.byClock[i].moves ? `${Math.round(rate(time.byClock[i]) * 100)}% of ${time.byClock[i].moves} moves` : "-"}
            />
          ))}
          {speedKnown && (
            <p className="text-sm">
              Moves played in under {QUICK_SECONDS} seconds are mistakes <strong>{Math.round(quick * 100)}%</strong> of the
              time, vs <strong>{Math.round(slow * 100)}%</strong> when you think longer.
              {quick >= slow * 1.5 && quick > 0 ? " Those quick moves are costing you: take a breath first!" : ""}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-[var(--muted)]">No clock data in these games.</p>
      )}
      <p className="text-sm text-[var(--muted)]">
        {Math.round(profile.timeTroubleShare * 100)}% of your mistakes came with under 30 seconds left.{" "}
        {profile.timeTroubleShare >= 0.25
          ? "That's a lot: try 10+5 or 15+10 games and spend less time on easy early moves."
          : "The clock isn't your main problem: use your spare time to blunder-check!"}
      </p>
    </section>
  );
}

function TiltCard({ tilt }: { tilt: TiltStats }) {
  const drop = tilt.otherwise.accuracy - tilt.afterLoss.accuracy;
  const tilts = drop >= 3 || tilt.afterLoss.blunders >= tilt.otherwise.blunders + 0.5;
  return (
    <section className="card flex flex-wrap items-center gap-4">
      <Mascot mood={tilts ? "shocked" : "proud"} size={56} />
      <div className="min-w-56 flex-1">
        <h2 className="font-display text-xl">After a loss</h2>
        <p className="text-sm">
          Right after losing, your accuracy is <strong>{Math.round(tilt.afterLoss.accuracy)}%</strong> with{" "}
          {tilt.afterLoss.blunders.toFixed(1)} blunders a game ({tilt.afterLoss.games} games). Otherwise it&apos;s{" "}
          <strong>{Math.round(tilt.otherwise.accuracy)}%</strong> with {tilt.otherwise.blunders.toFixed(1)}.
        </p>
        <p className="text-sm text-[var(--muted)]">
          {tilts
            ? "You tilt: losses follow you into the next game. After a loss, take a 10-minute break before playing again."
            : "Losses don't throw you off. Nice nerves!"}
        </p>
      </div>
    </section>
  );
}
