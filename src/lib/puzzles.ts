import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { MistakeType, MoveReview } from "./classify";
import type { ReviewedGame } from "./profile";
import { moveName } from "./describe";

// The Puzzle Gym: every mistake or blunder of yours becomes a puzzle starting from the position
// before you went wrong. Puzzles are rebuilt from your analyses each time (cheap); only your
// spaced-repetition progress is stored, in users/{uid}/puzzles/{puzzleId}.

export type PuzzleTheme = "mate" | "material" | "safety" | "king" | "fork" | "tactic";

export const THEMES: Record<PuzzleTheme, { name: string; prompt: string }> = {
  mate: { name: "Mates", prompt: "You had a checkmate here. Find it!" },
  material: { name: "Free material", prompt: "Your opponent left something hanging. Win it!" },
  safety: { name: "Piece safety", prompt: "You lost a piece from here. Find a safe move." },
  king: { name: "King safety", prompt: "Your king got mated from here. Find a move that keeps him safe." },
  fork: { name: "Forks", prompt: "A fork was coming. Find a move that avoids it." },
  tactic: { name: "Tactics", prompt: "You walked into a trick here. Find the best move." },
};

const THEME_OF: Record<MistakeType, PuzzleTheme> = {
  missed_mate: "mate",
  missed_material: "material",
  hung_piece: "safety",
  allowed_mate: "king",
  fork: "fork",
  tactic: "tactic",
  other: "tactic",
};

export type Puzzle = {
  /** `${gameId}_${ply}` */
  id: string;
  gameId: string;
  ply: number;
  fen: string;
  color: Color;
  theme: PuzzleTheme;
  /** attack = play the engine's whole line; defend = any good-enough single move. */
  kind: "attack" | "defend";
  /** UCI moves, starting with yours, alternating with the opponent's. Ends with your move. */
  solution: string[];
  mateIn?: number;
  /** Your winning chances with the best move (0-100), to judge alternative answers. */
  winBest: number;
  label: "mistake" | "blunder";
  /** e.g. "14... Nf6" (what you actually played in the game). */
  played: string;
  oppName: string;
  endTime: number;
};

export type PuzzleState = {
  /** Leitner box: 0 = learning, 5 = mastered. */
  box: number;
  /** When it's due again (ms). Missing = mastered. */
  due?: number;
  attempts: number;
  solved: number;
  lastResult: "solved" | "failed";
  lastSeen: number;
};

/** Days until a solved puzzle comes back, per box. Missed puzzles always come back after 1 day. */
const INTERVALS_DAYS = [1, 3, 7, 14, 30];
const MASTERED_BOX = INTERVALS_DAYS.length;
const DAY = 24 * 60 * 60 * 1000;
const MAX_ATTACK_PLIES = 5;
const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function uciToMove(uci: string) {
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: (uci[4] ?? "q") as PieceSymbol };
}

function balance(chess: Chess, me: Color): number {
  let sum = 0;
  for (const row of chess.board()) for (const sq of row) if (sq) sum += (sq.color === me ? 1 : -1) * VALUES[sq.type];
  return sum;
}

/** The engine's line from the puzzle position, cut where the point is made (mate delivered / material won). */
function attackLine(m: MoveReview, pv: string, mateIn?: number): string[] {
  const moves = pv.split(" ").filter(Boolean);
  if (mateIn) return moves.slice(0, Math.min(2 * mateIn - 1, MAX_ATTACK_PLIES));

  const chess = new Chess(m.fenBefore);
  const start = balance(chess, m.color);
  for (let i = 0; i < Math.min(moves.length, MAX_ATTACK_PLIES); i++) {
    try {
      chess.move(uciToMove(moves[i]));
    } catch {
      return moves.slice(0, 1);
    }
    // Stop after one of *your* moves once you're at least 2 points up.
    if (i % 2 === 0 && balance(chess, m.color) - start >= 2) return moves.slice(0, i + 1);
  }
  return moves.slice(0, 1);
}

