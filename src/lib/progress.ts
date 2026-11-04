import { arrayUnion, doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { forgetGames } from "./games";
import type { GameDoc } from "./analysis";
import type { ReviewedGame } from "./profile";
import { today, WARMUP_SIZE, type BlunderCheckStats, type PuzzleState } from "./puzzles";
import { ENDGAMES } from "./arena";
import type { TrainingDoc } from "./training";

// XP, levels, streaks and badges. Everything is *derived* from what you actually did (puzzle
// progress, reviewed games, clean games, active days), so nothing can be double-counted or lost.
// The only things we record are which days you were active and when you reviewed a game.

export const XP = {
  puzzleSolved: 10,
  puzzleTried: 3,
  review: 15,
  cleanGame: 25,
  warmup: 20,
  activeDay: 5,
  endgameStar: 10,
  bossBeaten: 50,
  nemesisBeaten: 100,
  masterGame: 20,
} as const;

/** Streak freezes: one earned every FREEZE_EVERY active days, at most MAX_FREEZES in the bank. */
export const FREEZE_EVERY = 7;
export const MAX_FREEZES = 2;
/** Sharpshooter badge: a game at this accuracy or better. */
const SHARP_ACCURACY = 90;

/** A clean game needs at least this many of your moves (so a 5-move resignation doesn't count). */
const CLEAN_MIN_MOVES = 10;

export type ActivityDoc = {
  activeDays?: string[];
  warmupDays?: string[];
  warmup?: { day: string; done: number };
  blunderCheck?: BlunderCheckStats;
};

/** Marks today as active (keeps the streak alive). */
export async function recordActivity(uid: string, opts: { warmupDone?: boolean } = {}): Promise<void> {
  const data: Record<string, unknown> = { activeDays: arrayUnion(today()) };
  if (opts.warmupDone) data.warmupDays = arrayUnion(today());
  await setDoc(doc(db(), "users", uid), data, { merge: true });
}

/** Remembers that you reviewed a game (for XP, the First Review badge and the daily mission). */
export async function markReviewed(uid: string, gameId: string): Promise<void> {
  await updateDoc(doc(db(), "users", uid, "games", gameId), { reviewedAt: Date.now() });
  forgetGames();
}

function dayKey(date: Date): string {
  return date.toLocaleDateString("en-CA");
}

function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + by);
  return dayKey(d);
}
const nextDay = (day: string) => shiftDay(day, 1);
/** Yesterday as YYYY-MM-DD in local time. */
export const yesterday = () => shiftDay(today(), -1);

export type Streak = {
  current: number;
  best: number;
  activeToday: boolean;
  /** Freezes in the bank right now. */
  freezes: number;
  /** Missed days a freeze covered (oldest first). */
  frozenDays: string[];
};

/**
 * Current streak (alive if you were active today or yesterday, or a freeze covered the gap) and
 * best streak ever. Walks day by day from your first active day: every FREEZE_EVERY active days
 * earn a freeze, and a missed day uses one up instead of breaking the streak. Frozen days keep
 * the streak alive but don't add to it. Today doesn't count as missed: there's still time.
 */
