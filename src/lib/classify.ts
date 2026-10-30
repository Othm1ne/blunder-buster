import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import type { EngineEval } from "./engine";

// Turns raw Stockfish evaluations into a move-by-move review: a label for every move,
// an accuracy score, and for your mistakes, *why* it was a mistake.
// Pure functions, no I/O: cheap enough to recompute whenever a game is shown.

export type MoveLabel = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export type MistakeType =
  | "allowed_mate" // your move lets the opponent force mate
  | "missed_mate" // you had a forced mate (in 1-3) and didn't play it
  | "hung_piece" // the opponent can simply take material
  | "fork" // the opponent's reply attacks two of your valuable pieces at once
  | "missed_material" // the opponent left something hanging and you didn't take it
  | "tactic" // you lose material to a longer combination
  | "other"; // positional / harder to name

export type MistakeDetails = {
  /** Piece lost, missed, or forked (for forks: the forking piece). */
  piece?: PieceSymbol;
  square?: Square;
  /** Piece that does the capturing / forking. */
  by?: PieceSymbol;
  /** Forked squares. */
  targets?: Square[];
  /** Material swing in pawns (positive = bad for you, or what you missed). */
  material?: number;
  mateIn?: number;
  backRank?: boolean;
  /** The opponent's best reply (for your mistakes) in SAN. */
  threatSan?: string;
};

export type MoveReview = {
  /** 1-based ply: 1 = White's first move. */
  ply: number;
  moveNumber: number;
  color: Color;
  mine: boolean;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  label: MoveLabel;
  /** Winning chances (0-100) for the player who moved, before and after the move. */
  winBefore: number;
  winAfter: number;
  accuracy: number;
  bestUci?: string;
  bestSan?: string;
  /** Seconds left on the mover's clock after this move. */
  clock?: number;
  type?: MistakeType;
  timeTrouble?: boolean;
  details?: MistakeDetails;
};

export type GameReview = {
  moves: MoveReview[];
  /** Your accuracy, 0-100. */
  accuracy: number;
  counts: Record<MoveLabel, number>;
  mistakeTypes: Partial<Record<MistakeType | "failed_to_convert" | "time_trouble", number>>;
  /** You were clearly winning at some point and didn't win. */
  failedToConvert: boolean;
  /** Your best winning chances during the game. */
  peakWin: number;
};

/** Win-chance drop (percentage points) at which a move gets each label (same scale as Lichess). */
const THRESHOLDS = { inaccuracy: 10, mistake: 20, blunder: 30 };
/** "Clearly winning" for failed-to-convert, in winning chances. */
const WINNING = 85;
const TIME_TROUBLE_SECONDS = 30;
const PV_PLIES = 4;
const MIN_MATERIAL = 2;
const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const LABEL_ORDER: MoveLabel[] = ["best", "good", "inaccuracy", "mistake", "blunder"];

/** Winning chances for White (0-100) from a centipawn score. Same curve as Lichess. */
export function winChance(cp: number): number {
  const capped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * capped)) - 1);
}

/** Per-move accuracy from the drop in winning chances (Lichess formula). */
function moveAccuracy(drop: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, drop)) - 3.1669 + 1));
}

/** Who is mating in this evaluation, if anyone. */
function mateWinner(e: EngineEval): Color | null {
  if (e.mate === undefined) return null;
  if (e.mate === 0) return e.cp > 0 ? "w" : "b";
  return e.mate > 0 ? "w" : "b";
}

function material(chess: Chess, color: Color): number {
  let sum = 0;
  for (const row of chess.board()) for (const sq of row) if (sq && sq.color === color) sum += VALUES[sq.type];
  return sum;
}

/** My material minus theirs. */
function balance(chess: Chess, me: Color): number {
  return material(chess, me) - material(chess, me === "w" ? "b" : "w");
}

function uciToMove(uci: string) {
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] as PieceSymbol | undefined };
}

/** Plays up to `plies` moves of a principal variation. Returns the final position. */
function playLine(fen: string, pv: string | undefined, plies: number): Chess {
  const chess = new Chess(fen);
  for (const uci of (pv ?? "").split(" ").filter(Boolean).slice(0, plies)) {
    try {
      chess.move(uciToMove(uci));
    } catch {
      break;
    }
  }
  return chess;
}

function sanOf(fen: string, uci: string | undefined): string | undefined {
  if (!uci) return undefined;
  try {
    return new Chess(fen).move(uciToMove(uci)).san;
  } catch {
    return undefined;
  }
}

