import { doc, updateDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";
import type { GameDoc } from "./analysis";
import type { GameReview, MoveReview } from "./classify";
import type { CoachMoveFacts, CoachRequest, CoachResponse } from "./coachTypes";
import { moveName, PIECE_NAMES } from "./describe";

// Asks the Gemini coach (Cloudflare function) about a game once, then caches the answer on the game.

/** Bump to regenerate cached coaching (e.g. after changing the prompt). */
export const COACH_VERSION = 1;
const COACH_URL = process.env.NEXT_PUBLIC_COACH_URL || "/api/coach";
const MAX_MOVES = 12;

export type GameCoach = {
  version: number;
  summary: string;
  tip: string;
  /** Coaching per ply (keys are ply numbers as strings). */
  moves: Record<string, string>;
  model: string;
  createdAt: number;
  /** Which analysis this was written for, so a re-analysis gets fresh coaching. */
  analyzedAt: number;
};

const COACHED = new Set(["blunder", "mistake", "brilliant", "great"]);

function facts(m: MoveReview): CoachMoveFacts {
  const d = m.details ?? {};
  const f: CoachMoveFacts = {
    ply: m.ply,
    move: moveName(m),
    label: m.label,
    winBefore: Math.round(m.winBefore),
    winAfter: Math.round(m.winAfter),
  };
  // Only defined fields, to keep the request small.
  if (m.type) f.type = m.type;
  if (d.piece) f.piece = PIECE_NAMES[d.piece];
  if (d.square) f.square = d.square;
  if (d.by) f.by = PIECE_NAMES[d.by];
  if (d.targets) f.targets = d.targets;
  if (d.threatSan) f.threat = d.threatSan;
  if (m.bestSan && m.bestUci !== m.uci) f.best = m.bestSan;
  if (d.mateIn) f.mateIn = d.mateIn;
  if (d.material) f.material = d.material;
  if (m.sacrificed) f.sacrificed = PIECE_NAMES[m.sacrificed];
  if (m.clock !== undefined) f.clockSeconds = Math.round(m.clock);
  if (m.timeTrouble) f.timeTrouble = true;
  return f;
}

/** The moves worth coaching: your blunders and mistakes (worst first) plus your brilliant/great moves. */
export function coachedMoves(review: GameReview): MoveReview[] {
  return review.moves
    .filter((m) => m.mine && COACHED.has(m.label))
    .sort((a, b) => b.winBefore - b.winAfter - (a.winBefore - a.winAfter))
    .slice(0, MAX_MOVES)
    .sort((a, b) => a.ply - b.ply);
}

export function isCoachFresh(game: GameDoc & { coach?: GameCoach }, analyzedAt: number): boolean {
  return game.coach?.version === COACH_VERSION && game.coach.analyzedAt === analyzedAt;
}

export async function requestCoach(user: User, game: GameDoc, review: GameReview, analyzedAt: number): Promise<GameCoach> {
  const body: CoachRequest = {
    gameId: game.id,
    player: { color: game.myColor, rating: game.myRating },
    opponentRating: game.oppRating,
    result: game.result,
    resultDetail: game.resultDetail,
    opening: review.opening ?? game.opening,
    timeControl: game.timeControl,
    accuracy: Math.round(review.accuracy),
    counts: review.counts,
    mistakeTypes: review.mistakeTypes as Record<string, number>,
    failedToConvert: review.failedToConvert,
    moves: coachedMoves(review).map(facts),
  };

  const res = await fetch(COACH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const message = ((await res.json().catch(() => ({}))) as { error?: string }).error;
    throw new Error(message ?? `Coach error ${res.status}`);
  }
  const answer = (await res.json()) as CoachResponse;

  const coach: GameCoach = {
    version: COACH_VERSION,
    summary: answer.summary,
    tip: answer.tip,
    moves: Object.fromEntries(answer.moves.map((m) => [String(m.ply), m.text])),
    model: answer.model,
    createdAt: Date.now(),
    analyzedAt,
  };
  await updateDoc(doc(db(), "users", user.uid, "games", game.id), { coach });
  return coach;
}