export function buildPuzzles(reviewed: ReviewedGame[]): Puzzle[] {
  const puzzles: Puzzle[] = [];
  for (const { game, analysis, review } of reviewed) {
    const evals = analysis.evals;
    for (const m of review.moves) {
      if (!m.mine || (m.label !== "mistake" && m.label !== "blunder") || !m.bestUci) continue;
      const theme = THEME_OF[m.type ?? "other"];
      const kind = theme === "mate" || theme === "material" ? "attack" : "defend";
      const pv = evals[m.ply - 1]?.pv ?? m.bestUci;
      const mateIn = m.type === "missed_mate" ? m.details?.mateIn : undefined;
      puzzles.push({
        id: `${game.id}_${m.ply}`,
        gameId: game.id,
        ply: m.ply,
        fen: m.fenBefore,
        color: m.color,
        theme,
        kind,
        solution: kind === "attack" ? attackLine(m, pv, mateIn) : [m.bestUci],
        mateIn,
        winBest: m.winBefore,
        label: m.label,
        played: moveName(m),
        oppName: game.oppName,
        endTime: game.endTime,
      });
    }
  }
  return puzzles;
}

/** New spaced-repetition state after an attempt. Solving on the first try moves the puzzle up a box. */
export function nextState(prev: PuzzleState | undefined, solved: boolean, now = Date.now()): PuzzleState {
  const box = solved ? Math.min((prev?.box ?? 0) + 1, MASTERED_BOX) : 0;
  const state: PuzzleState = {
    box,
    attempts: (prev?.attempts ?? 0) + 1,
    solved: (prev?.solved ?? 0) + (solved ? 1 : 0),
    lastResult: solved ? "solved" : "failed",
    lastSeen: now,
  };
  // Firestore rejects undefined: mastered puzzles simply have no due date.
  if (box < MASTERED_BOX) state.due = now + INTERVALS_DAYS[solved ? box - 1 : 0] * DAY;
  return state;
}

export type PuzzleStatus = "due" | "new" | "later" | "mastered";

export function statusOf(state: PuzzleState | undefined, now = Date.now()): PuzzleStatus {
  if (!state) return "new";
  if (state.due === undefined) return "mastered";
  return state.due <= now ? "due" : "later";
}

/** What to practise next: due reviews (oldest first), then new puzzles (latest games, blunders first). */
export function practiceQueue(puzzles: Puzzle[], states: Map<string, PuzzleState>, now = Date.now()): Puzzle[] {
  const due = puzzles
    .filter((p) => statusOf(states.get(p.id), now) === "due")
    .sort((a, b) => (states.get(a.id)!.due ?? 0) - (states.get(b.id)!.due ?? 0));
  const fresh = puzzles
    .filter((p) => statusOf(states.get(p.id), now) === "new")
    .sort((a, b) => b.endTime - a.endTime || Number(b.label === "blunder") - Number(a.label === "blunder"));
  return [...due, ...fresh];
}

// --- Firestore ---

const statesCol = (uid: string) => collection(db(), "users", uid, "puzzles");

export async function loadPuzzleStates(uid: string): Promise<Map<string, PuzzleState>> {
  const snap = await getDocs(statesCol(uid));
  return new Map(snap.docs.map((d) => [d.id, d.data() as PuzzleState]));
}

export async function savePuzzleState(uid: string, id: string, state: PuzzleState): Promise<void> {
  await setDoc(doc(statesCol(uid), id), state);
}

/** Daily warm-up progress (puzzles done today, solved or not), stored on the user document. */
export const WARMUP_SIZE = 5;

export function today(): string {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
}

export async function loadWarmup(uid: string): Promise<number> {
  const data = (await getDoc(doc(db(), "users", uid))).data() as { warmup?: { day: string; done: number } } | undefined;
  return data?.warmup?.day === today() ? data.warmup.done : 0;
}

export async function saveWarmup(uid: string, done: number): Promise<void> {
  await setDoc(doc(db(), "users", uid), { warmup: { day: today(), done } }, { merge: true });
}