/** Explains a mistake by looking at what the engine's lines do to material and king safety. */
function diagnose(m: MoveReview, before: EngineEval, after: EngineEval): { type: MistakeType; details: MistakeDetails } {
  const me = m.color;
  const opp: Color = me === "w" ? "b" : "w";
  const threatSan = sanOf(m.fenAfter, after.best);

  // 1. Allowed mate
  if (mateWinner(after) === opp && mateWinner(before) !== opp) {
    // Back-rank mate: a rook or queen delivers mate along your first rank.
    const end = playLine(m.fenAfter, after.pv, 99);
    const mating = end.history({ verbose: true }).at(-1);
    const backRank =
      end.isCheckmate() && !!mating && "rq".includes(mating.piece) && mating.to[1] === (me === "w" ? "1" : "8");
    return { type: "allowed_mate", details: { mateIn: Math.abs(after.mate ?? 0), backRank, threatSan } };
  }

  // 2. Missed mate (only short, findable ones)
  if (mateWinner(before) === me && before.mate !== undefined && Math.abs(before.mate) <= 3 && mateWinner(after) !== me) {
    return { type: "missed_mate", details: { mateIn: Math.abs(before.mate), threatSan: m.bestSan } };
  }

  const afterMove = new Chess(m.fenAfter);
  const startBalance = balance(afterMove, me);

  // 3./4. What does the opponent's best reply do?
  if (after.best) {
    const reply = uciToMove(after.best);
    const lost = startBalance - balance(playLine(m.fenAfter, after.pv, PV_PLIES), me);
    const target = afterMove.get(reply.to);

    if (lost >= MIN_MATERIAL && target && target.color === me) {
      const by = afterMove.get(reply.from)?.type;
      return { type: "hung_piece", details: { piece: target.type, square: reply.to, by, material: lost, threatSan } };
    }

    // Fork: after the reply, the moved piece attacks 2+ of my valuable pieces (king counts).
    const afterReply = new Chess(m.fenAfter);
    try {
      afterReply.move(reply);
      const forker = afterReply.get(reply.to);
      const targets = afterReply
        .board()
        .flat()
        .filter((s) => s && s.color === me && (s.type === "k" || VALUES[s.type] >= 3))
        .filter((s) => afterReply.attackers(s!.square, opp).includes(reply.to))
        .map((s) => s!.square);
      if (targets.length >= 2 && lost >= MIN_MATERIAL) {
        return { type: "fork", details: { piece: forker?.type, by: forker?.type, square: reply.to, targets, material: lost, threatSan } };
      }
    } catch {
      // illegal reply from a shallow search: ignore
    }

    // 5. Missed free material: my best line wins material, my move doesn't.
    const beforeMove = new Chess(m.fenBefore);
    const gain = balance(playLine(m.fenBefore, before.pv, PV_PLIES), me) - balance(beforeMove, me);
    const got = startBalance - balance(beforeMove, me);
    if (gain >= MIN_MATERIAL && got < gain - 1 && before.best) {
      const missed = beforeMove.get(uciToMove(before.best).to);
      return { type: "missed_material", details: { piece: missed?.type, square: uciToMove(before.best).to, material: gain, threatSan: m.bestSan } };
    }

    if (lost >= MIN_MATERIAL) return { type: "tactic", details: { material: lost, threatSan } };
  }

  return { type: "other", details: { threatSan } };
}

function worse(a: MoveLabel, b: MoveLabel): MoveLabel {
  return LABEL_ORDER.indexOf(a) >= LABEL_ORDER.indexOf(b) ? a : b;
}

export function reviewGame(
  moves: string[],
  evals: EngineEval[],
  myColor: "white" | "black",
  result: "win" | "loss" | "draw",
  clocks: number[] = [],
): GameReview {
  const me: Color = myColor === "white" ? "w" : "b";
  const chess = new Chess();
  const reviewed: MoveReview[] = [];
  let peakWin = 50;

  for (let i = 0; i < moves.length && i + 1 < evals.length; i++) {
    const fenBefore = chess.fen();
    const played = chess.move(moves[i]);
    const fenAfter = chess.fen();
    const before = evals[i];
    const after = evals[i + 1];
    const color = played.color;
    const pov = (cp: number) => (color === "w" ? winChance(cp) : 100 - winChance(cp));
    const winBefore = pov(before.cp);
    const winAfter = pov(after.cp);
    const drop = Math.max(0, winBefore - winAfter);

    let label: MoveLabel =
      drop >= THRESHOLDS.blunder
        ? "blunder"
        : drop >= THRESHOLDS.mistake
          ? "mistake"
          : drop >= THRESHOLDS.inaccuracy
            ? "inaccuracy"
            : played.lan === before.best || drop < 1
              ? "best"
              : "good";

    const m: MoveReview = {
      ply: i + 1,
      moveNumber: Math.floor(i / 2) + 1,
      color,
      mine: color === me,
      san: played.san,
      uci: played.lan,
      fenBefore,
      fenAfter,
      label,
      winBefore,
      winAfter,
      accuracy: moveAccuracy(drop),
      bestUci: before.best,
      bestSan: sanOf(fenBefore, before.best),
      clock: clocks[i],
    };

    // Missing a short forced mate is a real mistake even if you're still winning big.
    const missedShortMate =
      mateWinner(before) === color && Math.abs(before.mate ?? 99) <= 2 && mateWinner(after) !== color;
    if (missedShortMate) label = m.label = worse(label, "mistake");

    if (m.mine) {
      peakWin = Math.max(peakWin, winAfter);
      if (label === "mistake" || label === "blunder") {
        const { type, details } = diagnose(m, before, after);
        m.type = type;
        m.details = details;
        if (m.clock !== undefined && m.clock < TIME_TROUBLE_SECONDS) m.timeTrouble = true;
      }
    }
    reviewed.push(m);
  }

  const mine = reviewed.filter((m) => m.mine);
  const counts = Object.fromEntries(LABEL_ORDER.map((l) => [l, 0])) as Record<MoveLabel, number>;
  const mistakeTypes: GameReview["mistakeTypes"] = {};
  for (const m of mine) {
    counts[m.label]++;
    if (m.type) mistakeTypes[m.type] = (mistakeTypes[m.type] ?? 0) + 1;
    if (m.timeTrouble) mistakeTypes.time_trouble = (mistakeTypes.time_trouble ?? 0) + 1;
  }
  const failedToConvert = peakWin >= WINNING && result !== "win";
  if (failedToConvert) mistakeTypes.failed_to_convert = 1;

  return {
    moves: reviewed,
    accuracy: mine.length ? mine.reduce((s, m) => s + m.accuracy, 0) / mine.length : 0,
    counts,
    mistakeTypes,
    failedToConvert,
    peakWin,
  };
}
