"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Mascot } from "@/components/Mascot";
import { LoadingCard } from "@/components/ProgressBar";
import { PlayBoard } from "@/components/train/PlayBoard";
import { useTraining } from "@/components/train/useTraining";
import { BOSS_GOAL, findBosses, type Boss, type Verdict } from "@/lib/arena";
import { recordActivity } from "@/lib/progress";
import { recordBoss } from "@/lib/training";

const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default function BossPage() {
  const { user, loading, error, reviewed, training, setTraining } = useTraining();
  const bosses = useMemo(() => (reviewed ? findBosses(reviewed) : []), [reviewed]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const current = bosses.find((b) => b.id === currentId) ?? null;

  function onEnd(boss: Boss, v: Verdict) {
    if (!user) return;
    recordActivity(user.uid).catch(() => undefined);
    setTraining((t) => {
      const prev = t?.bosses?.[boss.id];
      const next = { tries: (prev?.tries ?? 0) + 1, ...((v.won || prev?.beatenAt) && { beatenAt: prev?.beatenAt ?? Date.now() }) };
      return { ...t, bosses: { ...t?.bosses, [boss.id]: next } };
    });
    recordBoss(user.uid, boss.id, v.won && !training?.bosses?.[boss.id]?.beatenAt).catch(() => undefined);
  }

  if (loading) return <LoadingCard />;
  if (!user)
    return (
      <div className="card flex items-center gap-4">
        <Mascot mood="shocked" size={64} />
        <p>Sign in to fight your bosses.</p>
      </div>
    );
  if (error) return <p className="card text-[var(--bad)]">{error}</p>;
  if (!training || !reviewed) return <LoadingCard label="Finding the games that got away…" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/train" className="text-sm underline">
          ← Training
        </Link>
        <h1 className="font-display text-2xl">Boss Fights</h1>
      </div>

      {bosses.length === 0 ? (
        <div className="card flex flex-wrap items-center gap-4">
          <Mascot mood="proud" size={56} />
          <p className="min-w-0 flex-1 text-sm">
            No bosses! A boss appears when you were clearly winning a game and didn&apos;t win it. Analyze more games to find
            them.
          </p>
          <Link href="/games" className="btn-secondary">
            Games
          </Link>
        </div>
      ) : (
        <>
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {bosses.map((b) => {
              const state = training.bosses?.[b.id];
              const active = b.id === current?.id;
              return (
                <li key={b.id} className="shrink-0">
                  <button
                    onClick={() => setCurrentId(b.id)}
                    className={`card !p-3 w-44 text-left ${active ? "!border-[var(--gold)]" : ""}`}
                    aria-pressed={active}
                  >
                    <p className="font-display">
                      {state?.beatenAt ? "💀" : "🐉"} vs {b.oppName}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {fmtDate(b.endTime)} · you {b.result === "loss" ? "lost" : "drew"}
                    </p>
                    <p className="mt-1 text-xs font-semibold">
                      {state?.beatenAt ? "Beaten!" : state?.tries ? `${state.tries} tries` : "Not fought yet"}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          {current ? (
            <PlayBoard
              key={current.id}
              fen={current.fen}
              color={current.color}
              goal={BOSS_GOAL}
              title={`Boss: vs ${current.oppName}`}
              tip="You're winning here. Before every move, check what their last move attacks, then keep it simple: trade pieces, protect everything."
              onEnd={(v) => onEnd(current, v)}
            >
              <div className="card text-sm text-[var(--muted)]">
                In the game you had {Math.round(current.winBefore)}% winning chances here, played{" "}
                <strong className="text-[var(--bad)]">{current.played}</strong> and {current.result === "loss" ? "lost" : "only drew"}.{" "}
                <Link href={`/review?id=${current.gameId}&ply=${current.ply}`} className="underline">
                  See the game
                </Link>
              </div>
            </PlayBoard>
          ) : (
            <div className="card flex flex-wrap items-center gap-4">
              <Mascot size={56} />
              <p className="min-w-0 flex-1 text-sm">
                {bosses.length} {bosses.length === 1 ? "game" : "games"} got away from you. Pick one and win it this time,
                against Stockfish!
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
