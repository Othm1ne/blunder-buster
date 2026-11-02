import type { GameDoc } from "./analysis";
import type { GameReview, MoveReview } from "./classify";
import { moveName } from "./describe";
import { phaseOf, type Phase, type ReviewedGame } from "./profile";

// V2 detection beyond single moves: opening habits, how you use your clock, and tilt
// (playing worse right after a loss). Pure functions over reviewed games, like profile.ts.

// ---------- Opening habits ----------

export type OpeningHabit = "early_queen" | "no_castle" | "same_piece";

export const HABITS: Record<OpeningHabit, { name: string; tip: string }> = {
  early_queen: {
    name: "Queen out early",
    tip: "Develop knights and bishops first. An early queen gets chased around and you lose time.",
  },
  no_castle: {
    name: "No castling by move 10",
    tip: "Castle in the first 10 moves: your king is safer and your rook joins the game.",
  },
  same_piece: {
    name: "Same piece moved again and again",
    tip: "In the opening, move each piece once and get them all out before attacking.",
  },
};

/** Queen moves up to this move number count as early. */
const EARLY_QUEEN_MOVE = 5;
/** Castle by this move number. */
const CASTLE_BY = 10;
/** One piece moved this many times in your first CASTLE_BY moves. */
const SAME_PIECE_MOVES = 3;

export type HabitHit = { habit: OpeningHabit; ply: number; text: string };

/** Opening habits in one game, each with the move where it showed up. */
export function openingHabits(review: GameReview): HabitHit[] {
  const hits: HabitHit[] = [];
  const mine = review.moves.filter((m) => m.mine);
  if (!mine.length) return hits;

  const queen = mine.find((m) => m.san.startsWith("Q") && m.moveNumber <= EARLY_QUEEN_MOVE);
  if (queen) hits.push({ habit: "early_queen", ply: queen.ply, text: moveName(queen) });

  const tenth = mine.find((m) => m.moveNumber === CASTLE_BY);
  const castled = mine.some((m) => m.san.startsWith("O-O") && m.moveNumber <= CASTLE_BY);
  // With the queens off, a king in the middle is fine.
  const queensOn = tenth && /q/.test(board(tenth.fenAfter)) && /Q/.test(board(tenth.fenAfter));
  if (tenth && !castled && queensOn) hits.push({ habit: "no_castle", ply: tenth.ply, text: moveName(tenth) });

  // Follow each piece by the square it started on, so "the same piece" survives moving around.
  const at = new Map<string, string>();
  const moved = new Map<string, MoveReview[]>();
  for (const m of review.moves) {
    if (m.moveNumber > CASTLE_BY) break;
    const from = m.uci.slice(0, 2);
    const to = m.uci.slice(2, 4);
    const id = at.get(from) ?? from;
    at.delete(from);
    at.set(to, id);
    if (m.san.startsWith("O-O")) {
      const rank = m.color === "w" ? "1" : "8";
      const [rookFrom, rookTo] = m.san.startsWith("O-O-O") ? ["a", "d"] : ["h", "f"];
      at.set(rookTo + rank, at.get(rookFrom + rank) ?? rookFrom + rank);
      at.delete(rookFrom + rank);
    }
    if (m.mine && "NBRQ".includes(m.san[0])) moved.set(id, [...(moved.get(id) ?? []), m]);
  }
  const busiest = [...moved.values()].sort((a, b) => b.length - a.length)[0];
  if (busiest && busiest.length >= SAME_PIECE_MOVES) {
    const third = busiest[SAME_PIECE_MOVES - 1];
    hits.push({ habit: "same_piece", ply: third.ply, text: `${busiest.length} moves, ${busiest.map((m) => m.san).join(" ")}` });
  }
  return hits;
}

const board = (fen: string) => fen.split(" ")[0];
const points = (g: GameDoc) => (g.result === "win" ? 1 : g.result === "draw" ? 0.5 : 0);

export type HabitStats = {
  habit: OpeningHabit;
  games: number;
  share: number;
  /** Your score (0-100%) in games with and without the habit; null without enough games. */
  scoreWith: number | null;
  scoreWithout: number | null;
  examples: { gameId: string; ply: number; text: string; oppName: string }[];
};

/** Below this many games on a side, a score comparison would be noise. */
const MIN_SAMPLE = 3;

export function habitStats(reviewed: ReviewedGame[]): HabitStats[] {
  const perGame = reviewed.map((r) => ({ r, hits: openingHabits(r.review) }));
  return (Object.keys(HABITS) as OpeningHabit[]).map((habit) => {
    const withIt = perGame.filter((g) => g.hits.some((h) => h.habit === habit));
    const without = perGame.filter((g) => !g.hits.some((h) => h.habit === habit));
    const score = (list: typeof perGame) =>
      list.length >= MIN_SAMPLE ? (list.reduce((s, g) => s + points(g.r.game), 0) / list.length) * 100 : null;
    return {
      habit,
      games: withIt.length,
      share: perGame.length ? withIt.length / perGame.length : 0,
      scoreWith: score(withIt),
      scoreWithout: score(without),
      examples: [...withIt]
        .sort((a, b) => b.r.game.endTime - a.r.game.endTime)
        .slice(0, 3)
        .map(({ r, hits }) => {
          const hit = hits.find((h) => h.habit === habit)!;
          return { gameId: r.game.id, ply: hit.ply, text: hit.text, oppName: r.game.oppName };
        }),
    };
  });
}

