"use client";

import { GameRow } from "@/components/GameRow";
import { Mascot } from "@/components/Mascot";
import { ProgressBar } from "@/components/ProgressBar";
import { ReviewView } from "@/components/review/ReviewScreen";
import type { GameDoc } from "@/lib/analysis";
import { reviewGame } from "@/lib/classify";
import sample from "@/dev/sampleGame.json";
import { ProfileView } from "@/components/profile/ProfileView";
import type { Profile } from "@/lib/profile";

// Dev-only page: renders the main UI pieces with a sample game (no login needed),
// so the design can be checked in light and dark mode. Open /dev/preview while running `npm run dev`.

const game = sample as GameDoc;
const noop = () => {};
// Opens on the opponent's (Morphy's) final queen sacrifice: a Brilliant move.
const firstFlagged = reviewGame(game.moves, game.analysis!.evals, game.myColor, game.result, game.clocks)
  .moves.filter((m) => m.label === "brilliant")
  .at(-1);

// A made-up profile (30 games, improving) to check the Blunder Profile design.
const sampleMoves = reviewGame(game.moves, game.analysis!.evals, game.myColor, game.result, game.clocks).moves;
const ex = (ply: number) => ({ gameId: "preview", ply, move: { ...sampleMoves[ply - 1], label: "blunder" as const }, oppName: "MorphyFan" });
const sampleProfile: Profile = {
  games: 30,
  blundersPerGame: 2.4,
  mistakesPerGame: 1.6,
  accuracy: 71.3,
  types: [
    { type: "hung_piece", count: 31, share: 0.43, examples: [ex(18), ex(22), ex(26)] },
    { type: "missed_material", count: 17, share: 0.24, examples: [ex(14), ex(20)] },
    { type: "fork", count: 9, share: 0.13, examples: [ex(24)] },
    { type: "other", count: 14, share: 0.2, examples: [] },
  ],
  phases: { opening: 12, middlegame: 47, endgame: 13 },
  timeTroubleShare: 0.31,
  failedToConvert: 4,
  trend: Array.from({ length: 30 }, (_, i) => {
    const blunders = Math.max(0, Math.round(3.6 - i * 0.07 + Math.sin(i * 1.7) * 1.4));
    return { gameId: "preview", endTime: Date.UTC(2026, 8, 1 + i * 2), oppName: `Player${i + 1}`, blunders, rolling: 3.4 - i * 0.06 };
  }),
};
const sampleBaseline = { createdAt: Date.UTC(2026, 8, 1), rapidRating: 600, blitzRating: 530, blundersPerGame: 3.1, mistakesPerGame: 1.9, accuracy: 66, games: 30 };

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

      <ProfileView profile={sampleProfile} baseline={sampleBaseline} onResetBaseline={noop} />

      <ReviewView game={game} analysis={game.analysis!} initialPly={firstFlagged?.ply ?? 0} />
    </div>
  );
}
