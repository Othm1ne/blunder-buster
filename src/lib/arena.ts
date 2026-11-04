import { Chess, type Color, type Move } from "chess.js";
import { winChance, WINNING } from "./classify";
import type { EngineEval } from "./engine";
import type { ReviewedGame } from "./profile";
import { moveName } from "./describe";

// Training games against Stockfish: the Endgame Arena (textbook endgames) and Boss Fights
// (positions you were winning in your own games and didn't win). Each has a goal; `judge`
// decides after every move whether it's reached, failed, or still going.

export type Goal =
  /** Checkmate them within `maxMoves` of your moves. */
  | { kind: "mate"; maxMoves: number; par: number }
  /** Make a queen and keep the win. */
  | { kind: "promote"; maxMoves: number; par: number }
  /** Don't lose for `moves` of your moves (a draw counts as holding). */
  | { kind: "hold"; moves: number }
  /** Keep a winning position until it's decided: mate, or still clearly winning after `maxMoves`. */
  | { kind: "convert"; maxMoves: number };

export type Verdict = { won: boolean; text: string; stars: number };

/** Engine reply strength: strong enough to defend properly, quick enough to feel snappy. */
export const REPLY_DEPTH = 14;
export const REPLY_MS = 700;
/** Boss fight: below this (your winning chances) the advantage is gone. */
const ESCAPED = 65;

const pov = (e: EngineEval, me: Color) => (me === "w" ? e.cp : -e.cp);
const myMate = (e: EngineEval, me: Color) => e.mate !== undefined && (me === "w" ? e.mate > 0 : e.mate < 0);

function stars(goal: Goal, myMoves: number): number {
  if (goal.kind !== "mate" && goal.kind !== "promote") return 3;
  return myMoves <= goal.par ? 3 : myMoves <= Math.ceil(goal.par * 1.5) ? 2 : 1;
}

/**
 * Judges the position after a move. `myMoves` counts your moves so far; `evalAfter` is the
 * engine's verdict on the position (White's point of view), present after your moves only.
 */
export function judge(goal: Goal, chess: Chess, me: Color, myMoves: number, last: Move, evalAfter?: EngineEval): Verdict | null {
  const win = (text: string): Verdict => ({ won: true, text, stars: stars(goal, myMoves) });
  const lose = (text: string): Verdict => ({ won: false, text, stars: 0 });
  const holding = goal.kind === "hold";

  if (chess.isCheckmate())
    return chess.turn() === me ? lose("Checkmate: you got mated.") : win(`Checkmate in ${myMoves} moves!`);
  if (chess.isStalemate()) return holding ? win("Stalemate: draw held!") : lose("Stalemate! Their king has no moves, so it's a draw.");
  if (chess.isDraw()) return holding ? win("It's a draw: you held!") : lose("It's a draw now: the win slipped away.");

  // Everything below needs the engine's view of your last move.
  if (!evalAfter || last.color !== me) return null;
  const cp = pov(evalAfter, me);

  switch (goal.kind) {
    case "mate":
      return myMoves >= goal.maxMoves ? lose(`Out of moves: no mate within ${goal.maxMoves}.`) : null;
    case "promote":
      if (last.promotion && (myMate(evalAfter, me) || cp >= 400)) return win(`New queen in ${myMoves} moves: that's a win!`);
      if (cp <= 50) return lose(`${last.san} lets them hold the draw.`);
      return myMoves >= goal.maxMoves ? lose(`Out of moves: no queen within ${goal.maxMoves}.`) : null;
    case "hold":
      if (cp <= -300) return lose(`${last.san} loses: they'll get through now.`);
      return myMoves >= goal.moves ? win(`You held for ${goal.moves} moves!`) : null;
    case "convert": {
      if (myMate(evalAfter, me)) return win("Forced checkmate on the board: boss defeated!");
      const chance = winChance(cp);
      if (chance < ESCAPED) return lose(`${last.san} lets the boss escape: you're not winning any more.`);
      return myMoves >= goal.maxMoves ? win(`Still winning after ${goal.maxMoves} moves: boss defeated!`) : null;
    }
  }
}

