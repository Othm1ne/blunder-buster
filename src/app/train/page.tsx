"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { Mascot } from "@/components/Mascot";
import { LoadingCard } from "@/components/ProgressBar";
import { NemesisCard } from "@/components/train/NemesisCard";
import { useTraining } from "@/components/train/useTraining";
import { ENDGAMES, findBosses } from "@/lib/arena";
import { MASTER_GAMES } from "@/lib/masters";
import { buildProfile } from "@/lib/profile";
import { buildPuzzles } from "@/lib/puzzles";
import { pickNemesis, saveNemesis, type NemesisState } from "@/lib/training";

/** The nemesis is picked from your latest games, like the Blunder Profile. */
const PROFILE_GAMES = 50;

export default function TrainPage() {
  const { user, loading, error, reviewed, training, setTraining } = useTraining();

  const latest = useMemo(
    () => (reviewed ? [...reviewed].sort((a, b) => b.game.endTime - a.game.endTime).slice(0, PROFILE_GAMES) : []),
    [reviewed],
  );
  const puzzles = useMemo(() => (reviewed ? buildPuzzles(reviewed) : []), [reviewed]);
  const bosses = useMemo(() => (reviewed ? findBosses(reviewed) : []), [reviewed]);

  function newNemesis(beaten?: NemesisState["beaten"]) {
    if (!user || !latest.length) return;
    const next = pickNemesis(buildProfile(latest), puzzles, beaten);
    if (!next) return;
    setTraining((t) => ({ ...t, nemesis: next }));
    saveNemesis(user.uid, next).catch(() => undefined);
  }

  // First visit: your worst weakness becomes your nemesis (it stays until you beat it).
  const picked = useRef(false);
  useEffect(() => {
    if (!training || training.nemesis || picked.current || !latest.length) return;
    picked.current = true;
    newNemesis();
  });

  if (loading) return <LoadingCard />;
  if (!user)
    return (
      <div className="card flex items-center gap-4">
        <Mascot mood="shocked" size={64} />
        <p>Sign in to train on your own games.</p>
      </div>
    );
  if (error) return <p className="card text-[var(--bad)]">{error}</p>;
  if (!training || !reviewed) return <LoadingCard label="Sir Blunderbuss is setting up the training ground…" />;

  const stars = ENDGAMES.reduce((s, e) => s + (training.endgames?.[e.id]?.stars ?? 0), 0);
  const beaten = bosses.filter((b) => training.bosses?.[b.id]?.beatenAt).length;
  const played = MASTER_GAMES.filter((g) => training.guess?.[g.id]).length;
  const nemesis = training.nemesis;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl">Training</h1>

      <NemesisCard nemesis={nemesis} onNext={() => newNemesis(nemesis?.beaten)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Tile href="/puzzles" icon="🧩" title="Puzzle Gym" text="Puzzles made from your own mistakes, with spaced repetition." stat={`${puzzles.length} puzzles`} />
        <Tile
          href="/train/endgames"
          icon="👑"
          title="Endgame Arena"
          text="Learn the mates and pawn endings every player needs, against Stockfish."
          stat={`${stars}/${ENDGAMES.length * 3} ⭐`}
        />
        <Tile
          href="/train/boss"
          icon="🐉"
          title="Boss Fights"
          text="Positions you were winning and didn't win. Replay them and finish the job."
          stat={bosses.length ? `${beaten}/${bosses.length} beaten` : "no bosses yet"}
        />
        <Tile
          href="/train/guess"
          icon="🎩"
          title="Guess the Move"
          text="Play through famous master games and guess every move."
          stat={`${played}/${MASTER_GAMES.length} games played`}
        />
      </div>
    </div>
  );
}

function Tile({ href, icon, title, text, stat }: { href: string; icon: string; title: string; text: string; stat: string }) {
  return (
    <Link href={href} className="card flex items-start gap-3 transition-transform hover:-translate-y-0.5">
      <span className="text-3xl" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg">{title}</h2>
        <p className="text-sm text-[var(--muted)]">{text}</p>
        <p className="mt-1 text-sm font-semibold">{stat}</p>
      </div>
    </Link>
  );
}
