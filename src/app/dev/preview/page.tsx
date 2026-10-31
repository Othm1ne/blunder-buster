"use client";

import { GameRow } from "@/components/GameRow";
import { Mascot } from "@/components/Mascot";
import { ProgressBar } from "@/components/ProgressBar";
import { ReviewView } from "@/components/review/ReviewScreen";
import type { GameDoc } from "@/lib/analysis";
import { reviewGame } from "@/lib/classify";
import sample from "@/dev/sampleGame.json";

// Dev-only page: renders the main UI pieces with a sample game (no login needed),
// so the design can be checked in light and dark mode. Open /dev/preview while running `npm run dev`.

const game = sample as GameDoc;
const noop = () => {};
// Opens on the opponent's (Morphy's) final queen sacrifice: a Brilliant move.
const firstFlagged = reviewGame(game.moves, game.analysis!.evals, game.myColor, game.result, game.clocks)
  .moves.filter((m) => m.label === "brilliant")
  .at(-1);

export default function Preview() {
  if (process.env.NODE_ENV === "production") return <p>Not available.</p>;
  const unanalyzed = { ...game, id: "b", analysis: undefined, result: "win" as const, oppName: "Knightmare" };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl">Design preview</h1>

      <section className="card flex flex-wrap items-center gap-3">
        <Mascot mood="happy" size={56} />
        <Mascot mood="shocked" size={56} />
        <Mascot mood="proud" size={56} />
        <button className="btn-primary">Primary</button>
        <button className="btn-secondary">Secondary</button>
        <div className="min-w-60 flex-1">
          <ProgressBar percent={64} label="Saving games from Oct 2026 (200/312)…" />
        </div>
        <div className="min-w-60 flex-1">
          <ProgressBar label="Loading…" />
        </div>
      </section>

      <ul className="flex flex-col gap-2">
        <GameRow game={game} analysis={game.analysis} queued={false} onAnalyze={noop} />
        <GameRow game={unanalyzed} queued={false} percent={42} onAnalyze={noop} />
        <GameRow game={{ ...unanalyzed, id: "c", result: "draw" }} queued onAnalyze={noop} />
        <GameRow game={{ ...unanalyzed, id: "d" }} queued={false} onAnalyze={noop} />
      </ul>

      <ReviewView game={game} analysis={game.analysis!} initialPly={firstFlagged?.ply ?? 0} />
    </div>
  );
}
