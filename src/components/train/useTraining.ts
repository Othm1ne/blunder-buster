"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useAnalysis } from "@/components/AnalysisProvider";
import type { GameDoc } from "@/lib/analysis";
import { listGames } from "@/lib/games";
import { useOpeningBook } from "@/lib/openings";
import { reviewAll, type ReviewedGame } from "@/lib/profile";
import { loadTraining, type TrainingDoc } from "@/lib/training";

/** What the training pages need: your games (reviewed) and your training progress. */
export function useTraining({ withGames = true } = {}) {
  const { user, loading } = useAuth();
  const { results } = useAnalysis();
  const book = useOpeningBook();
  const [games, setGames] = useState<GameDoc[] | null>(null);
  const [training, setTraining] = useState<TrainingDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([withGames ? listGames(user.uid) : Promise.resolve([]), loadTraining(user.uid)])
      .then(([g, t]) => {
        if (cancelled) return;
        setGames(g);
        setTraining(t);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [user, withGames]);

  const reviewed = useMemo<ReviewedGame[] | null>(
    () => (games && book !== undefined ? (withGames ? reviewAll(games, results, book) : []) : null),
    [games, results, book, withGames],
  );

  return { user, loading, error, games, reviewed, training, setTraining };
}
