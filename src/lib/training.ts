import { doc, getDoc, increment, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { MistakeType } from "./classify";
import type { Profile } from "./profile";
import { THEME_OF, type Puzzle, type PuzzleState, type PuzzleTheme } from "./puzzles";

// Training-mode progress (Endgame Arena stars, Boss Fights, Guess the Move scores, the Nemesis),
// all in one small document: users/{uid}/training/progress.

export type NemesisState = {
  type: MistakeType;
  theme: PuzzleTheme;
  /** Clean solves landed on it (it's beaten at NEMESIS_HP). Missed puzzles heal it by one. */
  hits: number;
  startedAt: number;
  /** Earlier nemeses you beat. */
  beaten?: { type: MistakeType; at: number }[];
};

export type TrainingDoc = {
  endgames?: Record<string, { stars: number; moves: number; at: number }>;
  bosses?: Record<string, { tries: number; beatenAt?: number }>;
  /** Best score per master game, in % of the maximum. */
  guess?: Record<string, { best: number; at: number }>;
  nemesis?: NemesisState;
};

export const NEMESIS_HP = 20;

export const NEMESIS_NAMES: Record<MistakeType, string> = {
  hung_piece: "The Piece Snatcher",
  missed_material: "The Free-Lunch Phantom",
  missed_mate: "The Mate Dodger",
  allowed_mate: "The King Hunter",
  fork: "The Fork Fiend",
  pin: "The Pin Wizard",
  skewer: "The Skewer Knight",
  tactic: "The Trickster",
  other: "The Blunder Beast",
};
/** A weakness needs at least this many puzzles to become a nemesis (they repeat during the fight). */
const NEMESIS_MIN_PUZZLES = 3;

const ref = (uid: string) => doc(db(), "users", uid, "training", "progress");

export async function loadTraining(uid: string): Promise<TrainingDoc> {
  return ((await getDoc(ref(uid))).data() as TrainingDoc | undefined) ?? {};
}

export async function saveEndgame(uid: string, id: string, stars: number, moves: number): Promise<void> {
  await setDoc(ref(uid), { endgames: { [id]: { stars, moves, at: Date.now() } } }, { merge: true });
}

export async function recordBoss(uid: string, id: string, beaten: boolean): Promise<void> {
  await setDoc(ref(uid), { bosses: { [id]: { tries: increment(1), ...(beaten && { beatenAt: Date.now() }) } } }, { merge: true });
}

export async function saveGuess(uid: string, id: string, best: number): Promise<void> {
  await setDoc(ref(uid), { guess: { [id]: { best, at: Date.now() } } }, { merge: true });
}

export async function saveNemesis(uid: string, nemesis: NemesisState): Promise<void> {
  await setDoc(ref(uid), { nemesis }, { merge: true });
}

/** Your worst weakness that has enough puzzles to fight it with. */
export function pickNemesis(profile: Profile, puzzles: Puzzle[], beaten: NemesisState["beaten"] = []): NemesisState | null {
  const counts = new Map<PuzzleTheme, number>();
  for (const p of puzzles) counts.set(p.theme, (counts.get(p.theme) ?? 0) + 1);
  const top = profile.types.find((t) => t.type !== "other" && (counts.get(THEME_OF[t.type]) ?? 0) >= NEMESIS_MIN_PUZZLES);
  return top ? { type: top.type, theme: THEME_OF[top.type], hits: 0, startedAt: Date.now(), beaten } : null;
}

/** After a puzzle in the nemesis's theme: a clean solve hits it, a miss heals it. */
export function hitNemesis(n: NemesisState, cleanSolve: boolean): { next: NemesisState; defeated: boolean } {
  const hits = Math.max(0, n.hits + (cleanSolve ? 1 : -1));
  if (hits < NEMESIS_HP) return { next: { ...n, hits }, defeated: false };
  return { next: { ...n, hits, beaten: [...(n.beaten ?? []), { type: n.type, at: Date.now() }] }, defeated: true };
}

/** Nemesis fight queue: due and new puzzles of its theme first, then the rest, least recently seen first. */
export function nemesisQueue(puzzles: Puzzle[], theme: PuzzleTheme, states: Map<string, PuzzleState>, fresh: Puzzle[]): Puzzle[] {
  const first = fresh.filter((p) => p.theme === theme);
  const ids = new Set(first.map((p) => p.id));
  const rest = puzzles
    .filter((p) => p.theme === theme && !ids.has(p.id))
    .sort((a, b) => (states.get(a.id)?.lastSeen ?? 0) - (states.get(b.id)?.lastSeen ?? 0));
  return [...first, ...rest];
}
