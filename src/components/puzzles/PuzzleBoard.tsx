"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Mascot, type MascotMood } from "@/components/Mascot";
import { winChance } from "@/lib/classify";
import { PIECE_NAMES } from "@/lib/describe";
import { getEngine } from "@/lib/engine";
import { attackedByMove, THEMES, uciToMove, type Puzzle } from "@/lib/puzzles";

/** An alternative move counts if it keeps your winning chances within this many points of the engine's move. */
const TOLERANCE = 8;
const CHECK_DEPTH = 12;
const REPLY_DELAY_MS = 500;
const MAX_WRONG = 3;

type Status = "playing" | "opponent" | "checking" | "wrong" | "solved" | "failed";

/** Blunder-check question: which of your pieces does their last move attack? Asked before your move. */
type Spot = { san: string; from: string; to: string; targets: string[]; picked: string[]; result?: "right" | "wrong" };

function makeSpot(fenBefore: string, uci: string): Spot | null {
  let san: string;
  try {
    san = new Chess(fenBefore).move(uciToMove(uci)).san;
  } catch {
    return null;
  }
  return { san, from: uci.slice(0, 2), to: uci.slice(2, 4), targets: attackedByMove(fenBefore, uci), picked: [] };
}

function describeTargets(fen: string, squares: string[]): string {
  const chess = new Chess(fen);
  const names = squares.map((sq) => {
    const piece = chess.get(sq as Square);
    return `${piece ? PIECE_NAMES[piece.type] : "piece"} on ${sq}`;
  });
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
}

/**
 * Plays one puzzle. Reports once, when it ends: `cleanSolve` is true only when solved
 * on the first try without hints (that's what moves it up in spaced repetition).
 */
