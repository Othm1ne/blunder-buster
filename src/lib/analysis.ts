import { Chess } from "chess.js";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { getEngine, type EngineEval } from "./engine";
import { forgetGames } from "./games";
import type { StoredGame } from "./chesscom";
import type { GameCoach } from "./coach";

/** Bump ANALYSIS_VERSION when the settings change and old results should be redone. */
export const ANALYSIS_DEPTH = 16;
export const ANALYSIS_MAX_MS = 2000;
// v2: MultiPV 2 (second-best score, for "Great" moves).
// v3: depth 16 / 2 s (depth 14 / 1 s often stopped early and gave noisy evals), analyzed last move first.
export const ANALYSIS_VERSION = 3;

export type GameAnalysis = {
  version: number;
  depth: number;
  engine: string;
  /** evals[0] = start position, evals[i] = position after move i (so length = moves + 1). */
  evals: EngineEval[];
  analyzedAt: number;
};

export type GameDoc = StoredGame & { analysis?: GameAnalysis; coach?: GameCoach; reviewedAt?: number };

export function isAnalyzed(game: GameDoc): boolean {
  return (game.analysis?.version ?? 0) >= ANALYSIS_VERSION;
}

/** FEN of every position in the game, starting with the initial one. */
export function gamePositions(moves: string[]): string[] {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const san of moves) {
    chess.move(san);
    fens.push(chess.fen());
  }
  return fens;
}

/** Runs Stockfish on every position and saves the result on the game document. */
export async function analyzeGame(
  uid: string,
  game: StoredGame,
  onProgress: (done: number, total: number) => void,
): Promise<GameAnalysis> {
  const engine = getEngine();
  const fens = gamePositions(game.moves);
  const evals: EngineEval[] = new Array(fens.length);

  // Last position first: the engine's hash table then already knows how the game goes on,
  // which makes neighbouring evaluations agree with each other (fewer fake swings).
  onProgress(0, fens.length);
  for (let i = fens.length - 1; i >= 0; i--) {
    evals[i] = await engine.evaluate(fens[i], ANALYSIS_DEPTH, ANALYSIS_MAX_MS);
    onProgress(fens.length - i, fens.length);
  }

  const analysis: GameAnalysis = {
    version: ANALYSIS_VERSION,
    depth: ANALYSIS_DEPTH,
    engine: "stockfish-19-lite",
    evals,
    analyzedAt: Date.now(),
  };
  await updateDoc(doc(db(), "users", uid, "games", game.id), { analysis });
  forgetGames();
  return analysis;
}
