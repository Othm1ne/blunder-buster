import type { GameDoc, GameAnalysis } from "./analysis";
import { reviewGame, type GameReview, type MistakeType, type MoveReview, type OpeningBook } from "./classify";
import type { Baseline } from "./games";

// Turns many reviewed games into the Blunder Profile: averages, your most common mistake
// types (with examples), when in the game you blunder, and the trend over time.

export type Phase = "opening" | "middlegame" | "endgame";
type ProfileMistakeType = MistakeType;

export type ReviewedGame = { game: GameDoc; analysis: GameAnalysis; review: GameReview };

export type MistakeExample = { gameId: string; ply: number; move: MoveReview; oppName: string };

export type Profile = {
  games: number;
  blundersPerGame: number;
  mistakesPerGame: number;
  accuracy: number;
  /** Your mistakes + blunders, by type, most common first. */
  types: { type: ProfileMistakeType; count: number; share: number; examples: MistakeExample[] }[];
  phases: Record<Phase, number>;
  /** Share of your mistakes + blunders made with under 30 s on the clock. */
  timeTroubleShare: number;
  failedToConvert: number;
  /** Oldest first. `rolling` = average blunders over the last ROLLING games. */
  trend: { gameId: string; endTime: number; oppName: string; blunders: number; rolling: number }[];
};

export const ROLLING = 10;
/** Opening = the first 12 moves. Endgame = little material left on the board. */
const OPENING_MOVES = 12;
const ENDGAME_MATERIAL = 20;
const PIECE_POINTS: Record<string, number> = { q: 9, r: 5, b: 3, n: 3 };

/** Phase of the position a move was played in. */
export function phaseOf(m: MoveReview): Phase {
  if (m.moveNumber <= OPENING_MOVES) return "opening";
  const board = m.fenBefore.split(" ")[0].toLowerCase();
  let material = 0;
  for (const c of board) material += PIECE_POINTS[c] ?? 0;
  return material <= ENDGAME_MATERIAL ? "endgame" : "middlegame";
}

// Reviewing a game takes ~10-30 ms (chess.js is slow), so every page shares one cache:
// a game is reviewed once per visit, not again on every page or re-render.
const cache = new Map<string, GameReview>();

export function reviewCached(game: GameDoc, analysis: GameAnalysis, book: OpeningBook | null | undefined): GameReview {
  const key = `${game.id}:${analysis.analyzedAt}:${book ? "book" : "nobook"}`;
  let review = cache.get(key);
  if (!review) {
    review = reviewGame(game.moves, analysis.evals, game.myColor, game.result, game.clocks, book);
    cache.set(key, review);
  }
  return review;
}

export function reviewAll(
  games: GameDoc[],
  extra: Map<string, GameAnalysis>,
  book: OpeningBook | null | undefined,
): ReviewedGame[] {
  const out: ReviewedGame[] = [];
  for (const game of games) {
    const analysis = game.analysis ?? extra.get(game.id);
    if (!analysis) continue;
    out.push({ game, analysis, review: reviewCached(game, analysis, book) });
  }
  return out;
}

const isError = (m: MoveReview) => m.mine && (m.label === "blunder" || m.label === "mistake");

export function buildProfile(reviewed: ReviewedGame[]): Profile {
  const chronological = [...reviewed].sort((a, b) => a.game.endTime - b.game.endTime);
  const n = chronological.length || 1;

  const byType = new Map<ProfileMistakeType, MistakeExample[]>();
  const phases: Record<Phase, number> = { opening: 0, middlegame: 0, endgame: 0 };
  let errors = 0;
  let timeTrouble = 0;
  let blunders = 0;
  let mistakes = 0;
  let accuracy = 0;
  let failedToConvert = 0;

  for (const { game, review } of chronological) {
    blunders += review.counts.blunder;
    mistakes += review.counts.mistake;
    accuracy += review.accuracy;
    if (review.failedToConvert) failedToConvert++;
    for (const m of review.moves.filter(isError)) {
      errors++;
      phases[phaseOf(m)]++;
      if (m.timeTrouble) timeTrouble++;
      const type = m.type ?? "other";
      const list = byType.get(type) ?? [];
      list.push({ gameId: game.id, ply: m.ply, move: m, oppName: game.oppName });
      byType.set(type, list);
    }
  }

  const types = [...byType.entries()]
    .map(([type, list]) => ({
      type,
      count: list.length,
      share: errors ? list.length / errors : 0,
      // Most recent examples, worst first.
      examples: [...list]
        .reverse()
        .slice(0, 6)
        .sort((a, b) => b.move.winBefore - b.move.winAfter - (a.move.winBefore - a.move.winAfter))
        .slice(0, 3),
    }))
    // "other" (hard to name) goes last: it isn't a habit you can fix directly.
    .sort((a, b) => Number(a.type === "other") - Number(b.type === "other") || b.count - a.count);

  const trend = chronological.map(({ game, review }, i) => {
    const window = chronological.slice(Math.max(0, i - ROLLING + 1), i + 1);
    return {
      gameId: game.id,
      endTime: game.endTime,
      oppName: game.oppName,
      blunders: review.counts.blunder,
      rolling: window.reduce((s, g) => s + g.review.counts.blunder, 0) / window.length,
    };
  });

  return {
    games: chronological.length,
    blundersPerGame: blunders / n,
    mistakesPerGame: mistakes / n,
    accuracy: accuracy / n,
    types,
    phases,
    timeTroubleShare: errors ? timeTrouble / errors : 0,
    failedToConvert,
    trend,
  };
}

/** Snapshot for the baseline. Ratings are the latest per time control. */
export function baselineFrom(profile: Profile, reviewed: ReviewedGame[]): Baseline {
  const latest = (tc: string) =>
    reviewed.filter((r) => r.game.timeClass === tc).sort((a, b) => b.game.endTime - a.game.endTime)[0]?.game.myRating;
  const baseline: Baseline = {
    createdAt: Date.now(),
    blundersPerGame: Math.round(profile.blundersPerGame * 100) / 100,
    mistakesPerGame: Math.round(profile.mistakesPerGame * 100) / 100,
    accuracy: Math.round(profile.accuracy * 10) / 10,
    games: profile.games,
  };
  // Firestore rejects undefined: only set ratings we have.
  const rapid = latest("rapid");
  const blitz = latest("blitz");
  if (rapid) baseline.rapidRating = rapid;
  if (blitz) baseline.blitzRating = blitz;
  return baseline;
}