export function streaks(activeDays: string[]): Streak {
  const days = new Set(activeDays);
  const t = today();
  const activeToday = days.has(t);
  const first = [...days].sort()[0];
  let current = 0;
  let best = 0;
  let active = 0;
  let freezes = 0;
  const frozenDays: string[] = [];
  if (!first) return { current, best, activeToday, freezes, frozenDays };

  for (let d = first; d <= t; d = nextDay(d)) {
    if (days.has(d)) {
      current++;
      active++;
      if (active % FREEZE_EVERY === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
    } else if (d !== t) {
      if (current > 0 && freezes > 0) {
        freezes--;
        frozenDays.push(d);
      } else current = 0;
    }
    best = Math.max(best, current);
  }
  return { current, best, activeToday, freezes, frozenDays };
}

/** Level n starts at 50·n·(n-1) XP: 0, 100, 300, 600, 1000… (each level a bit longer than the last). */
export function levelOf(xp: number): { level: number; current: number; needed: number } {
  let level = 1;
  while (xp >= 50 * (level + 1) * level) level++;
  const start = 50 * level * (level - 1);
  const next = 50 * (level + 1) * level;
  return { level, current: xp - start, needed: next - start };
}

export type Badge = { id: string; icon: string; name: string; description: string; earned: boolean; progress?: string };

export type Progress = {
  xp: number;
  level: ReturnType<typeof levelOf>;
  streak: ReturnType<typeof streaks>;
  badges: Badge[];
  cleanGames: number;
  reviews: number;
  puzzlesSolved: number;
};

export function computeProgress(
  games: GameDoc[],
  reviewed: ReviewedGame[],
  states: Map<string, PuzzleState>,
  activity: ActivityDoc,
  extra: { training?: TrainingDoc; goalReached?: boolean } = {},
): Progress {
  const activeDays = activity.activeDays ?? [];
  const warmupDays = new Set(activity.warmupDays ?? []);
  if (activity.warmup?.day === today() && activity.warmup.done >= WARMUP_SIZE) warmupDays.add(today());

  let puzzlesSolved = 0;
  let puzzleXp = 0;
  for (const s of states.values()) {
    puzzlesSolved += s.solved;
    puzzleXp += s.solved * XP.puzzleSolved + (s.attempts - s.solved) * XP.puzzleTried;
  }
  const reviews = games.filter((g) => g.reviewedAt).length;
  const clean = reviewed.filter(
    ({ review }) =>
      review.counts.blunder === 0 && review.counts.mistake === 0 && review.moves.filter((m) => m.mine).length >= CLEAN_MIN_MOVES,
  );
  const brilliant = reviewed.some(({ review }) => review.counts.brilliant > 0);
  const rapid = games.filter((g) => g.timeClass === "rapid").length;
  const streak = streaks(activeDays);
  const sharp = reviewed.some(
    ({ review }) => review.accuracy >= SHARP_ACCURACY && review.moves.filter((m) => m.mine).length >= CLEAN_MIN_MOVES,
  );

  const training = extra.training ?? {};
  const stars = Object.values(training.endgames ?? {}).reduce((s, e) => s + e.stars, 0);
  const endgamesWon = ENDGAMES.filter((e) => training.endgames?.[e.id]).length;
  const bosses = Object.values(training.bosses ?? {}).filter((b) => b.beatenAt).length;
  const nemeses = training.nemesis?.beaten?.length ?? 0;
  const masterGames = Object.values(training.guess ?? {});
  const bestGuess = Math.max(0, ...masterGames.map((g) => g.best));

  const xp =
    puzzleXp +
    reviews * XP.review +
    clean.length * XP.cleanGame +
    warmupDays.size * XP.warmup +
    activeDays.length * XP.activeDay +
    stars * XP.endgameStar +
    bosses * XP.bossBeaten +
    nemeses * XP.nemesisBeaten +
    masterGames.length * XP.masterGame;

  const badge = (id: string, icon: string, name: string, description: string, have: number, need: number): Badge => ({
    id,
    icon,
    name,
    description,
    earned: have >= need,
    progress: need > 1 && have < need ? `${have}/${need}` : undefined,
  });

  return {
    xp,
    level: levelOf(xp),
    streak,
    cleanGames: clean.length,
    reviews,
    puzzlesSolved,
    badges: [
      badge("first-review", "🔍", "First Review", "Review one of your games", reviews, 1),
      badge("clean-game", "🧼", "Clean Game", "Play a game with no mistakes or blunders", clean.length, 1),
      badge("streak-7", "🔥", "7-Day Streak", "Train 7 days in a row", streak.best, 7),
      badge("warmup", "☕", "Warm-up Hero", "Finish the daily warm-up", warmupDays.size, 1),
      badge("puzzles-25", "🧩", "Puzzle Solver", "Solve 25 puzzles", puzzlesSolved, 25),
      badge("brilliant", "💎", "Brilliant Mind", "Play a Brilliant (!!) move", brilliant ? 1 : 0, 1),
      badge("patient", "🐢", "Patient Player", "Play 10 rapid games", rapid, 10),
      badge("clean-5", "🏆", "Blunder Buster", "Play 5 clean games", clean.length, 5),
      badge("sharp", "🎯", "Sharpshooter", `Play a game with ${SHARP_ACCURACY}%+ accuracy`, sharp ? 1 : 0, 1),
      badge("eagle-eye", "🦅", "Eagle Eye", "Spot what their move attacks 50 times", activity.blunderCheck?.correct ?? 0, 50),
      badge("puzzles-100", "🧠", "Puzzle Master", "Solve 100 puzzles", puzzlesSolved, 100),
      badge("streak-30", "🌋", "Unstoppable", "Train 30 days in a row", streak.best, 30),
      badge("nemesis", "💀", "Nemesis Slayer", "Defeat your nemesis", nemeses, 1),
      badge("boss", "🐉", "Dragon Slayer", "Win a Boss Fight", bosses, 1),
      badge("endgames", "👑", "Endgame Champion", "Win every Endgame Arena lesson", endgamesWon, ENDGAMES.length),
      badge("master-mind", "🎩", "Master Mind", "Score 70%+ in Guess the Move", bestGuess >= 70 ? 1 : 0, 1),
      badge("goal", "🥅", "Goal Getter", "Reach your rating goal", extra.goalReached ? 1 : 0, 1),
    ],
  };
}
