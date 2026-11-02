import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import type { EngineEval } from "./engine";

// Turns raw Stockfish evaluations into a move-by-move review: a label for every move,
// an accuracy score, and for your mistakes, *why* it was a mistake.
// Pure functions, no I/O: cheap enough to recompute whenever a game is shown.

export type MoveLabel = "brilliant" | "great" | "best" | "book" | "good" | "inaccuracy" | "mistake" | "blunder";

export type MistakeType =
  | "allowed_mate" // your move lets the opponent force mate
  | "missed_mate" // you had a forced mate (in 1-3) and didn't play it
  | "hung_piece" // the opponent can simply take material
  | "fork" // the opponent's reply attacks two of your valuable pieces at once
  | "pin" // the reply pins your piece to a more valuable one behind it
  | "skewer" // the reply attacks a valuable piece and wins the one behind it when it moves
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
  /** Pins and skewers: your piece behind the attacked one, on the same line. */
  behind?: PieceSymbol;
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
  /** Brilliant moves: the piece given up. */
  sacrificed?: PieceSymbol;
  /** Great moves: how much worse (in winning chances) the second-best move was. */
  onlyMoveGap?: number;
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
  /** Most specific opening name from the book (when the book was loaded). */
  opening?: string;
};

/**
 * Win-chance drop (percentage points) at which a move gets each label. Same as Lichess, whose
 * 0.1 / 0.2 / 0.3 thresholds are on a -1..1 scale, i.e. 5 / 10 / 15 points on our 0-100 scale.
 */
export const THRESHOLDS = { inaccuracy: 5, mistake: 10, blunder: 15 };
/** "Clearly winning" for failed-to-convert, in winning chances. */
const WINNING = 85;
const TIME_TROUBLE_SECONDS = 30;
const PV_PLIES = 4;
const MIN_MATERIAL = 2;
const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
/** Best to worst. */
export const LABEL_ORDER: MoveLabel[] = ["brilliant", "great", "best", "book", "good", "inaccuracy", "mistake", "blunder"];
/** Brilliant: not already winning big before, and still clearly fine after. */
const BRILLIANT_MAX_WIN = 90;
const BRILLIANT_MIN_WIN = 50;
/** Great: the second-best move is at least this many points worse, and you weren't already lost. */
const GREAT_MIN_GAP = 20;
const GREAT_MIN_WIN = 15;

/** Winning chances for White (0-100) from a centipawn score. Same curve as Lichess. */
export function winChance(cp: number): number {
  const capped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * capped)) - 1);
}

/** Per-move accuracy from the drop in winning chances (Lichess formula). */
function moveAccuracy(drop: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, drop)) - 3.1669 + 1));
}

/**
 * Game accuracy the Lichess way: the average of a volatility-weighted mean and a harmonic mean of
 * your move accuracies. Calm positions weigh more (a blunder there is all on you), and the harmonic
 * mean stops a couple of blunders from being averaged away by a pile of easy moves.
 */
function gameAccuracy(moves: MoveReview[], evals: EngineEval[], me: Color): number {
  const wins = evals.slice(0, moves.length + 1).map((e) => winChance(e.cp));
  const size = Math.max(2, Math.min(8, Math.floor(wins.length / 10)));
  let weighted = 0;
  let weights = 0;
  let inverse = 0;
  let count = 0;
  moves.forEach((m, i) => {
    if (m.color !== me) return;
    const start = Math.max(0, i - size + 2);
    const weight = Math.max(0.5, Math.min(12, stdDev(wins.slice(start, start + size))));
    weighted += m.accuracy * weight;
    weights += weight;
    inverse += 1 / Math.max(1, m.accuracy);
    count++;
  });
  return count ? (weighted / weights + count / inverse) / 2 : 0;
}

