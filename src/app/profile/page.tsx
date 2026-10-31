"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useAnalysis } from "@/components/AnalysisProvider";
import { Mascot } from "@/components/Mascot";
import { LoadingCard } from "@/components/ProgressBar";
import { ProfileView } from "@/components/profile/ProfileView";
import type { GameDoc } from "@/lib/analysis";
import type { TimeClass } from "@/lib/chesscom";
import { getProfile, listGames, saveBaseline, type Baseline } from "@/lib/games";
import { useOpeningBook } from "@/lib/openings";
import { baselineFrom, buildProfile, reviewAll } from "@/lib/profile";

/** The baseline is saved automatically once you have this many analyzed games. */
const BASELINE_MIN_GAMES = 10;
const MIN_GAMES = 3;
const WINDOWS = [20, 50, 100] as const;

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const { results } = useAnalysis();
  const book = useOpeningBook();
  const [games, setGames] = useState<GameDoc[] | null>(null);
  const [baseline, setBaseline] = useState<Baseline | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | TimeClass>("all");
  const [windowSize, setWindowSize] = useState<(typeof WINDOWS)[number]>(50);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([listGames(user.uid), getProfile(user.uid)])
      .then(([g, p]) => {
        if (cancelled) return;
        setGames(g);
        setBaseline(p.baseline);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const allReviewed = useMemo(() => (games ? reviewAll(games, results, book) : []), [games, results, book]);
  const reviewed = useMemo(
    () =>
      allReviewed
        .filter((r) => filter === "all" || r.game.timeClass === filter)
        .sort((a, b) => b.game.endTime - a.game.endTime)
        .slice(0, windowSize),
    [allReviewed, filter, windowSize],
  );
  const profile = useMemo(() => buildProfile(reviewed), [reviewed]);

  // Save the day-1 baseline automatically, once, from all your analyzed games.
  useEffect(() => {
    if (!user || !games || baseline || allReviewed.length < BASELINE_MIN_GAMES) return;
    const snapshot = baselineFrom(buildProfile(allReviewed.slice(0, 50)), allReviewed);
    saveBaseline(user.uid, snapshot)
      .then(() => setBaseline(snapshot))
      .catch(() => undefined);
  }, [user, games, baseline, allReviewed]);

  function resetBaseline() {
    if (!user || !confirm("Replace your day-1 baseline with today's numbers? Your progress will be measured from now on.")) return;
    const snapshot = baselineFrom(buildProfile(allReviewed.slice(0, 50)), allReviewed);
    saveBaseline(user.uid, snapshot).then(() => setBaseline(snapshot));
  }

  if (loading) return <LoadingCard />;
  if (!user)
    return (
      <div className="card flex items-center gap-4">
        <Mascot mood="shocked" size={64} />
        <p>Sign in to see your Blunder Profile.</p>
      </div>
    );
  if (error) return <p className="card text-[var(--bad)]">{error}</p>;
  if (!games) return <LoadingCard label="Studying your games…" />;

  if (allReviewed.length < MIN_GAMES)
    return (
      <div className="card flex flex-wrap items-center gap-4">
        <Mascot size={64} />
        <p className="flex-1">
          Sir Blunderbuss needs at least {MIN_GAMES} analyzed games to find your patterns (you have {allReviewed.length}).
        </p>
        <Link href="/games" className="btn-primary">
          Analyze my games
        </Link>
      </div>
    );

  const pill = (active: boolean) =>
    `rounded-full border-2 px-3 py-0.5 text-sm font-semibold ${
      active ? "border-[var(--gold)] bg-[var(--gold)] text-[var(--on-gold)]" : "border-[var(--line)] bg-[var(--card)]"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "rapid", "blitz"] as const).map((f) => (
          <button key={f} className={`${pill(filter === f)} capitalize`} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-[var(--line)]" />
        {WINDOWS.map((w) => (
          <button key={w} className={pill(windowSize === w)} onClick={() => setWindowSize(w)}>
            Last {w}
          </button>
        ))}
        <span className="ml-auto text-xs text-[var(--muted)]">
          {reviewed.length} analyzed game{reviewed.length === 1 ? "" : "s"}
        </span>
      </div>
      {reviewed.length === 0 ? (
        <p className="card text-sm">No analyzed {filter} games yet.</p>
      ) : (
        <ProfileView profile={profile} baseline={baseline} onResetBaseline={resetBaseline} />
      )}
    </div>
  );
}