export function goalText(goal: Goal): string {
  switch (goal.kind) {
    case "mate":
      return `Checkmate within ${goal.maxMoves} moves (3 stars in ${goal.par} or fewer).`;
    case "promote":
      return `Make a queen within ${goal.maxMoves} moves (3 stars in ${goal.par} or fewer).`;
    case "hold":
      return `Don't lose for ${goal.moves} moves.`;
    case "convert":
      return `Stay winning for ${goal.maxMoves} moves, or find a forced mate.`;
  }
}

// --- Endgame Arena ---

export type Endgame = { id: string; title: string; fen: string; goal: Goal; tip: string };

export const ENDGAMES: Endgame[] = [
  {
    id: "ladder",
    title: "Ladder mate",
    fen: "8/8/8/3k4/8/8/8/R3K2R w - - 0 1",
    goal: { kind: "mate", maxMoves: 12, par: 7 },
    tip: "Roll the rooks up the board: one rook guards a rank, the other checks on the next one. Keep them far from the king.",
  },
  {
    id: "queen",
    title: "Queen mate",
    fen: "8/8/3k4/8/8/8/8/3QK3 w - - 0 1",
    goal: { kind: "mate", maxMoves: 20, par: 10 },
    tip: "Shrink the box: keep your queen a knight's move from their king, then bring your own king. Watch out for stalemate!",
  },
  {
    id: "rook",
    title: "Rook mate",
    fen: "8/8/4k3/8/8/8/8/R3K3 w - - 0 1",
    goal: { kind: "mate", maxMoves: 30, par: 18 },
    tip: "Cut the king off with your rook, walk your king opposite theirs, then check. Shrink the box one line at a time.",
  },
  {
    id: "pawn",
    title: "Pawn to queen",
    fen: "4k3/8/3K4/4P3/8/8/8/8 w - - 0 1",
    goal: { kind: "promote", maxMoves: 12, par: 6 },
    tip: "Your king leads, the pawn follows. Take the opposition (kings facing with one square between) to push theirs aside.",
  },
  {
    id: "hold",
    title: "Hold the draw",
    fen: "8/4k3/8/8/4P3/4K3/8/8 b - - 0 1",
    goal: { kind: "hold", moves: 20 },
    tip: "Stay in front of the pawn. When their king steps up, face it (the opposition); when you must retreat, go straight back.",
  },
];

// --- Boss Fights ---

export type Boss = {
  /** `${gameId}_${ply}` */
  id: string;
  gameId: string;
  ply: number;
  fen: string;
  color: Color;
  oppName: string;
  endTime: number;
  /** Your winning chances before the slip. */
  winBefore: number;
  /** What you played in the game, e.g. "31. Rxe5?". */
  played: string;
  result: "loss" | "draw";
};

/**
 * One boss per game you were clearly winning and didn't win: the position before your biggest
 * slip while winning. Latest games first.
 */
export function findBosses(reviewed: ReviewedGame[]): Boss[] {
  const bosses: Boss[] = [];
  for (const { game, review } of reviewed) {
    if (!review.failedToConvert || game.result === "win") continue;
    let worst: (typeof review.moves)[number] | undefined;
    for (const m of review.moves) {
      if (!m.mine || m.winBefore < WINNING) continue;
      if (!worst || m.winBefore - m.winAfter > worst.winBefore - worst.winAfter) worst = m;
    }
    if (!worst || new Chess(worst.fenBefore).isGameOver()) continue;
    bosses.push({
      id: `${game.id}_${worst.ply}`,
      gameId: game.id,
      ply: worst.ply,
      fen: worst.fenBefore,
      color: worst.color,
      oppName: game.oppName,
      endTime: game.endTime,
      winBefore: worst.winBefore,
      played: moveName(worst),
      result: game.result,
    });
  }
  return bosses.sort((a, b) => b.endTime - a.endTime);
}

export const BOSS_GOAL: Goal = { kind: "convert", maxMoves: 15 };
