import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";
import type { MistakeType } from "./classify";
import { MISTAKE_NAMES } from "./describe";
import { HABITS } from "./insights";
import type { RatingGoal } from "./goal";
import type { Profile } from "./profile";
import { THEMES, type Puzzle, type PuzzleTheme } from "./puzzles";
import { TIPS } from "./templates";
import type { WeekStats } from "./weekly";
import { PLAN_DAYS, type PlanDay, type PlanRequest, type PlanResponse, type WeeklyPlan } from "./planTypes";

// The weekly plan: written once a week by the Gemini coach from your Blunder Profile, with a
// template plan when the AI is unavailable. Stored in users/{uid}/plans/{week's Monday}.

const PLAN_URL = process.env.NEXT_PUBLIC_PLAN_URL || "/api/plan";

export type StoredPlan = {
  week: string;
  plan: WeeklyPlan;
  source: "ai" | "template";
  model?: string;
  createdAt: number;
  /** Day indexes (0 = Monday) you ticked off. */
  done: number[];
};

const planRef = (uid: string, week: string) => doc(db(), "users", uid, "plans", week);

export async function loadPlan(uid: string, week: string): Promise<StoredPlan | null> {
  const snap = await getDoc(planRef(uid, week));
  return snap.exists() ? (snap.data() as StoredPlan) : null;
}

export async function savePlan(uid: string, plan: StoredPlan): Promise<void> {
  await setDoc(planRef(uid, plan.week), plan);
}

export async function saveDone(uid: string, week: string, done: number[]): Promise<void> {
  await updateDoc(planRef(uid, week), { done });
}

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

export function planRequest(opts: {
  profile: Profile;
  puzzles: Puzzle[];
  ratings: PlanRequest["ratings"];
  goal?: RatingGoal;
  goalCurrent?: number;
  lastWeek?: WeekStats;
}): PlanRequest {
  const { profile, puzzles, goal, lastWeek } = opts;
  const counts = new Map<PuzzleTheme, number>();
  for (const p of puzzles) counts.set(p.theme, (counts.get(p.theme) ?? 0) + 1);
  const time = profile.time;
  const rate = (r: { moves: number; errors: number }) => (r.moves >= 20 ? round(r.errors / r.moves) : undefined);

  const req: PlanRequest = {
    ratings: opts.ratings,
    games: profile.games,
    accuracy: round(profile.accuracy, 1),
    blundersPerGame: round(profile.blundersPerGame),
    mistakesPerGame: round(profile.mistakesPerGame),
    mistakes: profile.types.slice(0, 5).map((t) => ({
      type: t.type,
      name: MISTAKE_NAMES[t.type],
      perGame: round(t.count / (profile.games || 1)),
      share: round(t.share),
    })),
    habits: profile.habits.map((h) => ({
      name: HABITS[h.habit].name,
      share: round(h.share),
      ...(h.scoreWith !== null && { scoreWith: Math.round(h.scoreWith) }),
      ...(h.scoreWithout !== null && { scoreWithout: Math.round(h.scoreWithout) }),
    })),
    puzzleThemes: [...counts].map(([theme, count]) => ({ theme, name: THEMES[theme].name, count })),
  };
  if (time) {
    req.time = { timeTroubleShare: round(profile.timeTroubleShare) };
    const quick = rate(time.quick);
    const slow = rate(time.slow);
    if (quick !== undefined) req.time.quickMistakeRate = quick;
    if (slow !== undefined) req.time.slowMistakeRate = slow;
  }
  if (profile.tilt)
    req.tilt = { accuracyAfterLoss: round(profile.tilt.afterLoss.accuracy, 1), accuracyOtherwise: round(profile.tilt.otherwise.accuracy, 1) };
  if (goal) {
    req.goal = { timeClass: goal.timeClass, start: goal.start, target: goal.target };
    if (opts.goalCurrent) req.goal.current = opts.goalCurrent;
    if (goal.deadline) req.goal.deadline = goal.deadline;
  }
  if (lastWeek?.games) {
    req.lastWeek = { games: lastWeek.games, score: Math.round(lastWeek.score) };
    if (lastWeek.accuracy !== null) req.lastWeek.accuracy = round(lastWeek.accuracy, 1);
    if (lastWeek.blundersPerGame !== null) req.lastWeek.blundersPerGame = round(lastWeek.blundersPerGame);
  }
  return req;
}

export async function requestPlan(user: User, req: PlanRequest): Promise<PlanResponse> {
  const res = await fetch(PLAN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const message = ((await res.json().catch(() => ({}))) as { error?: string }).error;
    throw new Error(message ?? `Plan error ${res.status}`);
  }
  return (await res.json()) as PlanResponse;
}

const THEME_OF_TYPE: Partial<Record<MistakeType, PuzzleTheme>> = {
  hung_piece: "safety",
  missed_material: "material",
  missed_mate: "mate",
  allowed_mate: "king",
  fork: "fork",
  pin: "line",
  skewer: "line",
  tactic: "tactic",
};

/** Sir Blunderbuss's own plan, built from the same numbers, for when the AI can't answer. */
export function templatePlan(profile: Profile, puzzles: Puzzle[]): WeeklyPlan {
  const available = new Set(puzzles.map((p) => p.theme));
  const top = profile.types.find((t) => t.type !== "other");
  const mainTheme = (top && THEME_OF_TYPE[top.type]) ?? undefined;
  const theme = mainTheme && available.has(mainTheme) ? mainTheme : [...available][0];
  const second = [...available].find((t) => t !== theme) ?? theme;
  const habit = [...profile.habits].sort((a, b) => b.share - a.share)[0];
  const enemy = top ? MISTAKE_NAMES[top.type].toLowerCase() : "blunders";
  const rule = (top && TIPS[top.type]) ?? "Before every move, ask: what does their last move attack?";

  const puzzleDay = (t: PuzzleTheme | undefined, title: string): PlanDay =>
    t
      ? { day: "", kind: "puzzles", title, task: `Solve 5 puzzles from your own games in the ${THEMES[t].name} set. Say the answer out loud before you move.`, theme: t }
      : { day: "", kind: "puzzles", title, task: "Do your daily warm-up: 5 puzzles from your own games." };

  const days: PlanDay[] = [
    puzzleDay(theme, "Hunt your nemesis"),
    { day: "", kind: "play", title: "One slow game", task: "Play one 15+10 game and apply the rule of the week on every single move." },
    { day: "", kind: "review", title: "Review and learn", task: "Review your latest game move by move and retry every mistake." },
    puzzleDay(second, "Sharpen your eye"),
    habit && habit.share >= 0.2
      ? { day: "", kind: "play", title: "Fix the opening", task: `Play two rapid games and focus on this: ${HABITS[habit.habit].tip}` }
      : { day: "", kind: "play", title: "Two rapid games", task: "Play two 10+5 games. Use your time: no move in under 3 seconds after move 10." },
    puzzleDay(theme, "Nemesis rematch"),
    { day: "", kind: "rest", title: "Light day", task: "Rest, or do 3 puzzles to keep your streak alive." },
  ];
  return {
    title: `Operation: beat ${enemy}`,
    focus: top
      ? `Your number one enemy is "${enemy}": ${(top.count / (profile.games || 1)).toFixed(1)} per game. This week is all about hunting it down.`
      : "No big weakness stands out: this week is about steady, careful play.",
    rule,
    days: days.map((d, i) => ({ ...d, day: PLAN_DAYS[i] })),
  };
}