export function PuzzleBoard({
  puzzle,
  onFinished,
  onNext,
  blunderCheck = false,
  onCheck,
}: {
  puzzle: Puzzle;
  onFinished: (cleanSolve: boolean) => void;
  onNext: () => void;
  /** Ask "what does their last move attack?" before each of your moves. */
  blunderCheck?: boolean;
  onCheck?: (correct: boolean) => void;
}) {
  const [fen, setFen] = useState(puzzle.fen);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<Status>("playing");
  const [message, setMessage] = useState<string>(THEMES[puzzle.theme].prompt);
  const [wrong, setWrong] = useState(0);
  const [hint, setHint] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(() => (blunderCheck && puzzle.prev ? makeSpot(puzzle.prev.fen, puzzle.prev.uci) : null));
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(spot);
  const reported = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const pov = (cp: number) => (puzzle.color === "w" ? winChance(cp) : 100 - winChance(cp));
  const myColor = puzzle.color;
  const myMoves = Math.ceil(puzzle.solution.length / 2);

  function finish(solved: boolean, text: string) {
    setStatus(solved ? "solved" : "failed");
    setMessage(text);
    if (!reported.current) {
      reported.current = true;
      onFinished(solved && wrong === 0 && !hint);
    }
  }

  function playReply(afterFen: string, nextStep: number) {
    setStatus("opponent");
    later(() => {
      const chess = new Chess(afterFen);
      const reply = chess.move(uciToMove(puzzle.solution[nextStep]));
      setFen(chess.fen());
      setLastMove({ from: reply.from, to: reply.to });
      setStep(nextStep + 1);
      setStatus("playing");
      setMessage(`Good! Your opponent replies ${reply.san}. Keep going!`);
      if (blunderCheck) setSpot(makeSpot(afterFen, puzzle.solution[nextStep]));
    }, REPLY_DELAY_MS);
  }

  function onDrop(from: string, to: string | null): boolean {
    if (status !== "playing" || spot || !to) return false;
    const chess = new Chess(fen);
    let played;
    try {
      played = chess.move({ from: from as Square, to: to as Square, promotion: "q" });
    } catch {
      return false;
    }
    const afterFen = chess.fen();
    setFen(afterFen);
    setLastMove({ from: played.from, to: played.to });
    const expected = puzzle.solution[step];

    if (played.lan === expected || chess.isCheckmate()) {
      const last = step + 1 >= puzzle.solution.length || chess.isCheckmate();
      if (last) finish(true, chess.isCheckmate() ? `Checkmate! ${played.san} wins the game.` : `Yes! ${played.san} is the move.`);
      else playReply(afterFen, step + 1);
      return true;
    }

    // Not the engine's move: maybe it's just as good. Ask Stockfish.
    setStatus("checking");
    setMessage("Hmm, let Sir Blunderbuss check that…");
    const engine = getEngine();
    const reference =
      step === 0
        ? Promise.resolve(puzzle.winBest)
        : (() => {
            const ref = new Chess(fen);
            ref.move(uciToMove(expected));
            return engine.evaluate(ref.fen(), CHECK_DEPTH, 800).then((e) => pov(e.cp));
          })();
    Promise.all([reference, engine.evaluate(afterFen, CHECK_DEPTH, 800)]).then(([best, mine]) => {
      if (best - pov(mine.cp) <= TOLERANCE) {
        const bestSan = new Chess(fen).move(uciToMove(expected)).san;
        finish(true, `${played.san} works too! (The engine's choice was ${bestSan}.)`);
        return;
      }
      const misses = wrong + 1;
      setWrong(misses);
      if (misses >= MAX_WRONG) {
        showSolution(`${played.san} isn't it.`);
        return;
      }
      setStatus("wrong");
      setMessage(`${played.san} isn't it. Try again!`);
      later(() => {
        setFen(fen);
        setLastMove(null);
        setStatus("playing");
      }, 900);
    });
    return true;
  }

  /** Plays the rest of the engine's line on the board, one move at a time. */
  function showSolution(prefix = "") {
    setSpot(null);
    setStatus("failed");
    const rest = puzzle.solution.slice(step);
    const line = new Chess(fen);
    const sans = rest.map((uci) => line.move(uciToMove(uci)).san);
    setFen(fen);
    const replay = new Chess(fen);
    rest.forEach((uci, i) =>
      later(() => {
        const mv = replay.move(uciToMove(uci));
        setFen(replay.fen());
        setLastMove({ from: mv.from, to: mv.to });
      }, 300 + i * 700),
    );
    finish(false, `${prefix ? `${prefix} ` : ""}The solution: ${sans.join(" ")}. This one comes back tomorrow!`);
  }

  function onSquare(square: string) {
    if (!spot || spot.result) return;
    const piece = new Chess(fen).get(square as Square);
    if (!piece || piece.color !== myColor) return;
    const picked = spot.picked.includes(square) ? spot.picked.filter((s) => s !== square) : [...spot.picked, square];
    setSpot({ ...spot, picked });
  }

  function checkSpot() {
    if (!spot) return;
    const right = spot.picked.length === spot.targets.length && spot.picked.every((s) => spot.targets.includes(s));
    onCheck?.(right);
    if (right) {
      setSpot({ ...spot, result: "right" });
      later(() => setSpot(null), 1200);
    } else setSpot({ ...spot, result: "wrong" });
  }

  function showHint() {
    setHint(true);
    const piece = new Chess(fen).get(puzzle.solution[step].slice(0, 2) as Square);
    setMessage(`Hint: move your ${piece ? PIECE_NAMES[piece.type] : "piece"} on ${puzzle.solution[step].slice(0, 2)}.`);
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    const color = status === "wrong" ? "#e5484d" : status === "solved" ? "#3fa34d" : "#f7bd35";
    squareStyles[lastMove.from] = { background: `${color}55` };
    squareStyles[lastMove.to] = { background: `${color}99` };
  }
  if (hint && status === "playing") squareStyles[puzzle.solution[step].slice(0, 2)] = { boxShadow: "inset 0 0 0 4px #f7bd35" };
  if (spot) {
    for (const sq of spot.picked) squareStyles[sq] = { ...squareStyles[sq], boxShadow: "inset 0 0 0 4px #4f8fdc" };
    if (spot.result === "wrong")
      for (const sq of spot.targets) squareStyles[sq] = { ...squareStyles[sq], boxShadow: "inset 0 0 0 4px #e5484d" };
  }

  const mood: MascotMood = status === "solved" ? "proud" : status === "wrong" || status === "failed" ? "shocked" : "happy";
  const done = status === "solved" || status === "failed";
  const toPlay = myColor === "w" ? "White" : "Black";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <Chessboard
          options={{
            id: "puzzle",
            position: fen,
            boardOrientation: myColor === "w" ? "white" : "black",
            squareStyles,
            allowDragging: status === "playing" && !spot,
            canDragPiece: ({ piece }) => status === "playing" && !spot && piece.pieceType[0] === myColor,
            onSquareClick: ({ square }) => onSquare(square),
            onPieceDrop: ({ sourceSquare, targetSquare }) => onDrop(sourceSquare, targetSquare),
            darkSquareStyle: { backgroundColor: "#b58863" },
            lightSquareStyle: { backgroundColor: "#f0d9b5" },
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="card flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Mascot mood={mood} size={56} />
            <div>
              <p className="font-display text-lg">{THEMES[puzzle.theme].name}</p>
              <p className="text-xs text-[var(--muted)]">
                {toPlay} to play
                {puzzle.kind === "attack" && myMoves > 1 ? ` · ${myMoves} moves` : ""}
                {puzzle.mateIn ? ` · mate in ${puzzle.mateIn}` : ""}
              </p>
            </div>
          </div>
          {spot && !done ? (
            <div className="flex flex-col gap-2 rounded-lg bg-[var(--stripe)] p-3 text-sm">
              <p className="font-semibold">Blunder check: what does {spot.san} attack?</p>
              {spot.result === "right" ? (
                <p className="font-semibold text-[var(--good)]">
                  Spot on!{" "}
                  {spot.targets.length ? `It attacks your ${describeTargets(fen, spot.targets)}.` : "Nothing is attacked."} Now
                  find your move.
                </p>
              ) : spot.result === "wrong" ? (
                <>
                  <p className="font-semibold text-[var(--bad)]">
                    {spot.targets.length
                      ? `Not quite: it attacks your ${describeTargets(fen, spot.targets)} (red).`
                      : "Not quite: their move doesn't attack anything of yours."}
                  </p>
                  <button className="btn-primary self-start text-sm" onClick={() => setSpot(null)}>
                    Got it, let me move
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[var(--muted)]">Tap every piece of yours it attacks, then check.</p>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-primary text-sm" onClick={checkSpot} disabled={!spot.picked.length}>
                      Check ({spot.picked.length})
                    </button>
                    <button className="btn-secondary text-sm" onClick={checkSpot} disabled={spot.picked.length > 0}>
                      Nothing is attacked
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <p
              className="text-sm font-semibold"
              style={{ color: status === "solved" ? "var(--good)" : status === "wrong" || status === "failed" ? "var(--bad)" : undefined }}
            >
              {message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {done ? (
              <button className="btn-primary" onClick={onNext}>
                Next puzzle →
              </button>
            ) : (
              <>
                <button className="btn-secondary" onClick={showHint} disabled={hint || status !== "playing" || !!spot}>
                  Hint
                </button>
                <button className="btn-secondary" onClick={() => showSolution()} disabled={status !== "playing"}>
                  Show solution
                </button>
              </>
            )}
          </div>
        </div>
        <div className="card text-sm">
          <p className="text-[var(--muted)]">
            From your game vs <strong className="text-[var(--ink)]">{puzzle.oppName}</strong> (
            {new Date(puzzle.endTime).toLocaleDateString()}). In the game you played{" "}
            <strong className="text-[var(--bad)]">{puzzle.played}</strong>.
          </p>
          {done && (
            <Link href={`/review?id=${puzzle.gameId}&ply=${puzzle.ply}`} className="mt-2 inline-block underline">
              See it in the game review
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
