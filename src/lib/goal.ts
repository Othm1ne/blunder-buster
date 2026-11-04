import { deleteField, doc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { GameDoc } from "./analysis";
import { onRatingSite, type TimeClass } from "./chesscom";

// Rating goal mode: "get from 600 to 900 in rapid". Stored on the user document; progress is
// derived from the ratings Chess.com (or Lichess) recorded on your imported games.

export type RatingGoal = {
  timeClass: TimeClass;
  /** Rating when the goal was set. */
  start: number;
  target: number;
  createdAt: number;
  /** Optional, YYYY-MM-DD. */
  deadline?: string;
};

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
/** Pace is measured over this window, and needs this many games in it. */
const PACE_WINDOW = 28 * DAY;
const PACE_MIN_GAMES = 5;

/** Your rating after each game of that time control, oldest first. */
export function ratingHistory(games: GameDoc[], timeClass: TimeClass): { endTime: number; rating: number }[] {
  return onRatingSite(games)
    .filter((g) => g.timeClass === timeClass && g.myRating > 0)
    .map((g) => ({ endTime: g.endTime, rating: g.myRating }))
    .sort((a, b) => a.endTime - b.endTime);
}

export type GoalProgress = {
  current: number;
  percent: number;
  gained: number;
  /** Rating points per week over the last 4 weeks (least squares), null without enough games. */
  pacePerWeek: number | null;
  /** When you'd reach the target at this pace (ms), null if not climbing. */
  eta: number | null;
  reached: boolean;
  /** With a deadline: points per week still needed, and whether the pace is enough. */
  neededPerWeek?: number;
  onTrack?: boolean;
};

export function goalProgress(goal: RatingGoal, games: GameDoc[], now = Date.now()): GoalProgress {
  const history = ratingHistory(games, goal.timeClass);
  const current = history.at(-1)?.rating ?? goal.start;
  const span = goal.target - goal.start || 1;
  const reached = current >= goal.target;

  const recent = history.filter((h) => h.endTime >= now - PACE_WINDOW);
  let pacePerWeek: number | null = null;
  if (recent.length >= PACE_MIN_GAMES && recent.at(-1)!.endTime - recent[0].endTime >= 3 * DAY) {
    // Least-squares slope: less jumpy than first-vs-last.
    const xs = recent.map((h) => h.endTime / WEEK);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = recent.reduce((a, h) => a + h.rating, 0) / recent.length;
    const num = recent.reduce((a, h, i) => a + (xs[i] - mx) * (h.rating - my), 0);
    const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    pacePerWeek = den ? num / den : null;
  }

  const progress: GoalProgress = {
    current,
    percent: Math.max(0, Math.min(100, ((current - goal.start) / span) * 100)),
    gained: current - goal.start,
    pacePerWeek,
    eta: !reached && pacePerWeek && pacePerWeek > 0 ? now + ((goal.target - current) / pacePerWeek) * WEEK : null,
    reached,
  };
  if (goal.deadline && !reached) {
    const weeksLeft = Math.max(1 / 7, (new Date(`${goal.deadline}T23:59:59`).getTime() - now) / WEEK);
    progress.neededPerWeek = (goal.target - current) / weeksLeft;
    progress.onTrack = pacePerWeek !== null && pacePerWeek >= progress.neededPerWeek;
  }
  return progress;
}

/** A sensible first target: +300, rounded to the next hundred. */
export function suggestedTarget(current: number): number {
  return Math.ceil((current + 300) / 100) * 100;
}

export async function saveGoal(uid: string, goal: RatingGoal | null): Promise<void> {
  await setDoc(doc(db(), "users", uid), { goal: goal ?? deleteField() }, { merge: true });
}
