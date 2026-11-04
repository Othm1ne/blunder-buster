"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Mascot, type MascotMood } from "@/components/Mascot";
import { winChance } from "@/lib/classify";
import { Engine } from "@/lib/engine";
import { guessPoints, SKIP_MOVES, type MasterGame } from "@/lib/masters";

const CHECK_DEPTH = 12;
const CHECK_MS = 600;
const REPLY_DELAY_MS = 600;

type Status = "guess" | "checking" | "reveal" | "done";
type Result = { masterSan: string; guessSan: string; points: number };

const VERDICT: Record<number, string> = {
  5: "Exactly what the master played!",
  4: "Not the master's move, but just as good.",
  2: "Playable, but the master's move was better.",
  1: "That gives away quite a bit.",
  0: "Ouch, that would have been a big mistake.",
};

/** Replays a master game: you guess every move of the winner's side and collect points. */
export function GuessBoard({ game, onFinish }: { game: MasterGame; onFinish: (percent: number) => void }) {
  // FEN before each ply, plus the final position.
  const fens = useMemo(() => {
    const chess = new Chess();
    const list = [chess.fen()];
    for (const san of game.moves) {
      chess.move(san);
      list.push(chess.fen());
    }
    return list;
  }, [game]);
  const firstGuess = SKIP_MOVES * 2 + (game.side === "w" ? 0 : 1);

  const [ply, setPly] = useState(firstGuess);
  const [shown, setShown] = useState(fens[firstGuess]);
  const [status, setStatus] = useState<Status>("guess");
  const [results, setResults] = useState<Result[]>([]);
  const [highlight, setHighlight] = useState<{ guess?: [string, string]; master?: [string, string] }>({});
  const engine = useRef<Engine | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const e = new Engine();
    engine.current = e;
    const pending = timers.current;
    return () => {
      e.terminate();
      pending.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const pov = (cp: number) => (game.side === "w" ? winChance(cp) : 100 - winChance(cp));
  const guesses = game.moves.filter((_, i) => i >= firstGuess && i % 2 === firstGuess % 2).length;
  const score = results.reduce((s, r) => s + r.points, 0);
  const masterName = game.side === "w" ? game.white.split(" ").at(-1) : game.black.split(" ").at(-1);

  function masterMove(at: number) {
    return new Chess(fens[at]).move(game.moves[at]);
  }

  /** After your guess is settled: show the master's move, then the opponent's reply, then your turn. */
  function advance(nextResults: Result[]) {
    const after = ply + 1;
    setShown(fens[after]);
    if (after >= game.moves.length) {
      setStatus("done");
      onFinish(Math.round((nextResults.reduce((s, r) => s + r.points, 0) / (guesses * 5)) * 100));
      return;
    }
    timers.current.push(
      window.setTimeout(() => {
        const reply = masterMove(after);
        setShown(fens[after + 1]);
        setHighlight({ master: [reply.from, reply.to] });
        if (after + 1 >= game.moves.length) {
          setStatus("done");
          onFinish(Math.round((nextResults.reduce((s, r) => s + r.points, 0) / (guesses * 5)) * 100));
        } else {
          setPly(after + 1);
          setStatus("guess");
        }
      }, REPLY_DELAY_MS),
    );
  }

  function onDrop(from: string, to: string | null): boolean {
    if (status !== "guess" || !to || !engine.current) return false;
    const chess = new Chess(fens[ply]);
    let guess;
    try {
      guess = chess.move({ from: from as Square, to: to as Square, promotion: "q" });
    } catch {
      return false;
    }
    const master = masterMove(ply);
    if (guess.lan === master.lan) {
      const next = [...results, { masterSan: master.san, guessSan: guess.san, points: 5 }];
      setResults(next);
      setHighlight({ master: [master.from, master.to] });
      advance(next);
      return true;
    }

    setShown(chess.fen());
    setHighlight({ guess: [guess.from, guess.to] });
    setStatus("checking");
    const e = engine.current;
    Promise.all([e.evaluate(fens[ply + 1], CHECK_DEPTH, CHECK_MS), e.evaluate(chess.fen(), CHECK_DEPTH, CHECK_MS)])
      .then(([m, g]) => {
        const points = guessPoints(false, pov(m.cp), pov(g.cp));
        setResults((r) => [...r, { masterSan: master.san, guessSan: guess.san, points }]);
        setShown(fens[ply + 1]);
        setHighlight({ guess: [guess.from, guess.to], master: [master.from, master.to] });
        setStatus("reveal");
      })
      .catch(() => {
        setResults((r) => [...r, { masterSan: master.san, guessSan: guess.san, points: 0 }]);
        setShown(fens[ply + 1]);
        setStatus("reveal");
      });
    return true;
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  for (const sq of highlight.guess ?? []) squareStyles[sq] = { boxShadow: "inset 0 0 0 4px #4f8fdc" };
  for (const sq of highlight.master ?? []) squareStyles[sq] = { ...squareStyles[sq], background: "#f7bd3599" };

  const last = results.at(-1);
  const moveNo = Math.floor(ply / 2) + 1;
  const mood: MascotMood = status === "done" ? "proud" : last && last.points <= 1 ? "shocked" : "happy";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <Chessboard
          options={{
            id: "guess",
            position: shown,
            boardOrientation: game.side === "w" ? "white" : "black",
            squareStyles,
            allowDragging: status === "guess",
            canDragPiece: ({ piece }) => status === "guess" && piece.pieceType[0] === game.side,
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
              <p className="font-display text-lg">{game.title}</p>
              <p className="text-xs text-[var(--muted)]">
                {game.white} vs {game.black} · {game.where}, {game.year}
              </p>
            </div>
          </div>
          <div className="flex items-baseline justify-between text-sm">
            <span>
              Score <strong className="font-display text-xl tabular-nums">{score}</strong> / {results.length * 5}
            </span>
            <span className="text-[var(--muted)]">
              {results.length}/{guesses} moves
            </span>
          </div>
          {status === "done" ? (
            <p className="text-sm font-semibold text-[var(--good)]">
              Game over! You scored {Math.round((score / (guesses * 5)) * 100)}% of the master&apos;s moves.
            </p>
          ) : status === "guess" ? (
            <p className="text-sm font-semibold">
              {last && last.points === 5 ? "Yes! " : ""}What did {masterName} play on move {moveNo}
              {game.side === "b" ? "..." : "."}?
            </p>
          ) : status === "checking" ? (
            <p className="text-sm font-semibold">Stockfish is judging your guess…</p>
          ) : (
            last && (
              <>
                <p className="text-sm">
                  You chose <strong className="text-[#4f8fdc]">{last.guessSan}</strong>, {masterName} played{" "}
                  <strong>{last.masterSan}</strong>: +{last.points}. {VERDICT[last.points]}
                </p>
                <button className="btn-primary self-start" onClick={() => advance(results)}>
                  Continue
                </button>
              </>
            )
          )}
        </div>
        <p className="card text-sm text-[var(--muted)]">{game.story}</p>
      </div>
    </div>
  );
}
