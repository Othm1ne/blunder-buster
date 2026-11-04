"use client";

import Link from "next/link";
import { useState } from "react";
import { Mascot } from "@/components/Mascot";
import { LoadingCard } from "@/components/ProgressBar";
import { PlayBoard } from "@/components/train/PlayBoard";
import { useTraining } from "@/components/train/useTraining";
import { ENDGAMES, goalText, type Endgame, type Verdict } from "@/lib/arena";
import { recordActivity } from "@/lib/progress";
import { saveEndgame } from "@/lib/training";

export default function EndgamesPage() {
  const { user, loading, error, training, setTraining } = useTraining({ withGames: false });
  const [current, setCurrent] = useState<Endgame | null>(null);

  function onEnd(lesson: Endgame, v: Verdict, moves: number) {
    if (!user || !v.won) return;
    recordActivity(user.uid).catch(() => undefined);
    const prev = training?.endgames?.[lesson.id];
    if (prev && (prev.stars > v.stars || (prev.stars === v.stars && prev.moves <= moves))) return;
    setTraining((t) => ({ ...t, endgames: { ...t?.endgames, [lesson.id]: { stars: v.stars, moves, at: Date.now() } } }));
    saveEndgame(user.uid, lesson.id, v.stars, moves).catch(() => undefined);
  }

  if (loading) return <LoadingCard />;
  if (!user)
    return (
      <div className="card flex items-center gap-4">
        <Mascot mood="shocked" size={64} />
        <p>Sign in to train endgames.</p>
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
        <h1 className="font-display text-2xl">Endgame Arena</h1>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {ENDGAMES.map((e) => {
          const best = training.endgames?.[e.id];
          const active = current?.id === e.id;
          return (
            <button
              key={e.id}
              onClick={() => setCurrent(e)}
              className={`card !p-3 text-left ${active ? "!border-[var(--gold)]" : ""}`}
              aria-pressed={active}
            >
              <p className="font-display">{e.title}</p>
              <p className="text-xs text-[var(--muted)]">{goalText(e.goal).split(" (")[0]}</p>
              <p className="mt-1 text-sm" aria-label={`${best?.stars ?? 0} of 3 stars`}>
                {"⭐".repeat(best?.stars ?? 0)}
                <span className="opacity-25">{"⭐".repeat(3 - (best?.stars ?? 0))}</span>
              </p>
            </button>
          );
        })}
      </div>

      {current ? (
        <PlayBoard
          key={current.id}
          fen={current.fen}
          color={current.fen.split(" ")[1] === "w" ? "w" : "b"}
          goal={current.goal}
          title={current.title}
          tip={current.tip}
          onEnd={(v, moves) => onEnd(current, v, moves)}
        />
      ) : (
        <div className="card flex flex-wrap items-center gap-4">
          <Mascot size={56} />
          <p className="min-w-0 flex-1 text-sm">
            Pick an endgame. These come up in real games all the time, and Stockfish defends perfectly, so you&apos;ll need
            the right technique. Start with the ladder mate!
          </p>
        </div>
      )}
    </div>
  );
}
