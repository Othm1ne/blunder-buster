"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard, type Arrow } from "react-chessboard";
import { useAuth } from "@/components/AuthProvider";
import { useAnalysis } from "@/components/AnalysisProvider";
import { Mascot, type MascotMood } from "@/components/Mascot";
import { LoadingCard, ProgressBar } from "@/components/ProgressBar";
import { getGame } from "@/lib/games";
import type { GameAnalysis, GameDoc } from "@/lib/analysis";
import { epd, reviewGame, winChance, type MoveReview } from "@/lib/classify";
import { explain, LABEL_STYLE, MISTAKE_NAMES, moveName, PIECE_NAMES } from "@/lib/describe";
import { getEngine } from "@/lib/engine";
import { useOpeningBook } from "@/lib/openings";
import { EvalBar } from "./EvalBar";
import { EvalGraph } from "./EvalGraph";
import { MoveList } from "./MoveList";

/** A retry counts as solved if it keeps your winning chances within this many points of the best move. */
const RETRY_TOLERANCE = 8;
const RETRY_DEPTH = 12;
const GREEN = "#3fa34d";
const RED = "#e5484d";
const PLAYED = "#4f8fdc";

type Retry = {
  ply: number;
  fen: string;
  tries: number;
  status: "trying" | "checking" | "wrong" | "solved";
  message?: string;
};

const isFlagged = (m: MoveReview) => m.label === "inaccuracy" || m.label === "mistake" || m.label === "blunder";
const isMyMistake = (m: MoveReview) => m.mine && (m.label === "mistake" || m.label === "blunder");

/** Loads a game from Firestore, then shows the review (or offers to analyze it first). */
export function ReviewScreen({ id, initialPly = 0 }: { id: string | null; initialPly?: number }) {
  const { user, loading } = useAuth();
  const { results, enqueue, current } = useAnalysis();
  const [game, setGame] = useState<GameDoc | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    getGame(user.uid, id)
      .then((g) => !cancelled && setGame(g))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [user, id]);

  if (loading) return <LoadingCard />;
  if (!user) return <Message mood="shocked" text="Sign in to review your games." />;
  if (!id) return <Message mood="shocked" text="No game selected." />;
  if (error) return <Message mood="shocked" text={error} />;
  if (game === undefined) return <LoadingCard label="Loading the game…" />;
  if (game === null) return <Message mood="shocked" text="Game not found." />;

  const analysis = game.analysis ?? results.get(game.id);
  if (!analysis) {
    const running = current?.id === game.id;
    return (
      <div className="card flex flex-wrap items-center gap-4">
        <Mascot mood="happy" size={64} />
        <div className="min-w-48 flex-1">
          <p className="mb-2">This game hasn&apos;t been analyzed yet.</p>
          {running ? (
            <ProgressBar percent={(current.done / current.total) * 100} label="Analyzing…" />
          ) : (
            <button className="btn-primary" onClick={() => enqueue([game], { first: true })}>
              Analyze it now (~6 s)
            </button>
          )}
        </div>
      </div>
    );
  }
  return <ReviewView game={game} analysis={analysis} initialPly={initialPly} />;
}

