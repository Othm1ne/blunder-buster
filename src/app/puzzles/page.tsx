"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useAnalysis } from "@/components/AnalysisProvider";
import { Mascot } from "@/components/Mascot";
import { LoadingCard, ProgressBar } from "@/components/ProgressBar";
import { PuzzleBoard } from "@/components/puzzles/PuzzleBoard";
import type { GameDoc } from "@/lib/analysis";
import { listGames } from "@/lib/games";
import { useOpeningBook } from "@/lib/openings";
import { reviewAll } from "@/lib/profile";
import {
  buildPuzzles,
  loadPuzzleStates,
  loadWarmup,
  nextState,
  practiceQueue,
  savePuzzleState,
  saveWarmup,
  statusOf,
  THEMES,
  WARMUP_SIZE,
  type PuzzleState,
  type PuzzleTheme,
} from "@/lib/puzzles";

export default function PuzzlesPage() {
  const { user, loading } = useAuth();
  const { results } = useAnalysis();
  const book = useOpeningBook();
  const [games, setGames] = useState<GameDoc[] | null>(null);
  const [states, setStates] = useState<Map<string, PuzzleState>>(new Map());
  const [warmup, setWarmup] = useState(0);
  const [theme, setTheme] = useState<"all" | PuzzleTheme>("all");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([listGames(user.uid), loadPuzzleStates(user.uid), loadWarmup(user.uid)])
      .then(([g, s, w]) => {
        if (cancelled) return;
        setGames(g);
        setStates(s);
        setWarmup(w);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const puzzles = useMemo(() => (games ? buildPuzzles(reviewAll(games, results, book)) : []), [games, results, book]);
  const shown = useMemo(() => (theme === "all" ? puzzles : puzzles.filter((p) => p.theme === theme)), [puzzles, theme]);
  const queue = useMemo(() => practiceQueue(shown, states), [shown, states]);
  // Keep the puzzle on screen after it's done (it leaves the queue), until "Next".
  const current = puzzles.find((p) => p.id === currentId) ?? queue[0] ?? null;

  const counts = { due: 0, new: 0, later: 0, mastered: 0 };
  for (const p of shown) counts[statusOf(states.get(p.id))]++;
  const themeCounts = new Map<PuzzleTheme, number>();
  for (const p of puzzles) themeCounts.set(p.theme, (themeCounts.get(p.theme) ?? 0) + 1);

  function onFinished(cleanSolve: boolean) {
    if (!user || !current) return;
    const state = nextState(states.get(current.id), cleanSolve);
    setCurrentId(current.id);
    setStates((m) => new Map(m).set(current.id, state));
    const done = warmup + 1;
    setWarmup(done);
    // Fire and forget: progress is also kept in memory for this session.
    savePuzzleState(user.uid, current.id, state).catch(() => undefined);
    saveWarmup(user.uid, done).catch(() => undefined);
  }

  function onNext() {
    setCurrentId(queue.find((p) => p.id !== current?.id)?.id ?? null);
  }

  if (loading) return <LoadingCard />;
  if (!user)
    return (
      <div className="card flex items-center gap-4">
        <Mascot mood="shocked" size={64} />
        <p>Sign in to train on puzzles from your own games.</p>
      </div>
    );
  if (error) return <p className="card text-[var(--bad)]">{error}</p>;
  if (!games) return <LoadingCard label="Building puzzles from your blunders…" />;

  if (puzzles.length === 0)
    return (
      <div className="card flex flex-wrap items-center gap-4">
        <Mascot size={64} />
        <p className="flex-1">No puzzles yet: they&apos;re made from the mistakes in your analyzed games.</p>
        <Link href="/games" className="btn-primary">
          Analyze my games
        </Link>
      </div>
    );

  const warmupDone = warmup >= WARMUP_SIZE;
  const pill = (active: boolean) =>
    `rounded-full border-2 px-3 py-0.5 text-sm font-semibold ${
      active ? "border-[var(--gold)] bg-[var(--gold)] text-[var(--on-gold)]" : "border-[var(--line)] bg-[var(--card)]"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-wrap items-center gap-4">
        <Mascot mood={warmupDone ? "proud" : "happy"} size={56} />
        <div className="min-w-48 flex-1">
          <h1 className="font-display text-2xl">Puzzle Gym</h1>
          <ProgressBar
            percent={(Math.min(warmup, WARMUP_SIZE) / WARMUP_SIZE) * 100}
            label={
              warmupDone
                ? `Daily warm-up done (${warmup} puzzles today)! Now go play a rapid game.`
                : `Daily warm-up: ${warmup}/${WARMUP_SIZE} puzzles`
            }
          />
        </div>
        <div className="flex gap-4 text-center text-xs text-[var(--muted)]">
          {(
            [
              ["due", "due today"],
              ["new", "new"],
              ["later", "learning"],
              ["mastered", "mastered"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <p className="font-display text-xl text-[var(--ink)] tabular-nums">{counts[key]}</p>
              <p>{label}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button className={pill(theme === "all")} onClick={() => setTheme("all")}>
          All ({puzzles.length})
        </button>
        {(Object.keys(THEMES) as PuzzleTheme[])
          .filter((t) => themeCounts.get(t))
          .map((t) => (
            <button key={t} className={pill(theme === t)} onClick={() => setTheme(t)}>
              {THEMES[t].name} ({themeCounts.get(t)})
            </button>
          ))}
      </div>

      {current ? (
        <PuzzleBoard key={current.id} puzzle={current} onFinished={onFinished} onNext={onNext} />
      ) : (
        <div className="card flex flex-wrap items-center gap-4">
          <Mascot mood="proud" size={64} />
          <p className="flex-1">
            Nothing due{theme === "all" ? "" : ` in ${THEMES[theme].name}`} right now. Your missed puzzles come back
            tomorrow. Analyze more games for fresh ones!
          </p>
          <Link href="/games" className="btn-secondary">
            Games
          </Link>
        </div>
      )}
    </div>
  );
}
