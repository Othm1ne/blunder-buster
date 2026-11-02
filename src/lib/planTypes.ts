// Shared between the browser (src/lib/plan.ts) and the Cloudflare Pages Function (functions/api/plan.ts).
// Like the game coach, the AI only gets numbers we computed (the Blunder Profile), never raw games.

/** What a plan day asks you to do; the app links each kind to the right page. */
export type PlanDayKind = "puzzles" | "play" | "review" | "study" | "rest";

/** Puzzle Gym themes a "puzzles" day can point to (same keys as PuzzleTheme). */
export const PLAN_THEMES = ["mate", "material", "safety", "king", "fork", "line", "tactic"] as const;
export type PlanTheme = (typeof PLAN_THEMES)[number];

export type PlanRequest = {
  ratings: { rapid?: number; blitz?: number };
  goal?: { timeClass: string; start: number; target: number; current?: number; deadline?: string };
  games: number;
  accuracy: number;
  blundersPerGame: number;
  mistakesPerGame: number;
  /** Most common mistake types first. */
  mistakes: { type: string; name: string; perGame: number; share: number }[];
  habits: { name: string; share: number; scoreWith?: number; scoreWithout?: number }[];
  time?: { quickMistakeRate?: number; slowMistakeRate?: number; timeTroubleShare: number };
  tilt?: { accuracyAfterLoss: number; accuracyOtherwise: number };
  /** Puzzles waiting in the Puzzle Gym, by theme. */
  puzzleThemes: { theme: PlanTheme; name: string; count: number }[];
  lastWeek?: { games: number; score: number; accuracy?: number; blundersPerGame?: number };
};

export type PlanDay = {
  /** "Mon" … "Sun". */
  day: string;
  kind: PlanDayKind;
  title: string;
  task: string;
  theme?: PlanTheme;
};

export type WeeklyPlan = {
  title: string;
  /** Why this week focuses on what it does, from the numbers. */
  focus: string;
  /** The one habit to repeat all week. */
  rule: string;
  days: PlanDay[];
};

export type PlanResponse = WeeklyPlan & { model: string };

export const PLAN_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Checks an AI answer before we trust it (fixes small slips, rejects the rest). */
export function cleanPlan(raw: unknown): WeeklyPlan | null {
  const p = raw as Partial<WeeklyPlan> | null;
  if (!p || typeof p.title !== "string" || typeof p.focus !== "string" || typeof p.rule !== "string") return null;
  if (!Array.isArray(p.days) || p.days.length !== 7) return null;
  const kinds: PlanDayKind[] = ["puzzles", "play", "review", "study", "rest"];
  const days = p.days.map((d, i): PlanDay | null => {
    if (!d || typeof d.title !== "string" || typeof d.task !== "string" || !kinds.includes(d.kind)) return null;
    const day: PlanDay = { day: PLAN_DAYS[i], kind: d.kind, title: d.title, task: d.task };
    if (d.kind === "puzzles" && d.theme && (PLAN_THEMES as readonly string[]).includes(d.theme)) day.theme = d.theme;
    return day;
  });
  if (days.some((d) => !d)) return null;
  return { title: p.title, focus: p.focus, rule: p.rule, days: days as PlanDay[] };
}
