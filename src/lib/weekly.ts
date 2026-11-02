import type { GameDoc } from "./analysis";
import type { TimeClass } from "./chesscom";
import type { MistakeType } from "./classify";
import type { ReviewedGame } from "./profile";

// Weeks run Monday to Sunday in local time. The Weekly Report Card compares a week with the one before.

const DAY = 24 * 60 * 60 * 1000;

/** Monday 00:00 (local) of the week containing `t`. */
export function weekStart(t = Date.now()): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function previousWeek(start: number): number {
  return weekStart(start - DAY);
}

/** Stable id for a week: its Monday, YYYY-MM-DD. */
export function weekKey(start: number): string {
  return new Date(start).toLocaleDateString("en-CA");
}

/** 0 = Monday … 6 = Sunday. */
export function dayIndex(t = Date.now()): number {
  return (new Date(t).getDay() + 6) % 7;
}

export type WeekStats = {
  start: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Points scored, in % (win 1, draw 0.5). */
  score: number;
  analyzed: number;
  accuracy: number | null;
  blundersPerGame: number | null;
  cleanGames: number;
  ratingChange: Partial<Record<TimeClass, number>>;
  best?: { game: GameDoc; accuracy: number };
  nemesis?: { type: MistakeType; count: number };
};

export function weekStats(games: GameDoc[], reviewed: ReviewedGame[], start: number): WeekStats {
  const end = start + 7 * DAY;
  const inWeek = (t: number) => t >= start && t < end;
  const played = games.filter((g) => inWeek(g.endTime));
  const analyzed = reviewed.filter((r) => inWeek(r.game.endTime));

  const wins = played.filter((g) => g.result === "win").length;
  const draws = played.filter((g) => g.result === "draw").length;
  const mine = (r: ReviewedGame) => r.review.moves.filter((m) => m.mine).length;

  const ratingChange: WeekStats["ratingChange"] = {};
  for (const tc of ["rapid", "blitz"] as const) {
    const history = games.filter((g) => g.timeClass === tc).sort((a, b) => a.endTime - b.endTime);
    const during = history.filter((g) => inWeek(g.endTime));
    if (!during.length) continue;
    const before = history.filter((g) => g.endTime < start).at(-1)?.myRating ?? during[0].myRating;
    ratingChange[tc] = during.at(-1)!.myRating - before;
  }

  const types = new Map<MistakeType, number>();
  for (const r of analyzed)
    for (const [type, n] of Object.entries(r.review.mistakeTypes))
      if (type !== "other" && type !== "time_trouble" && type !== "failed_to_convert")
        types.set(type as MistakeType, (types.get(type as MistakeType) ?? 0) + n);
  const nemesis = [...types].sort((a, b) => b[1] - a[1])[0];

  // Best game: wins first, then accuracy.
  const best = [...analyzed].sort(
    (a, b) => Number(b.game.result === "win") - Number(a.game.result === "win") || b.review.accuracy - a.review.accuracy,
  )[0];

  return {
    start,
    games: played.length,
    wins,
    draws,
    losses: played.length - wins - draws,
    score: played.length ? ((wins + draws / 2) / played.length) * 100 : 0,
    analyzed: analyzed.length,
    accuracy: analyzed.length ? analyzed.reduce((s, r) => s + r.review.accuracy, 0) / analyzed.length : null,
    blundersPerGame: analyzed.length ? analyzed.reduce((s, r) => s + r.review.counts.blunder, 0) / analyzed.length : null,
    cleanGames: analyzed.filter((r) => r.review.counts.blunder + r.review.counts.mistake === 0 && mine(r) >= 10).length,
    ratingChange,
    best: best && { game: best.game, accuracy: best.review.accuracy },
    nemesis: nemesis && { type: nemesis[0], count: nemesis[1] },
  };
}

export type Subject = { name: string; passed: boolean | null; detail: string };

export type ReportCard = {
  grade: "A+" | "A" | "B" | "C" | "D" | "-";
  subjects: Subject[];
  verdict: string;
  mood: "proud" | "happy" | "shocked";
};

/** Five "subjects", each passed or not (null = can't tell yet). The grade is the share passed. */
export function reportCard(week: WeekStats, last: WeekStats): ReportCard {
  const fmt = (n: number | null, digits = 0) => (n === null ? "-" : n.toFixed(digits));
  const subjects: Subject[] = [
    {
      name: "Accuracy up",
      passed: week.accuracy === null || last.accuracy === null ? null : week.accuracy >= last.accuracy,
      detail: `${fmt(week.accuracy)}% (last week ${fmt(last.accuracy)}%)`,
    },
    {
      name: "Fewer blunders",
      passed: week.blundersPerGame === null || last.blundersPerGame === null ? null : week.blundersPerGame <= last.blundersPerGame,
      detail: `${fmt(week.blundersPerGame, 1)} per game (last week ${fmt(last.blundersPerGame, 1)})`,
    },
    { name: "Played 3+ games", passed: week.games >= 3, detail: `${week.games} game${week.games === 1 ? "" : "s"}` },
    { name: "Scored 50%+", passed: week.games ? week.score >= 50 : null, detail: `${week.wins}W ${week.draws}D ${week.losses}L` },
    { name: "A clean game", passed: week.analyzed ? week.cleanGames > 0 : null, detail: `${week.cleanGames} with no mistakes` },
  ];
  const known = subjects.filter((s) => s.passed !== null);
  const share = known.length ? known.filter((s) => s.passed).length / known.length : 0;
  const grade: ReportCard["grade"] =
    known.length < 2 ? "-" : share === 1 ? "A+" : share >= 0.75 ? "A" : share >= 0.5 ? "B" : share >= 0.25 ? "C" : "D";
  const verdict =
    grade === "-"
      ? "Not enough games yet for a grade. Play and analyze a few, and Sir Blunderbuss will mark your week!"
      : grade === "A+" || grade === "A"
        ? "Outstanding week! Sir Blunderbuss is polishing a medal for you."
        : grade === "B"
          ? "A solid week. Fix your nemesis and the A is yours."
          : "A tough week, but every blunder you study is one you won't repeat. Onwards!";
  return { grade, subjects, verdict, mood: grade === "A+" || grade === "A" ? "proud" : grade === "-" || grade === "B" ? "happy" : "shocked" };
}