function stdDev(xs: number[]): number {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
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

      const line = lost >= MIN_MATERIAL ? lineTactic(afterReply, reply.to, me) : null;
      if (line) {
        const { kind, front, back } = line;
        return {
          type: kind,
          details: {
            piece: front.type,
            square: front.square,
            by: forker?.type,
            behind: back.type,
            targets: [front.square, back.square],
            material: lost,
            threatSan,
          },
        };
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

const DIAGONALS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const STRAIGHTS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Pin or skewer by the bishop, rook or queen on `from`: it attacks one of my pieces and another
 * of mine stands right behind it on the same line. More valuable behind = pin (the front piece
 * can't move away), less valuable behind = skewer (the front piece moves and the back one falls).
 */
function lineTactic(chess: Chess, from: Square, me: Color) {
  const slider = chess.get(from);
  if (!slider || slider.color === me || !"brq".includes(slider.type)) return null;
  const dirs = slider.type === "b" ? DIAGONALS : slider.type === "r" ? STRAIGHTS : [...DIAGONALS, ...STRAIGHTS];
  const worth = (t: PieceSymbol) => (t === "k" ? 100 : VALUES[t]);
  for (const [df, dr] of dirs) {
    const found: { square: Square; type: PieceSymbol; color: Color }[] = [];
    let f = from.charCodeAt(0) - 97 + df;
    let r = Number(from[1]) - 1 + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8 && found.length < 2) {
      const square = `${String.fromCharCode(97 + f)}${r + 1}` as Square;
      const piece = chess.get(square);
      if (piece) found.push({ square, type: piece.type, color: piece.color });
      f += df;
      r += dr;
    }
    const [front, back] = found;
    if (!front || !back || front.color !== me || back.color !== me) continue;
    if (worth(back.type) > worth(front.type) && VALUES[front.type] >= 3) return { kind: "pin" as const, front, back };
    if (worth(front.type) > worth(back.type) && VALUES[back.type] >= 3) return { kind: "skewer" as const, front, back };
  }
  return null;
}

function worse(a: MoveLabel, b: MoveLabel): MoveLabel {
  return LABEL_ORDER.indexOf(a) >= LABEL_ORDER.indexOf(b) ? a : b;
}

/** Position key used by the opening book: FEN without the move counters. */
export function epd(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/**
 * Pieces of `color` (knight or bigger) the opponent could win right now with a *legal* capture
 * (so pinned attackers don't count): the piece is undefended, or a cheaper piece can take it.
 */
function hangingPieces(fen: string, color: Color): { square: Square; type: PieceSymbol }[] {
  const opp: Color = color === "w" ? "b" : "w";
  const chess = new Chess(fen);
  if (chess.turn() !== opp) {
    // Let the opponent "move" in our position to list their legal captures.
    try {
      if (chess.isCheck() || !chess.setTurn(opp)) return [];
    } catch {
      return [];
    }
  }
  const cheapestCapturer = new Map<Square, number>();
  for (const mv of chess.moves({ verbose: true })) {
    if (!mv.captured || mv.captured === "p" || mv.captured === "k") continue;
    cheapestCapturer.set(mv.to, Math.min(cheapestCapturer.get(mv.to) ?? 100, VALUES[mv.piece] || 100));
  }
  const hanging: { square: Square; type: PieceSymbol }[] = [];
  for (const [square, cheapest] of cheapestCapturer) {
    const piece = chess.get(square)!;
    const defended = chess.attackers(square, color).length > 0;
    if (!defended || cheapest < VALUES[piece.type]) hanging.push({ square, type: piece.type });
  }
  return hanging;
}

/**
 * Did this move give up material on purpose? True only when nothing was in danger before
 * (so it's a free choice, not damage control) and the move leaves a piece the opponent can win,
 * worth at least 2 points more than what the move itself captured (so plain trades don't count).
 */
function sacrifice(m: MoveReview, captured: PieceSymbol | undefined, after: Chess): PieceSymbol | undefined {
  // Cheap check first (this runs for every best move of every game): nothing to give up unless
  // one of your knights-or-bigger is attacked. Listing all legal captures is the slow part.
  const opp: Color = m.color === "w" ? "b" : "w";
  const attacked = after
    .board()
    .flat()
    .some((s) => s && s.color === m.color && VALUES[s.type] >= 3 && after.attackers(s.square, opp).length > 0);
  if (!attacked) return undefined;
  const movedTo = m.uci.slice(2, 4);
  const given = hangingPieces(m.fenAfter, m.color)
    .map((p) => ({ ...p, net: VALUES[p.type] - (p.square === movedTo && captured ? VALUES[captured] : 0) }))
    .filter((p) => p.net >= MIN_MATERIAL)
    .sort((a, b) => VALUES[b.type] - VALUES[a.type]);
  if (!given.length || hangingPieces(m.fenBefore, m.color).length > 0) return undefined;
  return given[0].type;
}

export type OpeningBook = Record<string, string>;

export function reviewGame(
  moves: string[],
  evals: EngineEval[],
  myColor: "white" | "black",
  result: "win" | "loss" | "draw",
  clocks: number[] = [],
  book?: OpeningBook | null,
): GameReview {
  const me: Color = myColor === "white" ? "w" : "b";
  const chess = new Chess();
  const reviewed: MoveReview[] = [];
  let peakWin = 50;
  let inBook = !!book;
  let opening: string | undefined;

  for (let i = 0; i < moves.length && i + 1 < evals.length; i++) {
    const fenBefore = chess.fen();
    const before = evals[i];
    // Name the engine's move by playing and undoing it here: much cheaper than a new Chess(fen).
    let bestSan: string | undefined;
    if (before.best) {
      try {
        bestSan = chess.move(uciToMove(before.best)).san;
        chess.undo();
      } catch {
        // illegal move from a shallow search: leave it unnamed
      }
    }
    const played = chess.move(moves[i]);
    const fenAfter = chess.fen();
    const after = evals[i + 1];
    const color = played.color;
    const pov = (cp: number) => (color === "w" ? winChance(cp) : 100 - winChance(cp));
    const winBefore = pov(before.cp);
    const winAfter = pov(after.cp);
    const drop = Math.max(0, winBefore - winAfter);

    // Book: every move so far is known opening theory.
    const bookName = inBook ? book?.[epd(fenAfter)] : undefined;
    inBook = bookName !== undefined;
    if (bookName) opening = bookName;

    // Playing the engine's own top move is never a mistake: a "drop" there is just the engine
    // seeing deeper one move later (horizon effect), not something you could have avoided.
    let label: MoveLabel = inBook
      ? "book"
      : played.lan === before.best
        ? "best"
        : drop >= THRESHOLDS.blunder
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
      bestSan,
      clock: clocks[i],
    };

    // Missing a short forced mate is a real mistake even if you're still winning big.
    const missedShortMate =
      mateWinner(before) === color && Math.abs(before.mate ?? 99) <= 2 && mateWinner(after) !== color;
    if (missedShortMate) label = m.label = worse(label, "mistake");

    if (!inBook && played.lan === before.best) {
      // Brilliant: the engine's own top move, a real sacrifice, still good afterwards, and played
      // when the game wasn't already decided, or forcing mate (Morphy's Qb8+ while already winning).
      const forcesMate = mateWinner(after) === color && !played.san.endsWith("#");
      const piece =
        (winBefore < BRILLIANT_MAX_WIN || forcesMate) && winAfter >= BRILLIANT_MIN_WIN
          ? sacrifice(m, played.captured, chess)
          : undefined;
      if (piece) {
        label = m.label = "brilliant";
        m.sacrificed = piece;
      } else if (played.lan === before.best && before.second && winBefore >= GREAT_MIN_WIN && !played.san.endsWith("#")) {
        // Great: the only good move. The second-best move would have thrown away a lot.
        const gap = winBefore - pov(before.second.cp);
        const prev = reviewed.at(-1);
        const recapture = prev?.uci.slice(2, 4) === played.to && new Chess(prev.fenBefore).get(played.to as Square) !== undefined;
        if (gap >= GREAT_MIN_GAP && !recapture) {
          label = m.label = "great";
          m.onlyMoveGap = gap;
        }
      }
    }

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
    accuracy: gameAccuracy(reviewed, evals, me),
    counts,
    mistakeTypes,
    failedToConvert,
    peakWin,
    opening,
  };
}
