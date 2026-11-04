"use client";

import Link from "next/link";
import { useState } from "react";
import { Mascot } from "@/components/Mascot";
import { LoadingCard } from "@/components/ProgressBar";
import { GuessBoard } from "@/components/train/GuessBoard";
import { useTraining } from "@/components/train/useTraining";
import { MASTER_GAMES, type MasterGame } from "@/lib/masters";
import { recordActivity } from "@/lib/progress";
import { saveGuess } from "@/lib/training";

export default function GuessPage() {
  const { user, loading, error, training, setTraining } = useTraining({ withGames: false });
  const [current, setCurrent] = useState<MasterGame | null>(null);
  // Restarting the same game remounts the board.
  const [round, setRound] = useState(0);

  function onFinish(game: MasterGame, percent: number) {
    if (!user) return;
    recordActivity(user.uid).catch(() => undefined);
    if ((training?.guess?.[game.id]?.best ?? -1) >= percent) return;
    setTraining((t) => ({ ...t, guess: { ...t?.guess, [game.id]: { best: percent, at: Date.now() } } }));
    saveGuess(user.uid, game.id, percent).catch(() => undefined);
  }

  if (loading) return <LoadingCard />;
  if (!user)
    return (
      <div className="card flex items-center gap-4">
        <Mascot mood="shocked" size={64} />
        <p>Sign in to play Guess the Move.</p>
      </div>
    );
  if (error) return <p className="card text-[var(--bad)]">{error}</p>;
  if (!training) return <LoadingCard />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/train" className="text-sm underline">
          ← Training
        </Link>
        <h1 className="font-display text-2xl">Guess the Move</h1>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {MASTER_GAMES.map((g) => {
          const best = training.guess?.[g.id]?.best;
          const active = current?.id === g.id;
          return (
            <button
              key={g.id}
              onClick={() => {
                setCurrent(g);
                setRound((r) => r + 1);
              }}
              className={`card !p-3 text-left ${active ? "!border-[var(--gold)]" : ""}`}
              aria-pressed={active}
            >
              <p className="font-display">{g.title}</p>
              <p className="text-xs text-[var(--muted)]">
                {g.white} vs {g.black}, {g.year} · you play {g.side === "w" ? "White" : "Black"}
              </p>
              <p className="mt-1 text-sm font-semibold">{best === undefined ? "Not played yet" : `Best: ${best}%`}</p>
            </button>
          );
        })}
      </div>

      {current ? (
        <GuessBoard key={`${current.id}-${round}`} game={current} onFinish={(p) => onFinish(current, p)} />
      ) : (
        <div className="card flex flex-wrap items-center gap-4">
          <Mascot size={56} />
          <p className="min-w-0 flex-1 text-sm">
            Pick a famous game. You play the winner: guess each move. The master&apos;s move scores 5 points, and Stockfish
            gives up to 4 for a move that&apos;s just as good.
          </p>
        </div>
      )}
    </div>
  );
}