/** The review itself. Pure UI: also used by the dev preview page with a sample game. */
export function ReviewView({ game, analysis, initialPly = 0 }: { game: GameDoc; analysis: GameAnalysis; initialPly?: number }) {
  const [ply, setPly] = useState(initialPly);
  const [flipped, setFlipped] = useState(false);
  const [showBest, setShowBest] = useState(false);
  const [retry, setRetry] = useState<Retry | null>(null);

  const book = useOpeningBook();
  const review = useMemo(
    () => reviewGame(game.moves, analysis.evals, game.myColor, game.result, game.clocks, book),
    [game, analysis, book],
  );
  const total = review.moves.length;

  const goTo = useCallback(
    (p: number) => {
      setPly(Math.max(0, Math.min(total, p)));
      setShowBest(false);
      setRetry(null);
    },
    [total],
  );

  const nextMistake = useCallback(() => {
    const list = review.moves.filter(isMyMistake);
    const next = list.find((m) => m.ply > ply) ?? list[0];
    if (next) goTo(next.ply);
  }, [review, ply, goTo]);

  // Keyboard: ← → to step, Home/End to jump, N for next mistake.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (retry || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") goTo(ply - 1);
      else if (e.key === "ArrowRight") goTo(ply + 1);
      else if (e.key === "Home") goTo(0);
      else if (e.key === "End") goTo(total);
      else if (e.key.toLowerCase() === "n") nextMistake();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ply, total, retry, goTo, nextMistake]);

  const move = ply > 0 ? review.moves[ply - 1] : null;
  const myColor = game.myColor;
  const orientation = flipped ? (myColor === "white" ? "black" : "white") : myColor;

  // What the board shows.
  let position = move ? move.fenAfter : review.moves[0]?.fenBefore ?? new Chess().fen();
  const arrows: Arrow[] = [];
  const squareStyles: Record<string, React.CSSProperties> = {};
  const highlight = (from: string, to: string, color: string) => {
    squareStyles[from] = { background: `${color}55` };
    squareStyles[to] = { background: `${color}88` };
  };

  if (retry) {
    position = retry.fen;
  } else if (move && showBest) {
    position = move.fenBefore;
    arrows.push({ startSquare: move.uci.slice(0, 2), endSquare: move.uci.slice(2, 4), color: PLAYED });
    if (move.bestUci) arrows.push({ startSquare: move.bestUci.slice(0, 2), endSquare: move.bestUci.slice(2, 4), color: GREEN });
  } else if (move) {
    highlight(move.uci.slice(0, 2), move.uci.slice(2, 4), LABEL_STYLE[move.label].color);
    const threat = analysis.evals[ply]?.best;
    if (isMyMistake(move) && threat) arrows.push({ startSquare: threat.slice(0, 2), endSquare: threat.slice(2, 4), color: RED });
  }

  function startRetry(m: MoveReview) {
    setShowBest(false);
    setRetry({ ply: m.ply, fen: m.fenBefore, tries: 0, status: "trying" });
  }

  function onRetryDrop(from: string, to: string | null): boolean {
    if (!retry || !to || retry.status === "checking" || retry.status === "solved") return false;
    const m = review.moves[retry.ply - 1];
    const chess = new Chess(m.fenBefore);
    let played;
    try {
      played = chess.move({ from: from as Square, to: to as Square, promotion: "q" });
    } catch {
      return false;
    }
    const fen = chess.fen();
    if (played.lan === m.bestUci) {
      setRetry({ ...retry, fen, status: "solved", message: `Yes! ${played.san} is the best move.` });
      return true;
    }
    setRetry({ ...retry, fen, status: "checking", message: "Checking…" });
    getEngine()
      .evaluate(fen, RETRY_DEPTH, 800)
      .then((e) => {
        const win = m.color === "w" ? winChance(e.cp) : 100 - winChance(e.cp);
        if (m.winBefore - win <= RETRY_TOLERANCE) {
          setRetry((r) => r && { ...r, status: "solved", message: `${played.san} works too! (Engine's top choice: ${m.bestSan}.)` });
          return;
        }
        const tries = retry.tries + 1;
        const best = m.bestUci ? new Chess(m.fenBefore).get(m.bestUci.slice(0, 2) as Square) : undefined;
        const hint =
          tries >= 2 && best && m.bestUci ? ` Hint: move your ${PIECE_NAMES[best.type]} on ${m.bestUci.slice(0, 2)}.` : "";
        setRetry((r) => r && { ...r, tries, status: "wrong", message: `${played.san} isn't it. Try again!${hint}` });
        setTimeout(() => setRetry((r) => r && r.status === "wrong" ? { ...r, fen: m.fenBefore, status: "trying" } : r), 900);
      });
    return true;
  }

  const myTurnChar = myColor === "white" ? "w" : "b";
  const counts = review.counts;

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/games" className="text-sm underline">
          ← Games
        </Link>
        <h1 className="font-display text-xl">
          vs {game.oppName} <span className="text-[var(--muted)] text-base">({game.oppRating})</span>
        </h1>
        <span className="text-sm text-[var(--muted)]">
          {game.result === "win" ? "You won" : game.result === "loss" ? "You lost" : "Draw"} · {game.resultDetail} · {review.opening ?? game.opening}
        </span>
        <span className="ml-auto flex flex-wrap gap-2 text-sm font-semibold">
          <span>Accuracy {Math.round(review.accuracy)}%</span>
          {(["brilliant", "great", "blunder", "mistake", "inaccuracy"] as const)
            .filter((l) => counts[l] > 0 || l === "blunder" || l === "mistake")
            .map((l) => (
            <span key={l} style={{ color: LABEL_STYLE[l].color }}>
              {counts[l]} {LABEL_STYLE[l].symbol}
            </span>
          ))}
        </span>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <EvalBar value={analysis.evals[retry ? retry.ply - 1 : showBest && move ? ply - 1 : ply]} orientation={orientation} />
            <div className="min-w-0 flex-1">
              <Chessboard
                options={{
                  id: "review",
                  position,
                  boardOrientation: orientation,
                  arrows,
                  squareStyles,
                  allowDragging: !!retry,
                  allowDrawingArrows: true,
                  canDragPiece: ({ piece }) => !!retry && piece.pieceType[0] === myTurnChar,
                  onPieceDrop: ({ sourceSquare, targetSquare }) => onRetryDrop(sourceSquare, targetSquare),
                  darkSquareStyle: { backgroundColor: "#b58863" },
                  lightSquareStyle: { backgroundColor: "#f0d9b5" },
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary" onClick={() => goTo(0)} aria-label="First move">
              ⏮
            </button>
            <button className="btn-secondary" onClick={() => goTo(ply - 1)} aria-label="Previous move">
              ◀
            </button>
            <button className="btn-secondary" onClick={() => goTo(ply + 1)} aria-label="Next move">
              ▶
            </button>
            <button className="btn-secondary" onClick={() => goTo(total)} aria-label="Last move">
              ⏭
            </button>
            <button className="btn-primary" onClick={nextMistake} disabled={counts.mistake + counts.blunder === 0}>
              Next mistake (N)
            </button>
            <button className="btn-secondary ml-auto" onClick={() => setFlipped(!flipped)}>
              Flip
            </button>
          </div>
          <EvalGraph evals={analysis.evals} moves={review.moves} ply={ply} onSelect={goTo} />
        </div>

        <div className="flex flex-col gap-3">
          <MovePanel
            bookName={move && move.label === "book" ? book?.[epd(move.fenAfter)] : undefined}
            move={move}
            retry={retry}
            showBest={showBest}
            onToggleBest={() => setShowBest(!showBest)}
            onRetry={() => move && startRetry(move)}
            onExitRetry={() => setRetry(null)}
          />
          <MoveList moves={review.moves} ply={ply} onSelect={goTo} />
          {review.failedToConvert && (
            <p className="text-sm text-[var(--muted)]">
              You reached {Math.round(review.peakWin)}% winning chances in this game but didn&apos;t win it.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MovePanel({
  bookName,
  move,
  retry,
  showBest,
  onToggleBest,
  onRetry,
  onExitRetry,
}: {
  bookName?: string;
  move: MoveReview | null;
  retry: Retry | null;
  showBest: boolean;
  onToggleBest: () => void;
  onRetry: () => void;
  onExitRetry: () => void;
}) {
  if (retry) {
    const mood: MascotMood = retry.status === "solved" ? "proud" : retry.status === "wrong" ? "shocked" : "happy";
    return (
      <div className="card flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Mascot mood={mood} size={48} />
          <p className="font-display text-lg">
            {retry.status === "solved" ? "Nailed it!" : "Your turn: find a better move"}
          </p>
        </div>
        <p className="text-sm">{retry.message ?? "Drag a piece on the board."}</p>
        <button className="btn-secondary self-start" onClick={onExitRetry}>
          {retry.status === "solved" ? "Back to the game" : "Give up"}
        </button>
      </div>
    );
  }

  if (!move) {
    return (
      <div className="card flex items-center gap-3">
        <Mascot size={48} />
        <p className="text-sm">Start position. Press → or click a move, or jump straight to your next mistake.</p>
      </div>
    );
  }

  const style = LABEL_STYLE[move.label];
  const canRetry = move.mine && isFlagged(move);
  const hasBetter = !!move.bestUci && !["best", "great", "brilliant"].includes(move.label);
  const mood: MascotMood = move.label === "blunder" ? "shocked" : move.label === "best" ? "proud" : "happy";
  let text: string;
  if (move.label === "book") text = `Book move: known opening theory${bookName ? ` (${bookName})` : ""}.`;
  else if (move.label === "brilliant")
    text = move.mine
      ? `Brilliant! You gave up your ${PIECE_NAMES[move.sacrificed ?? "p"]} and it works. That's real chess courage.`
      : `Brilliant move by your opponent: a ${PIECE_NAMES[move.sacrificed ?? "p"]} sacrifice that works.`;
  else if (move.label === "great")
    text = move.mine
      ? "Great move! The only good move here: anything else was much worse."
      : `Great find by your opponent: the only good move in this position.`;
  else if (move.mine && move.type) text = explain(move);
  else if (move.mine && move.label === "inaccuracy") text = `Not the most precise.${move.bestSan ? ` ${move.bestSan} was stronger.` : ""}`;
  else if (move.mine) text = move.label === "best" ? "Best move. Great job!" : `Good move.${move.bestSan ? ` ${move.bestSan} was a little better.` : ""}`;
  else if (isFlagged(move)) text = `Your opponent slipped here.${move.bestSan ? ` They should have played ${move.bestSan}.` : ""} Can you punish it?`;
  else text = move.label === "best" ? "Your opponent found the best move." : "Your opponent's move.";

  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Mascot mood={move.mine ? mood : "happy"} size={48} />
        <div>
          <p className="font-display text-lg">
            {moveName(move)}
            <span style={{ color: style.color }}> {style.symbol}</span>
          </p>
          <p className="text-sm font-semibold" style={{ color: style.color }}>
            {move.mine && move.type ? MISTAKE_NAMES[move.type] : style.name}
            {move.timeTrouble && " · time trouble"}
          </p>
        </div>
        {move.clock !== undefined && (
          <span className="ml-auto text-xs text-[var(--muted)] tabular-nums">
            ⏱ {Math.floor(move.clock / 60)}:{String(Math.floor(move.clock % 60)).padStart(2, "0")}
          </span>
        )}
      </div>
      <p className="text-sm">{text}</p>
      {(canRetry || hasBetter) && (
        <div className="flex flex-wrap gap-2">
          {canRetry && (
            <button className="btn-primary" onClick={onRetry}>
              Retry this move
            </button>
          )}
          {hasBetter && (
            <button className="btn-secondary" onClick={onToggleBest}>
              {showBest ? "Hide best move" : "Show best move"}
            </button>
          )}
        </div>
      )}
      {showBest && move.bestSan && (
        <p className="text-xs text-[var(--muted)]">
          <span style={{ color: GREEN }}>Green arrow</span>: best move ({move.bestSan}).{" "}
          <span style={{ color: PLAYED }}>Blue arrow</span>: what {move.mine ? "you" : "your opponent"} played.
        </p>
      )}
      {!showBest && isMyMistake(move) && (
        <p className="text-xs text-[var(--muted)]">Red arrow: your opponent&apos;s best reply.</p>
      )}
    </div>
  );
}

function Message({ text, mood }: { text: string; mood: MascotMood }) {
  return (
    <div className="card flex items-center gap-4">
      <Mascot mood={mood} size={64} />
      <p>{text}</p>
    </div>
  );
}
