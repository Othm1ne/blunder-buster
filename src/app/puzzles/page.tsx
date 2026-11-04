"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useAnalysis } from "@/components/AnalysisProvider";
import { Mascot } from "@/components/Mascot";
import { LoadingCard, ProgressBar } from "@/components/ProgressBar";
import { PuzzleBoard } from "@/components/puzzles/PuzzleBoard";
import type { GameDoc } from "@/lib/analysis";
import { listGames } from "@/lib/games";
import { useOpeningBook } from "@/lib/openings";
import { reviewAll } from "@/lib/profile";
import { recordActivity } from "@/lib/progress";
import {
  buildPuzzles,
  loadPuzzleStates,
  loadBlunderCheck,
  loadWarmup,
  nextState,
  recordBlunderCheck,
  practiceQueue,
  savePuzzleState,
  saveWarmup,
  statusOf,
  THEMES,
  WARMUP_SIZE,
  type BlunderCheckStats,
  type PuzzleState,
  type PuzzleTheme,
} from "@/lib/puzzles";
import { hitNemesis, loadTraining, NEMESIS_HP, NEMESIS_NAMES, nemesisQueue, saveNemesis, type NemesisState } from "@/lib/training";

/** The blunder-check switch is a per-device preference (on by default). */
const CHECK_KEY = "blunderCheck";
function readCheckPref(): boolean {
  try {
    return localStorage.getItem(CHECK_KEY) !== "off";
  } catch {
    return true;
  }
}

// /puzzles?theme=fork opens on one theme (the weekly plan links here); /puzzles?nemesis=1 is the nemesis fight.
export default function PuzzlesPage() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <PuzzlesFromUrl />
    </Suspense>
  );
}

function PuzzlesFromUrl() {
  const params = useSearchParams();
  const theme = params.get("theme");
  return (
    <PuzzleGym initialTheme={theme && theme in THEMES ? (theme as PuzzleTheme) : "all"} fight={params.get("nemesis") === "1"} />
  );
}

function PuzzleGym({ initialTheme, fight }: { initialTheme: "all" | PuzzleTheme; fight: boolean }) {
  const { user, loading } = useAuth();
  const { results } = useAnalysis();
  const book = useOpeningBook();
  const [games, setGames] = useState<GameDoc[] | null>(null);
  const [states, setStates] = useState<Map<string, PuzzleState>>(new Map());
  const [warmup, setWarmup] = useState(0);
  const [check, setCheck] = useState(readCheckPref);
  const [checkStats, setCheckStats] = useState<BlunderCheckStats>({ asked: 0, correct: 0 });
  const [nemesis, setNemesis] = useState<NemesisState | undefined>(undefined);
  const [hitText, setHitText] = useState<string | null>(null);
  const [theme, setTheme] = useState<"all" | PuzzleTheme>(initialTheme);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([listGames(user.uid), loadPuzzleStates(user.uid), loadWarmup(user.uid), loadBlunderCheck(user.uid), loadTraining(user.uid)])
      .then(([g, s, w, c, t]) => {
        if (cancelled) return;
        setCheckStats(c);
        setNemesis(t.nemesis);
        setGames(g);
        setStates(s);
        setWarmup(w);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const puzzles = useMemo(
    () => (games && book !== undefined ? buildPuzzles(reviewAll(games, results, book)) : []),
    [games, results, book],
  );
  const fighting = fight && nemesis && nemesis.hits < NEMESIS_HP ? nemesis : undefined;
  const shownTheme = fighting ? fighting.theme : theme;
  const shown = useMemo(() => (shownTheme === "all" ? puzzles : puzzles.filter((p) => p.theme === shownTheme)), [puzzles, shownTheme]);
  // The nemesis fight goes on after the due puzzles run out: the theme's other puzzles come back round.
  const queue = useMemo(() => {
    const fresh = practiceQueue(shown, states);
    return fighting ? nemesisQueue(puzzles, fighting.theme, states, fresh) : fresh;
  }, [shown, states, fighting, puzzles]);
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
    recordActivity(user.uid, { warmupDone: done === WARMUP_SIZE }).catch(() => undefined);

    if (nemesis && nemesis.hits < NEMESIS_HP && current.theme === nemesis.theme) {
      const { next, defeated } = hitNemesis(nemesis, cleanSolve);
      setNemesis(next);
      setHitText(
        defeated
          ? `${NEMESIS_NAMES[nemesis.type]} is defeated!`
          : cleanSolve
            ? `Hit! ${NEMESIS_NAMES[nemesis.type]} is down to ${NEMESIS_HP - next.hits} HP.`
            : `${NEMESIS_NAMES[nemesis.type]} heals to ${NEMESIS_HP - next.hits} HP. Solve it first try to hit it!`,
      );
      saveNemesis(user.uid, next).catch(() => undefined);
    }
  }

  function onCheck(correct: boolean) {
    if (!user) return;
    setCheckStats((c) => ({ asked: c.asked + 1, correct: c.correct + (correct ? 1 : 0) }));
    recordBlunderCheck(user.uid, correct).catch(() => undefined);
  }

  function toggleCheck() {
    const next = !check;
    setCheck(next);
    try {
      localStorage.setItem(CHECK_KEY, next ? "on" : "off");
    } catch {
      // private mode: the switch just won't be remembered
    }
  }

  function onNext() {
    setHitText(null);
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
  if (!games || book === undefined) return <LoadingCard label="Building puzzles from your blunders…" />;

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

      {!fighting && (
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
      )}

      <div className="card flex flex-wrap items-center gap-3 !py-2 text-sm">
        <button
          role="switch"
          aria-checked={check}
          onClick={toggleCheck}
          className={`rounded-full border-2 px-3 py-0.5 font-semibold ${
            check ? "border-[var(--good)] bg-[var(--good)] text-white" : "border-[var(--line)] bg-[var(--card)]"
          }`}
        >
          🛡️ Blunder check {check ? "on" : "off"}
        </button>
        <span className="min-w-48 flex-1 text-[var(--muted)]">
          Before each move, spot what their last move attacks.
          {checkStats.asked > 0 &&
            ` You've spotted it right ${Math.round((checkStats.correct / checkStats.asked) * 100)}% of the time (${checkStats.correct}/${checkStats.asked}).`}
        </span>
      </div>

      {(fight || hitText) && nemesis && (
        <section className="card flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-4xl" aria-hidden>
              {nemesis.hits >= NEMESIS_HP ? "💀" : "👹"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg">Nemesis fight: {NEMESIS_NAMES[nemesis.type]}</p>
              <p className="text-xs text-[var(--muted)]">
                {THEMES[nemesis.theme].name} puzzles only. First-try solves hit it, misses heal it.
              </p>
            </div>
            <Link href="/train" className="text-sm underline">
              Training
            </Link>
          </div>
          <ProgressBar
            percent={(Math.max(0, NEMESIS_HP - nemesis.hits) / NEMESIS_HP) * 100}
            label={nemesis.hits >= NEMESIS_HP ? "Defeated!" : `${NEMESIS_HP - nemesis.hits}/${NEMESIS_HP} HP`}
          />
          {hitText && <p className="text-sm font-semibold">{hitText}</p>}
        </section>
      )}

      {current ? (
        <PuzzleBoard
          key={`${current.id}-${check}`}
          puzzle={current}
          onFinished={onFinished}
          onNext={onNext}
          blunderCheck={check}
          onCheck={onCheck}
        />
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
