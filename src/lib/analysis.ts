import { Chess } from "chess.js";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { getEngine, type EngineEval } from "./engine";
import type { StoredGame } from "./chesscom";
import type { GameCoach } from "./coach";

/** Bump ANALYSIS_VERSION when the settings change and old results should be redone. */
export const ANALYSIS_DEPTH = 14;
export const ANALYSIS_MAX_MS = 1000;
// v2: MultiPV 2 (second-best score, for "Great" moves).
export const ANALYSIS_VERSION = 2;

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
  const evals: EngineEval[] = [];

  onProgress(0, fens.length);
  for (const fen of fens) {
    evals.push(await engine.evaluate(fen, ANALYSIS_DEPTH, ANALYSIS_MAX_MS));
    onProgress(evals.length, fens.length);
  }

  const analysis: GameAnalysis = {
    version: ANALYSIS_VERSION,
    depth: ANALYSIS_DEPTH,
    engine: "stockfish-19-lite",
    evals,
    analyzedAt: Date.now(),
  };
  await updateDoc(doc(db(), "users", uid, "games", game.id), { analysis });
  return analysis;
}