// ---------- Time ----------

/** Seconds you spent on each of your moves (undefined when the game has no clock data). */
export function moveTimes(game: GameDoc, moves: MoveReview[]): (number | undefined)[] {
  const [base, inc = 0] = game.timeControl.split("+").map(Number);
  return moves.map((m, i) => {
    if (m.clock === undefined || !base) return undefined;
    const before = i >= 2 ? moves[i - 2].clock : base;
    return before === undefined ? undefined : Math.max(0, before - m.clock + inc);
  });
}

export const CLOCK_BUCKETS = ["More than half", "25-50%", "10-25%", "Under 10%"] as const;
/** Moves played this fast count as "quick". */
export const QUICK_SECONDS = 3;

type Rate = { moves: number; errors: number };

export type TimeStats = {
  /** Average seconds per move and share of your total thinking time, per phase. */
  phases: Record<Phase, { avgSeconds: number; share: number; moves: number }>;
  /** Mistakes + blunders per move, by how much of your starting time was left before the move. */
  byClock: Rate[];
  quick: Rate;
  slow: Rate;
};

const isError = (m: MoveReview) => m.label === "mistake" || m.label === "blunder";

export function timeStats(reviewed: ReviewedGame[]): TimeStats | null {
  const phases = { opening: { s: 0, n: 0 }, middlegame: { s: 0, n: 0 }, endgame: { s: 0, n: 0 } };
  const byClock: Rate[] = CLOCK_BUCKETS.map(() => ({ moves: 0, errors: 0 }));
  const quick: Rate = { moves: 0, errors: 0 };
  const slow: Rate = { moves: 0, errors: 0 };
  let timed = 0;

  for (const { game, review } of reviewed) {
    const base = Number(game.timeControl.split("+")[0]);
    const times = moveTimes(game, review.moves);
    review.moves.forEach((m, i) => {
      const spent = times[i];
      if (!m.mine || spent === undefined) return;
      timed++;
      const phase = phases[phaseOf(m)];
      phase.s += spent;
      phase.n++;
      const left = (i >= 2 ? review.moves[i - 2].clock ?? base : base) / base;
      const bucket = byClock[left > 0.5 ? 0 : left > 0.25 ? 1 : left > 0.1 ? 2 : 3];
      bucket.moves++;
      if (isError(m)) bucket.errors++;
      // Book moves are fast for a good reason: leave them out of the speed comparison.
      if (m.label === "book") return;
      const speed = spent < QUICK_SECONDS ? quick : slow;
      speed.moves++;
      if (isError(m)) speed.errors++;
    });
  }
  if (!timed) return null;

  const total = phases.opening.s + phases.middlegame.s + phases.endgame.s || 1;
  const phase = (p: { s: number; n: number }) => ({ avgSeconds: p.n ? p.s / p.n : 0, share: p.s / total, moves: p.n });
  return {
    phases: { opening: phase(phases.opening), middlegame: phase(phases.middlegame), endgame: phase(phases.endgame) },
    byClock,
    quick,
    slow,
  };
}

// ---------- Tilt ----------

/** Games ending within this long of each other belong to the same session. */
const SESSION_GAP_MS = 90 * 60 * 1000;

export type TiltStats = {
  afterLoss: { games: number; accuracy: number; blunders: number };
  otherwise: { games: number; accuracy: number; blunders: number };
};

/** Your accuracy in games played right after a loss (same session) vs all your other games. */
export function tiltStats(reviewed: ReviewedGame[]): TiltStats | null {
  const games = [...reviewed].sort((a, b) => a.game.endTime - b.game.endTime);
  const sums = { afterLoss: { games: 0, accuracy: 0, blunders: 0 }, otherwise: { games: 0, accuracy: 0, blunders: 0 } };
  games.forEach((r, i) => {
    const prev = games[i - 1];
    const tilted = prev && prev.game.result === "loss" && r.game.endTime - prev.game.endTime <= SESSION_GAP_MS;
    const group = tilted ? sums.afterLoss : sums.otherwise;
    group.games++;
    group.accuracy += r.review.accuracy;
    group.blunders += r.review.counts.blunder;
  });
  if (sums.afterLoss.games < MIN_SAMPLE || sums.otherwise.games < MIN_SAMPLE) return null;
  const avg = (g: { games: number; accuracy: number; blunders: number }) => ({
    games: g.games,
    accuracy: g.accuracy / g.games,
    blunders: g.blunders / g.games,
  });
  return { afterLoss: avg(sums.afterLoss), otherwise: avg(sums.otherwise) };
}

/** Losses in a row that make the "take a break?" card show up. */
const TILT_LOSSES = 2;
/** The streak must be this recent to warn about it. */
const TILT_RECENT_MS = 2 * 60 * 60 * 1000;

/** Your current losing streak in this session, when it's long enough to suggest a break. */
export function tiltWarning(games: GameDoc[], now = Date.now()): { losses: number } | null {
  const recent = [...games].sort((a, b) => b.endTime - a.endTime);
  if (!recent[0] || now - recent[0].endTime > TILT_RECENT_MS) return null;
  let losses = 0;
  for (let i = 0; i < recent.length && recent[i].result === "loss"; i++) {
    if (i > 0 && recent[i - 1].endTime - recent[i].endTime > SESSION_GAP_MS) break;
    losses++;
  }
  return losses >= TILT_LOSSES ? { losses } : null;
}
