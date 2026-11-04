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
import { PuzzleBoard } from "@/components/puzzles/PuzzleBoard";
import type { Puzzle } from "@/lib/puzzles";
import { GoalCard } from "@/components/coach/GoalCard";
import { PlanCard } from "@/components/coach/PlanCard";
import { ReportCardView } from "@/components/coach/ReportCardView";
import type { RatingGoal } from "@/lib/goal";
import { templatePlan, type StoredPlan } from "@/lib/plan";
import { dayIndex } from "@/lib/weekly";
import { GuessBoard } from "@/components/train/GuessBoard";
import { NemesisCard } from "@/components/train/NemesisCard";
import { PlayBoard } from "@/components/train/PlayBoard";
import { ENDGAMES } from "@/lib/arena";
import { MASTER_GAMES } from "@/lib/masters";
import { SkillRadar } from "@/components/profile/SkillRadar";
import { SyncReactions } from "@/components/SyncReactions";

// Dev-only page: renders the main UI pieces with a sample game (no login needed),
// so the design can be checked in light and dark mode. Open /dev/preview while running `npm run dev`.

const game = sample as GameDoc;
const noop = () => {};
// Opens on the opponent's (Morphy's) final queen sacrifice: a Brilliant move.
const firstFlagged = reviewGame(game.moves, game.analysis!.evals, game.myColor, game.result, game.clocks)
  .moves.filter((m) => m.label === "brilliant")
  .at(-1);

// A made-up profile (30 games, improving) to check the Blunder Profile design.
const sampleReview = reviewGame(game.moves, game.analysis!.evals, game.myColor, game.result, game.clocks);
const sampleMoves = sampleReview.moves;
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
    return { gameId: `preview-${i}`, endTime: Date.UTC(2026, 8, 1 + i * 2), oppName: `Player${i + 1}`, blunders, rolling: 3.4 - i * 0.06 };
  }),
  habits: [
    { habit: "early_queen", games: 11, share: 0.37, scoreWith: 32, scoreWithout: 58, examples: [{ gameId: "preview", ply: 9, text: "5. Qb3", oppName: "MorphyFan" }] },
    { habit: "no_castle", games: 17, share: 0.57, scoreWith: 41, scoreWithout: 55, examples: [{ gameId: "preview", ply: 19, text: "10. Nxb5", oppName: "MorphyFan" }] },
    { habit: "same_piece", games: 0, share: 0, scoreWith: null, scoreWithout: 49, examples: [] },
  ],
  time: {
    phases: {
      opening: { avgSeconds: 4.2, share: 0.18, moves: 360 },
      middlegame: { avgSeconds: 14.8, share: 0.61, moves: 420 },
      endgame: { avgSeconds: 9.1, share: 0.21, moves: 150 },
    },
    byClock: [
      { moves: 520, errors: 26 },
      { moves: 240, errors: 17 },
      { moves: 110, errors: 12 },
      { moves: 60, errors: 11 },
    ],
    quick: { moves: 310, errors: 34 },
    slow: { moves: 450, errors: 21 },
  },
  tilt: {
    afterLoss: { games: 9, accuracy: 61.5, blunders: 3.1 },
    otherwise: { games: 21, accuracy: 72.4, blunders: 2.0 },
  },
};
const sampleBaseline = { createdAt: Date.UTC(2026, 8, 1), rapidRating: 600, blitzRating: 530, blundersPerGame: 3.1, mistakesPerGame: 1.9, accuracy: 66, games: 30 };

// "Missed mate" puzzle: after 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6, White mates with Qxf7#.
const samplePuzzle: Puzzle = {
  id: "preview_7", gameId: "preview", ply: 7, fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
  color: "w", theme: "mate", kind: "attack", solution: ["h5f7"], mateIn: 1, winBest: 99, label: "blunder",
  played: "4. Qf3", oppName: "Knightmare", endTime: Date.UTC(2026, 9, 30),
  prev: { fen: "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3", uci: "g8f6" },
};

// Coach page: six weeks of made-up games with a climbing rating (two a day, wins and losses mixed).
const DAY = 24 * 60 * 60 * 1000;
const coachGames: GameDoc[] = Array.from({ length: 84 }, (_, i) => ({
  ...game,
  id: `coach-${i}`,
  timeClass: "rapid" as const,
  endTime: Date.now() - (83 - i) * DAY / 2,
  myRating: Math.round(600 + i * 1.6 + Math.sin(i) * 18),
  result: (["win", "loss", "win", "draw", "loss"] as const)[i % 5],
  oppName: `Rival${i}`,
}));
const coachReviewed = coachGames.map((g, i) => ({
  game: g,
  analysis: game.analysis!,
  review: { ...sampleReview, accuracy: 62 + (i % 7) * 3, counts: { ...sampleReview.counts, blunder: (i * 7) % 4, mistake: i % 2 } },
}));
const sampleGoal: RatingGoal = { timeClass: "rapid", start: 610, target: 900, createdAt: Date.now() - 40 * DAY, deadline: "2027-03-01" };
const samplePlan: StoredPlan = {
  week: "preview",
  plan: templatePlan(sampleProfile, [samplePuzzle]),
  source: "template",
  createdAt: Date.now(),
  done: [0],
};

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

      <PuzzleBoard puzzle={samplePuzzle} onFinished={noop} onNext={noop} blunderCheck />

      <div id="coach-empty" className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <PlanCard stored={null} state="loading" error={null} today={dayIndex()} onToggle={noop} onRegenerate={noop} />
        <GoalCard games={coachGames} onSave={async () => {}} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <PlanCard stored={samplePlan} state="ready" error={null} today={dayIndex()} onToggle={noop} onRegenerate={noop} />
        <div className="flex flex-col gap-4">
          <GoalCard goal={sampleGoal} games={coachGames} onSave={async () => {}} />
          <ReportCardView games={coachGames} reviewed={coachReviewed} />
        </div>
      </div>

      <div id="fun">
        <SyncReactions games={coachGames.slice(-3).reverse()} reviewed={coachReviewed.slice(-2)} onClose={noop} />
      </div>
      <SkillRadar reviewed={coachReviewed} />

      <NemesisCard nemesis={{ type: "fork", theme: "fork", hits: 7, startedAt: 0 }} onNext={noop} />
      <div id="train-play">
        <PlayBoard fen={ENDGAMES[0].fen} color="w" goal={ENDGAMES[0].goal} title={ENDGAMES[0].title} tip={ENDGAMES[0].tip} onEnd={noop} />
      </div>
      <div id="train-guess">
        <GuessBoard game={MASTER_GAMES[1]} onFinish={noop} />
      </div>

      <ProfileView profile={sampleProfile} baseline={sampleBaseline} onResetBaseline={noop} />

      <ReviewView game={game} analysis={game.analysis!} initialPly={firstFlagged?.ply ?? 0} />
    </div>
  );
}
