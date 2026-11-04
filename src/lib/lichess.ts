import { Chess } from "chess.js";
import { IMPORTED_TIME_CLASSES, parseClocks, type GameResult, type StoredGame, type TimeClass } from "./chesscom";

// Lichess public API (no key, CORS open). Docs: https://lichess.org/api#tag/Games/operation/apiGamesUser
const API = "https://lichess.org/api";

/** The first import can't be endless for someone who plays 50 blitz games a day. */
export const LICHESS_MAX_GAMES = 500;

type LichessPlayer = { user?: { name: string; id: string }; rating?: number; aiLevel?: number };

export type LichessGame = {
  id: string;
  rated: boolean;
  variant: string;
  speed: string;
  createdAt: number;
  lastMoveAt: number;
  status: string;
  winner?: "white" | "black";
  players: { white: LichessPlayer; black: LichessPlayer };
  opening?: { eco: string; name: string };
  clock?: { initial: number; increment: number };
  pgn?: string;
};

/** Lichess statuses → the Chess.com words the app already shows ("checkmated", "resigned", …), from the loser's side. */
const LOSS_DETAIL: Record<string, string> = {
  mate: "checkmated",
  resign: "resigned",
  outoftime: "timeout",
  timeout: "abandoned",
  variantEnd: "lose",
};
const DRAW_DETAIL: Record<string, string> = { draw: "agreed", stalemate: "stalemate", outoftime: "timevsinsufficient" };
/** Games that never really happened. */
const SKIPPED = new Set(["aborted", "noStart", "cheat", "unknownFinish"]);

export async function lichessPlayerExists(username: string): Promise<boolean> {
  const res = await fetch(`${API}/user/${encodeURIComponent(username)}`);
  if (!res.ok) return false;
  const data: { disabled?: boolean } = await res.json();
  return !data.disabled;
}

/**
 * Your rapid and blitz games that ended after `since` (ms), newest first, read as the NDJSON stream
 * arrives so the progress bar can move.
 */
export async function fetchLichessGames(username: string, since: number, onGame: (count: number) => void): Promise<LichessGame[]> {
  const params = new URLSearchParams({
    // `since` filters on the start time: go back a bit and drop the ones we already have below.
    since: String(Math.max(0, since - 6 * 60 * 60 * 1000)),
    perfType: IMPORTED_TIME_CLASSES.join(","),
    max: String(LICHESS_MAX_GAMES),
    pgnInJson: "true",
    clocks: "true",
    opening: "true",
    evals: "false",
  });
  const res = await fetch(`${API}/games/user/${encodeURIComponent(username)}?${params}`, {
    headers: { Accept: "application/x-ndjson" },
  });
  if (res.status === 429) throw new Error("Lichess asks us to slow down. Try again in a minute.");
  if (!res.ok) throw new Error(`Lichess said ${res.status} for "${username}"`);

  const games: LichessGame[] = [];
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += value ?? "";
    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      const game = JSON.parse(line) as LichessGame;
      if (game.lastMoveAt > since) games.push(game);
    }
    onGame(games.length);
    if (done) return games;
  }
}

/** Converts a Lichess game to our shape, or null if we don't import it (variants, bots-only, aborted…). */
export function lichessToStored(game: LichessGame, username: string): StoredGame | null {
  if (game.variant !== "standard" || !game.pgn || SKIPPED.has(game.status)) return null;
  if (!IMPORTED_TIME_CLASSES.includes(game.speed as TimeClass)) return null;

  const me = username.toLowerCase();
  const myColor = game.players.white.user?.id === me ? "white" : game.players.black.user?.id === me ? "black" : null;
  if (!myColor) return null;
  const mine = game.players[myColor];
  const opp = game.players[myColor === "white" ? "black" : "white"];

  const chess = new Chess();
  try {
    chess.loadPgn(game.pgn);
  } catch {
    return null;
  }
  if (chess.history().length < 2) return null;

  const result: GameResult = !game.winner ? "draw" : game.winner === myColor ? "win" : "loss";
  const detail = result === "draw" ? (DRAW_DETAIL[game.status] ?? "agreed") : (LOSS_DETAIL[game.status] ?? game.status);
  const clock = game.clock;

  return {
    id: `li_${game.id}`,
    url: `https://lichess.org/${game.id}${myColor === "black" ? "/black" : ""}`,
    endTime: game.lastMoveAt,
    timeClass: game.speed as TimeClass,
    timeControl: clock ? (clock.increment ? `${clock.initial}+${clock.increment}` : String(clock.initial)) : "-",
    rated: game.rated,
    myColor,
    myRating: mine.rating ?? 0,
    oppName: opp.user?.name ?? (opp.aiLevel ? `Stockfish level ${opp.aiLevel}` : "Anonymous"),
    oppRating: opp.rating ?? 0,
    result,
    resultDetail: detail,
    opening: game.opening?.name ?? "Unknown opening",
    moves: chess.history(),
    clocks: parseClocks(game.pgn),
    site: "lichess",
  };
}
