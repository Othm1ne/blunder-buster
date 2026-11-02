"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useAnalysis } from "@/components/AnalysisProvider";
import { Mascot, type MascotMood } from "@/components/Mascot";
import { LoadingCard, ProgressBar } from "@/components/ProgressBar";
import type { GameDoc } from "@/lib/analysis";
import { getProfile, listGames, syncGames, type SyncProgress } from "@/lib/games";
import { useOpeningBook } from "@/lib/openings";
import { reviewAll } from "@/lib/profile";
import { tiltStats } from "@/lib/insights";
import { TiltWarning } from "@/components/TiltWarning";
import { DayAction } from "@/components/coach/PlanCard";
import { goalProgress, type RatingGoal } from "@/lib/goal";
import { loadPlan, type StoredPlan } from "@/lib/plan";
import { dayIndex, weekKey, weekStart } from "@/lib/weekly";
import { computeProgress, XP, type ActivityDoc } from "@/lib/progress";
import { loadPuzzleStates, today, WARMUP_SIZE, type PuzzleState } from "@/lib/puzzles";

const PLAY_URL = "https://www.chess.com/play/online/new";

type Data = {
  games: GameDoc[];
  states: Map<string, PuzzleState>;
  activity: ActivityDoc;
  username?: string;
  goal?: RatingGoal;
  plan: StoredPlan | null;
};

function Mission({
  done,
  title,
  detail,
  reward,
  children,
}: {
  done: boolean;
  title: string;
  detail: string;
  reward: string;
  children?: ReactNode;
}) {
  return (
    <li className="card flex flex-col gap-2" style={done ? { borderColor: "var(--good)" } : undefined}>
      <div className="flex items-center gap-2">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-full border-2 text-sm font-bold"
          style={done ? { background: "var(--good)", borderColor: "var(--good)", color: "#fff" } : { borderColor: "var(--line)" }}
          aria-label={done ? "done" : "to do"}
        >
          {done ? "✓" : ""}
        </span>
        <span className="font-display text-lg">{title}</span>
        <span className="ml-auto text-xs font-bold text-[var(--wood-dark)]">{reward}</span>
      </div>
      <p className="text-sm text-[var(--muted)]">{detail}</p>
      {!done && children && <div className="mt-auto flex flex-wrap gap-2">{children}</div>}
    </li>
  );
}

