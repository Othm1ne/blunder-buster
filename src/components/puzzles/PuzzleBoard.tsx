"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Mascot, type MascotMood } from "@/components/Mascot";
import { winChance } from "@/lib/classify";
import { PIECE_NAMES } from "@/lib/describe";
import { getEngine } from "@/lib/engine";
import { THEMES, uciToMove, type Puzzle } from "@/lib/puzzles";

/** An alternative move counts if it keeps your winning chances within this many points of the engine's move. */
const TOLERANCE = 8;
const CHECK_DEPTH = 12;
const REPLY_DELAY_MS = 500;
const MAX_WRONG = 3;

type Status = "playing" | "opponent" | "checking" | "wrong" | "solved" | "failed";

/**
 * Plays one puzzle. Reports once, when it ends: `cleanSolve` is true only when solved
 * on the first try without hints (that's what moves it up in spaced repetition).
 */
export function PuzzleBoard({
  puzzle,
  onFinished,
  onNext,
}: {
  puzzle: Puzzle;
  onFinished: (cleanSolve: boolean) => void;
  onNext: () => void;
}) {
  const [fen, setFen] = useState(puzzle.fen);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<Status>("playing");
  const [message, setMessage] = useState<string>(THEMES[puzzle.theme].prompt);
  const [wrong, setWrong] = useState(0);
  const [hint, setHint] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
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
    }, REPLY_DELAY_MS);
  }

  function onDrop(from: string, to: string | null): boolean {
    if (status !== "playing" || !to) return false;
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
            allowDragging: status === "playing",
            canDragPiece: ({ piece }) => status === "playing" && piece.pieceType[0] === myColor,
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
          <p
            className="text-sm font-semibold"
            style={{ color: status === "solved" ? "var(--good)" : status === "wrong" || status === "failed" ? "var(--bad)" : undefined }}
          >
            {message}
          </p>
          <div className="flex flex-wrap gap-2">
            {done ? (
              <button className="btn-primary" onClick={onNext}>
                Next puzzle →
              </button>
            ) : (
              <>
                <button className="btn-secondary" onClick={showHint} disabled={hint || status !== "playing"}>
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
