"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { analyzeGame, isAnalyzed, type GameAnalysis, type GameDoc } from "@/lib/analysis";

// A single background queue for the whole app, so analysis keeps going while you switch pages.
// It stops if the tab is closed; already-analyzed games are saved and skipped next time.

type Current = { id: string; done: number; total: number };

type AnalysisState = {
  /** Adds games to the queue (already analyzed or queued ones are skipped). `first` jumps the queue. */
  enqueue: (games: GameDoc[], opts?: { first?: boolean }) => void;
  cancel: () => void;
  queuedIds: Set<string>;
  current: Current | null;
  /** Analyses finished in this session, so pages can show them without reloading. */
  results: Map<string, GameAnalysis>;
  /** Progress of the current run (games added since the queue was last empty). */
  run: { finished: number; total: number; percent: number } | null;
  error: string | null;
};

const AnalysisContext = createContext<AnalysisState | null>(null);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queue = useRef<GameDoc[]>([]);
  const working = useRef(false);
  const counts = useRef({ finished: 0, total: 0 });
  const finished = useRef(new Map<string, GameAnalysis>());

  // Render snapshots of the refs above.
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<Current | null>(null);
  const [results, setResults] = useState<Map<string, GameAnalysis>>(new Map());
  const [runCount, setRunCount] = useState({ finished: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const publish = useCallback(() => {
    setQueuedIds(new Set(queue.current.map((g) => g.id)));
    setRunCount({ ...counts.current });
  }, []);

  const work = useCallback(
    async (uid: string) => {
      if (working.current) return;
      working.current = true;
      try {
        while (queue.current.length) {
          const game = queue.current.shift()!;
          publish();
          setCurrent({ id: game.id, done: 0, total: game.moves.length + 1 });
          try {
            const analysis = await analyzeGame(uid, game, (done, total) => setCurrent({ id: game.id, done, total }));
            finished.current.set(game.id, analysis);
            setResults(new Map(finished.current));
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            queue.current = [];
          }
          counts.current.finished++;
        }
      } finally {
        working.current = false;
        counts.current = { finished: 0, total: 0 };
        setCurrent(null);
        publish();
      }
    },
    [publish],
  );

  const enqueue = useCallback<AnalysisState["enqueue"]>(
    (games, opts) => {
      if (!user) return;
      setError(null);
      const skip = new Set(queue.current.map((g) => g.id));
      const fresh = games.filter((g) => !isAnalyzed(g) && !finished.current.has(g.id) && !skip.has(g.id));
      if (!fresh.length) return;
      queue.current = opts?.first ? [...fresh, ...queue.current] : [...queue.current, ...fresh];
      counts.current.total += fresh.length;
      publish();
      void work(user.uid);
    },
    [user, publish, work],
  );

  const cancel = useCallback(() => {
    counts.current.total -= queue.current.length;
    queue.current = [];
    publish();
  }, [publish]);

  // Warn before closing the tab mid-analysis.
  const busy = current !== null;
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const run =
    runCount.total > 0
      ? {
          ...runCount,
          percent: ((runCount.finished + (current ? current.done / current.total : 0)) / runCount.total) * 100,
        }
      : null;

  const value: AnalysisState = { enqueue, cancel, queuedIds, current, results, run, error };
  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useAnalysis(): AnalysisState {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error("useAnalysis must be used inside <AnalysisProvider>");
  return ctx;
}
