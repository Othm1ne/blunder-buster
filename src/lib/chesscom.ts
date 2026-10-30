import { Chess } from "chess.js";

// Chess.com published-data API (public, no key). Docs: https://www.chess.com/news/view/published-data-api
const API = "https://api.chess.com/pub/player";

type ChessComPlayer = { username: string; rating: number; result: string };

export type ChessComGame = {
  url: string;
  uuid: string;
  pgn?: string;
  time_control: string;
  time_class: "daily" | "rapid" | "blitz" | "bullet";
  end_time: number;
  rated: boolean;
  rules: string;
  white: ChessComPlayer;
  black: ChessComPlayer;
  accuracies?: { white: number; black: number };
};

export type TimeClass = "rapid" | "blitz";
export type GameResult = "win" | "loss" | "draw";

export type StoredGame = {
  id: string;
  url: string;
  endTime: number; // ms
  timeClass: TimeClass;
  timeControl: string;
  rated: boolean;
  myColor: "white" | "black";
  myRating: number;
  oppName: string;
  oppRating: number;
  result: GameResult;
  resultDetail: string; // chess.com code, e.g. "checkmated", "timeout", "resigned"
  opening: string;
  moves: string[]; // SAN, from the start position
  clocks: number[]; // seconds left after each move (same length as moves when available)
};

const DRAW_CODES = new Set(["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"]);
export const IMPORTED_TIME_CLASSES: TimeClass[] = ["rapid", "blitz"];

export async function playerExists(username: string): Promise<boolean> {
  const res = await fetch(`${API}/${encodeURIComponent(username.toLowerCase())}`);
  return res.ok;
}

/** Monthly archive URLs, oldest first. */
export async function fetchArchiveUrls(username: string): Promise<string[]> {
  const res = await fetch(`${API}/${encodeURIComponent(username.toLowerCase())}/games/archives`);
  if (!res.ok) throw new Error(`Chess.com said ${res.status} for "${username}"`);
  const data: { archives: string[] } = await res.json();
  return data.archives;
}

export async function fetchArchive(url: string): Promise<ChessComGame[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Chess.com said ${res.status} for ${url}`);
  const data: { games: ChessComGame[] } = await res.json();
  return data.games;
}

/** ".../games/2026/10" -> "Oct 2026" */
export function archiveLabel(url: string): string {
  const [year, month] = url.split("/").slice(-2);
  return new Date(Number(year), Number(month) - 1).toLocaleString("en", { month: "short", year: "numeric" });
}

function parseClocks(pgn: string): number[] {
  return [...pgn.matchAll(/\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/g)].map(
    ([, h, m, s]) => Number(h) * 3600 + Number(m) * 60 + Number(s),
  );
}

function openingName(pgn: string): string {
  const ecoUrl = pgn.match(/\[ECOUrl "([^"]+)"\]/)?.[1];
  if (!ecoUrl) return "Unknown opening";
  return decodeURIComponent(ecoUrl.split("/").pop() ?? "").replace(/-/g, " ");
}

/** Converts a chess.com game to our shape, or null if we don't import it (variants, bullet, daily, no PGN). */
export function toStoredGame(game: ChessComGame, username: string): StoredGame | null {
  if (game.rules !== "chess" || !game.pgn) return null;
  if (!IMPORTED_TIME_CLASSES.includes(game.time_class as TimeClass)) return null;

  const me = username.toLowerCase();
  const myColor = game.white.username.toLowerCase() === me ? "white" : "black";
  const mine = game[myColor];
  const opp = game[myColor === "white" ? "black" : "white"];

  const chess = new Chess();
  try {
    chess.loadPgn(game.pgn);
  } catch {
    return null;
  }
  // Only standard starting positions for now.
  if (/\[SetUp "1"\]/.test(game.pgn)) return null;

  return {
    id: game.uuid,
    url: game.url,
    endTime: game.end_time * 1000,
    timeClass: game.time_class as TimeClass,
    timeControl: game.time_control,
    rated: game.rated,
    myColor,
    myRating: mine.rating,
    oppName: opp.username,
    oppRating: opp.rating,
    result: mine.result === "win" ? "win" : DRAW_CODES.has(mine.result) ? "draw" : "loss",
    resultDetail: mine.result === "win" ? opp.result : mine.result,
    opening: openingName(game.pgn),
    moves: chess.history(),
    clocks: parseClocks(game.pgn),
  };
}
