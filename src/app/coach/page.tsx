"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useAnalysis } from "@/components/AnalysisProvider";
import { Mascot } from "@/components/Mascot";
import { LoadingCard } from "@/components/ProgressBar";
import { GoalCard } from "@/components/coach/GoalCard";
import { PlanCard } from "@/components/coach/PlanCard";
import { ReportCardView } from "@/components/coach/ReportCardView";
import type { GameDoc } from "@/lib/analysis";
import { getProfile, listGames } from "@/lib/games";
import { goalProgress, ratingHistory, saveGoal, type RatingGoal } from "@/lib/goal";
import { useOpeningBook } from "@/lib/openings";
import { loadPlan, planRequest, requestPlan, saveDone, savePlan, templatePlan, type StoredPlan } from "@/lib/plan";
import { buildProfile, reviewAll } from "@/lib/profile";
import { buildPuzzles } from "@/lib/puzzles";
import { dayIndex, previousWeek, weekKey, weekStart, weekStats } from "@/lib/weekly";

/** The plan is built from your latest analyzed games (like the Blunder Profile's default window). */
const PLAN_GAMES = 50;
const MIN_GAMES = 3;

export default function CoachPage() {
  const { user, loading } = useAuth();
  const { results } = useAnalysis();
  const book = useOpeningBook();
  const [games, setGames] = useState<GameDoc[] | null>(null);
  const [goal, setGoal] = useState<RatingGoal | undefined>(undefined);
  const [plan, setPlan] = useState<StoredPlan | null | undefined>(undefined);
  const [planState, setPlanState] = useState<"loading" | "ready">("ready");
  const [planError, setPlanError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const week = weekKey(weekStart());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([listGames(user.uid), getProfile(user.uid), loadPlan(user.uid, week)])
      .then(([g, p, stored]) => {
        if (cancelled) return;
        setGames(g);
        setGoal(p.goal);
        setPlan(stored);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [user, week]);

  const reviewed = useMemo(() => (games && book !== undefined ? reviewAll(games, results, book) : null), [games, results, book]);
  const latest = useMemo(
    () => (reviewed ? [...reviewed].sort((a, b) => b.game.endTime - a.game.endTime).slice(0, PLAN_GAMES) : []),
    [reviewed],
  );

  const writePlan = useCallback(
    async (existing: StoredPlan | null) => {
      if (!user || !games || latest.length < MIN_GAMES) return;
      setPlanState("loading");
      setPlanError(null);
      const profile = buildProfile(latest);
      const puzzles = buildPuzzles(latest);
      const ratings: { rapid?: number; blitz?: number } = {};
      for (const tc of ["rapid", "blitz"] as const) {
        const r = ratingHistory(games, tc).at(-1)?.rating;
        if (r) ratings[tc] = r;
      }
      const req = planRequest({
        profile,
        puzzles,
        ratings,
        goal,
        goalCurrent: goal && goalProgress(goal, games).current,
        lastWeek: reviewed ? weekStats(games, reviewed, previousWeek(weekStart())) : undefined,
      });
      let next: StoredPlan;
      try {
        const { model, ...answer } = await requestPlan(user, req);
        next = { week, plan: answer, source: "ai", model, createdAt: Date.now(), done: existing?.done ?? [] };
      } catch (e) {
        setPlanError(e instanceof Error ? e.message : String(e));
        // Keep what's there; only a missing plan gets the template one.
        if (existing) return setPlanState("ready");
        next = { week, plan: templatePlan(profile, puzzles), source: "template", createdAt: Date.now(), done: [] };
      }
      setPlan(next);
      setPlanState("ready");
      await savePlan(user.uid, next).catch((e) => setPlanError(e instanceof Error ? e.message : String(e)));
    },
    [user, games, latest, goal, reviewed, week],
  );

  // First visit of the week: write the plan.
  const asked = useRef(false);
  useEffect(() => {
    if (plan !== null || asked.current || latest.length < MIN_GAMES) return;
    asked.current = true;
    void writePlan(null);
  }, [plan, latest, writePlan]);

  async function onSaveGoal(next: RatingGoal | null) {
    if (!user) return;
    await saveGoal(user.uid, next);
    setGoal(next ?? undefined);
  }

  function onToggle(day: number) {
    if (!user || !plan) return;
    const done = plan.done.includes(day) ? plan.done.filter((d) => d !== day) : [...plan.done, day].sort();
    setPlan({ ...plan, done });
    saveDone(user.uid, plan.week, done).catch((e) => setPlanError(e instanceof Error ? e.message : String(e)));
  }

  if (loading) return <LoadingCard />;
  if (!user)
    return (
      <div className="card flex items-center gap-4">
        <Mascot mood="shocked" size={64} />
        <p>Sign in to get your weekly plan and report card.</p>
      </div>
    );
  if (error) return <p className="card text-[var(--bad)]">{error}</p>;
  if (!games || !reviewed || plan === undefined) return <LoadingCard label="Sir Blunderbuss is preparing your coaching…" />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl">Your coach</h1>
      {latest.length < MIN_GAMES && (
        <div className="card flex flex-wrap items-center gap-4">
          <Mascot size={56} />
          <p className="flex-1 text-sm">
            Analyze at least {MIN_GAMES} games and Sir Blunderbuss will write your weekly plan (you have {latest.length}).
          </p>
          <Link href="/games" className="btn-primary">
            Analyze my games
          </Link>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <PlanCard
          stored={plan}
          state={planState}
          error={planError}
          today={dayIndex()}
          onToggle={onToggle}
          onRegenerate={() => void writePlan(plan)}
        />
        <div className="flex min-w-0 flex-col gap-4">
          <GoalCard goal={goal} games={games} onSave={onSaveGoal} />
          <ReportCardView games={games} reviewed={reviewed} />
        </div>
      </div>
    </div>
  );
}