export default function Today() {
  const { user, loading, signIn } = useAuth();
  const { results } = useAnalysis();
  const book = useOpeningBook();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncProgress | null>(null);

  const load = useCallback(async (uid: string): Promise<Data> => {
    const [games, states, profile, plan] = await Promise.all([
      listGames(uid),
      loadPuzzleStates(uid),
      getProfile(uid),
      loadPlan(uid, weekKey(weekStart())),
    ]);
    return { games, states, activity: profile as ActivityDoc, username: profile.chessComUsername, goal: profile.goal, plan };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    load(user.uid)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [user, load]);

  const reviewed = useMemo(() => (data && book !== undefined ? reviewAll(data.games, results, book) : null), [data, results, book]);
  const progress = useMemo(
    () => (data && reviewed ? computeProgress(data.games, reviewed, data.states, data.activity) : null),
    [data, reviewed],
  );

  async function syncNow() {
    if (!user) return;
    setError(null);
    try {
      await syncGames(user.uid, setSync);
      setData(await load(user.uid));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSync(null);
    }
  }

  if (loading) return <LoadingCard />;
  if (!user)
    return (
      <section className="card flex flex-col items-center gap-4 py-10 text-center">
        <Mascot size={120} />
        <h1 className="font-display text-3xl">Welcome to Blunder Buster!</h1>
        <p className="max-w-md text-[var(--muted)]">
          Sir Blunderbuss reviews your Chess.com games, finds your blunders, and turns them into puzzles so you stop
          making them.
        </p>
        <button className="btn-primary" onClick={signIn}>
          Sign in with Google
        </button>
      </section>
    );
  if (error && !data) return <p className="card text-[var(--bad)]">{error}</p>;
  if (!data || !progress) return <LoadingCard label="Getting your day ready…" />;

  const name = user.displayName?.split(" ")[0];
  const warmupDone = data.activity.warmup?.day === today() ? data.activity.warmup.done : 0;
  const todaysGames = data.games.filter((g) => new Date(g.endTime).toLocaleDateString("en-CA") === today());
  const rapidToday = todaysGames.filter((g) => g.timeClass === "rapid");
  const reviewedToday = todaysGames.some((g) => g.reviewedAt);
  const toReview = (rapidToday[0] ?? todaysGames[0]) as GameDoc | undefined;
  const missionsDone = [warmupDone >= WARMUP_SIZE, rapidToday.length > 0, reviewedToday].filter(Boolean).length;
  const { streak, level } = progress;

  const mood: MascotMood = missionsDone === 3 ? "proud" : streak.current > 0 && !streak.activeToday ? "shocked" : "happy";
  const line =
    missionsDone === 3
      ? "All missions done today. Sir Blunderbuss is proud of you!"
      : streak.current > 0 && !streak.activeToday
        ? `Your ${streak.current}-day streak is in danger! Do one puzzle to keep it alive.`
        : "Before every move, ask: is everything safe?";

  return (
    <div className="flex flex-col gap-5">
      {!data.username && (
        <div className="card flex flex-wrap items-center gap-3">
          <p className="flex-1">First, tell me your Chess.com username so I can import your games.</p>
          <Link href="/games" className="btn-primary">
            Set up
          </Link>
        </div>
      )}

      <TiltWarning games={data.games} stats={reviewed && tiltStats(reviewed)} />

      <section className="card flex flex-wrap items-center gap-4">
        <Mascot mood={mood} size={88} />
        <div className="min-w-56 flex-1">
          <h1 className="font-display text-3xl">{name ? `Ready, ${name}?` : "Ready?"}</h1>
          <p className="text-[var(--muted)]">{line}</p>
          <div className="mt-3 max-w-md">
            <ProgressBar
              percent={(level.current / level.needed) * 100}
              label={`Level ${level.level} · ${level.current}/${level.needed} XP to level ${level.level + 1}`}
            />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="card flex min-w-24 flex-col items-center !p-3 text-center">
            <span className="text-3xl" aria-hidden>
              🔥
            </span>
            <span className="font-display text-2xl tabular-nums">{streak.current}</span>
            <span className="text-xs text-[var(--muted)]">day streak</span>
          </div>
          <div className="card flex min-w-24 flex-col items-center !p-3 text-center">
            <span className="text-3xl" aria-hidden>
              ⭐
            </span>
            <span className="font-display text-2xl tabular-nums">{progress.xp}</span>
            <span className="text-xs text-[var(--muted)]">total XP</span>
          </div>
        </div>
      </section>

      <ThisWeek data={data} />

      <section>
        <h2 className="font-display mb-3 text-xl">
          Today&apos;s missions <span className="text-base text-[var(--muted)]">({missionsDone}/3)</span>
        </h2>
        <ul className="grid gap-3 md:grid-cols-3">
          <Mission
            done={warmupDone >= WARMUP_SIZE}
            title="Warm-up"
            detail={`Solve ${WARMUP_SIZE} puzzles made from your own blunders (${Math.min(warmupDone, WARMUP_SIZE)}/${WARMUP_SIZE}).`}
            reward={`+${XP.warmup} XP`}
          >
            <Link href="/puzzles" className="btn-primary text-sm">
              {warmupDone ? "Continue" : "Start warm-up"}
            </Link>
          </Mission>
          <Mission
            done={rapidToday.length > 0}
            title="Play"
            detail="Play 1 rapid game (10+5 or 15+10) on Chess.com. Slower games = fewer blunders."
            reward={`+${XP.cleanGame} XP if clean`}
          >
            <a href={PLAY_URL} target="_blank" rel="noreferrer" className="btn-primary text-sm">
              Play on Chess.com
            </a>
            <button className="btn-secondary text-sm" onClick={syncNow} disabled={!!sync || !data.username}>
              I played: sync
            </button>
          </Mission>
          <Mission
            done={reviewedToday}
            title="Review"
            detail={
              toReview
                ? `Review today's game vs ${toReview.oppName} move by move.`
                : "Review the game you play today, move by move."
            }
            reward={`+${XP.review} XP`}
          >
            {toReview ? (
              <Link href={`/review?id=${toReview.id}`} className="btn-primary text-sm">
                Review it
              </Link>
            ) : (
              <span className="text-xs text-[var(--muted)]">Play and sync a game first.</span>
            )}
          </Mission>
        </ul>
        {sync && (
          <div className="card mt-3">
            <ProgressBar percent={sync.percent} label={sync.message} />
          </div>
        )}
        {error && <p className="mt-2 text-sm text-[var(--bad)]">{error}</p>}
      </section>

      <section>
        <h2 className="font-display mb-3 text-xl">
          Badges{" "}
          <span className="text-base text-[var(--muted)]">
            ({progress.badges.filter((b) => b.earned).length}/{progress.badges.length})
          </span>
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {progress.badges.map((b) => (
            <li
              key={b.id}
              className="card flex flex-col items-center gap-1 !p-3 text-center"
              style={b.earned ? undefined : { opacity: 0.55 }}
              title={b.description}
            >
              <span className="text-3xl" style={b.earned ? undefined : { filter: "grayscale(1)" }} aria-hidden>
                {b.icon}
              </span>
              <span className="text-sm font-bold">{b.name}</span>
              <span className="text-xs text-[var(--muted)]">{b.earned ? "Earned!" : (b.progress ?? b.description)}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-center text-xs text-[var(--muted)]">
        XP: puzzle solved +{XP.puzzleSolved}, puzzle tried +{XP.puzzleTried}, game reviewed +{XP.review}, clean game +
        {XP.cleanGame}, warm-up +{XP.warmup}, each active day +{XP.activeDay}.
      </p>
    </div>
  );
}

/** Today's task from the weekly plan, and the rating goal at a glance. Both live on the Coach page. */
function ThisWeek({ data }: { data: Data }) {
  const day = data.plan?.plan.days[dayIndex()];
  const done = data.plan?.done.includes(dayIndex());
  const goal = data.goal && goalProgress(data.goal, data.games);
  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-xl">This week</h2>
        <Link href="/coach" className="ml-auto text-sm underline">
          Open your coach →
        </Link>
      </div>
      {day ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            <span className="font-semibold">Today&apos;s plan: {day.title}</span>
            {done && <span className="chip ml-2" style={{ color: "var(--good)" }}>✓ done</span>}
          </p>
          <p className="text-sm text-[var(--muted)]">{day.task}</p>
          {!done && (
            <div className="flex flex-wrap gap-2">
              <DayAction day={day} />
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          Your weekly plan is waiting: Sir Blunderbuss writes it from your Blunder Profile.{" "}
          <Link href="/coach" className="underline">
            Get it
          </Link>
        </p>
      )}
      {data.goal && goal ? (
        <ProgressBar
          percent={goal.percent}
          label={`Goal ${data.goal.target} ${data.goal.timeClass}: ${goal.current} now, ${Math.max(0, data.goal.target - goal.current)} to go`}
        />
      ) : (
        <p className="text-sm text-[var(--muted)]">
          No rating goal yet.{" "}
          <Link href="/coach" className="underline">
            Set one
          </Link>
        </p>
      )}
    </section>
  );
}
