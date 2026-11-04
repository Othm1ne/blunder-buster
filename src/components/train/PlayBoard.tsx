"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Chess, type Color, type Move, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Mascot, type MascotMood } from "@/components/Mascot";
import { goalText, judge, REPLY_DEPTH, REPLY_MS, type Goal, type Verdict } from "@/lib/arena";
import { Engine } from "@/lib/engine";
import { uciToMove } from "@/lib/puzzles";

const REPLY_DELAY_MS = 250;

type Status = "me" | "thinking" | "over";

/**
 * Play a position out against Stockfish until the goal is reached or failed. Uses its own
 * engine so it never waits behind the background game analysis.
 */
export function PlayBoard({
  fen: startFen,
  color,
  goal,
  title,
  tip,
  onEnd,
  children,
}: {
  fen: string;
  color: Color;
  goal: Goal;
  title: string;
  tip?: string;
  onEnd: (verdict: Verdict, myMoves: number) => void;
  /** Extra info under the panel (where the position comes from, etc.). */
  children?: ReactNode;
}) {
  const [fen, setFen] = useState(startFen);
  const [status, setStatus] = useState<Status>("me");
  const [myMoves, setMyMoves] = useState(0);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const engine = useRef<Engine | null>(null);
  // Bumped on restart, so a reply that arrives for an old attempt is ignored.
  const attempt = useRef(0);

  useEffect(() => {
    const e = new Engine();
    engine.current = e;
    return () => e.terminate();
  }, []);

  function end(v: Verdict, moves: number) {
    setVerdict(v);
    setStatus("over");
    onEnd(v, moves);
  }

  function restart() {
    attempt.current++;
    setFen(startFen);
    setStatus("me");
    setMyMoves(0);
    setLastMove(null);
    setVerdict(null);
    setMessage(null);
  }

  function onDrop(from: string, to: string | null): boolean {
    if (status !== "me" || !to || !engine.current) return false;
    const chess = new Chess(fen);
    let played: Move;
    try {
      played = chess.move({ from: from as Square, to: to as Square, promotion: "q" });
    } catch {
      return false;
    }
    const moves = myMoves + 1;
    setFen(chess.fen());
    setLastMove({ from: played.from, to: played.to });
    setMyMoves(moves);
    setMessage(null);
    const over = judge(goal, chess, color, moves, played);
    if (over) {
      end(over, moves);
      return true;
    }

    setStatus("thinking");
    const mine = attempt.current;
    engine.current
      .evaluate(chess.fen(), REPLY_DEPTH, REPLY_MS)
      .then((e) => {
        if (mine !== attempt.current) return;
        const v = judge(goal, chess, color, moves, played, e);
        if (v) return end(v, moves);
        if (!e.best) return end({ won: false, text: "The engine has no move here.", stars: 0 }, moves);
        window.setTimeout(() => {
          if (mine !== attempt.current) return;
          const reply = chess.move(uciToMove(e.best!));
          setFen(chess.fen());
          setLastMove({ from: reply.from, to: reply.to });
          const after = judge(goal, chess, color, moves, reply);
          if (after) end(after, moves);
          else setStatus("me");
        }, REPLY_DELAY_MS);
      })
      .catch((err) => {
        if (mine !== attempt.current) return;
        setStatus("me");
        setMessage(err instanceof Error ? err.message : String(err));
      });
    return true;
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    const tint = verdict ? (verdict.won ? "#3fa34d" : "#e5484d") : "#f7bd35";
    squareStyles[lastMove.from] = { background: `${tint}55` };
    squareStyles[lastMove.to] = { background: `${tint}99` };
  }

  const mood: MascotMood = verdict ? (verdict.won ? "proud" : "shocked") : "happy";
  const limit = goal.kind === "hold" ? goal.moves : goal.maxMoves;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <Chessboard
          options={{
            id: "play",
            position: fen,
            boardOrientation: color === "w" ? "white" : "black",
            squareStyles,
            allowDragging: status === "me",
            canDragPiece: ({ piece }) => status === "me" && piece.pieceType[0] === color,
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
            <div className="min-w-0">
              <p className="font-display text-lg">{title}</p>
              <p className="text-xs text-[var(--muted)]">
                {color === "w" ? "White" : "Black"} · move {Math.min(myMoves + (status === "over" ? 0 : 1), limit)}/{limit}
              </p>
            </div>
          </div>
          <p className="rounded-lg bg-[var(--stripe)] px-3 py-2 text-sm">
            <strong>Goal:</strong> {goalText(goal)}
          </p>
          {verdict ? (
            <p className="text-sm font-semibold" style={{ color: verdict.won ? "var(--good)" : "var(--bad)" }}>
              {verdict.text}
              {verdict.won && verdict.stars > 0 && goal.kind !== "convert" && goal.kind !== "hold" && (
                <span className="ml-1" aria-label={`${verdict.stars} stars`}>
                  {"⭐".repeat(verdict.stars)}
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm font-semibold">
              {message ?? (status === "thinking" ? "Stockfish is thinking…" : myMoves === 0 ? "Your move." : "Your move. Keep going!")}
            </p>
          )}
          {tip && <p className="text-sm text-[var(--muted)]">💡 {tip}</p>}
          <div className="flex flex-wrap gap-2">
            <button className={verdict ? "btn-primary" : "btn-secondary"} onClick={restart} disabled={status === "thinking"}>
              {verdict ? "Try again" : "Restart"}
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
