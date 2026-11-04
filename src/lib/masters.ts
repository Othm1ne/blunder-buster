import type { Color } from "chess.js";

// Guess the Move: famous games from the 1800s and early 1900s (long in the public domain).
// You play the winner's side and guess each of their moves; Stockfish scores guesses that differ.

export type MasterGame = {
  id: string;
  title: string;
  white: string;
  black: string;
  where: string;
  year: number;
  /** The side you guess for (the winner). */
  side: Color;
  story: string;
  /** Moves in SAN, from the start position. */
  moves: string[];
};

const san = (pgn: string) => pgn.replace(/\d+\.(\.\.)?/g, " ").split(/\s+/).filter(Boolean);

export const MASTER_GAMES: MasterGame[] = [
  {
    id: "opera",
    title: "The Opera Game",
    white: "Paul Morphy",
    black: "Duke of Brunswick & Count Isouard",
    where: "Paris opera house",
    year: 1858,
    side: "w",
    story: "Morphy played this during a performance, against two noblemen consulting together. Fast development, open lines, and a finish everyone should know.",
    moves: san(
      "1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8#",
    ),
  },
  {
    id: "reti",
    title: "Réti's queen sacrifice",
    white: "Richard Réti",
    black: "Savielly Tartakower",
    where: "Vienna",
    year: 1910,
    side: "w",
    story: "Black grabs a pawn and leaves his king in the centre. Réti punishes it with one of the most famous queen sacrifices ever.",
    moves: san("1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Nf6 5.Qd3 e5 6.dxe5 Qa5+ 7.Bd2 Qxe5 8.O-O-O Nxe4 9.Qd8+ Kxd8 10.Bg5+ Kc7 11.Bd8#"),
  },
  {
    id: "lasker-thomas",
    title: "The great king hunt",
    white: "Edward Lasker",
    black: "George Thomas",
    where: "London",
    year: 1912,
    side: "w",
    story: "A queen sacrifice on h7 drags Black's king all the way across the board to g1, where it gets mated.",
    moves: san(
      "1.d4 e6 2.Nf3 f5 3.Nc3 Nf6 4.Bg5 Be7 5.Bxf6 Bxf6 6.e4 fxe4 7.Nxe4 b6 8.Ne5 O-O 9.Bd3 Bb7 10.Qh5 Qe7 11.Qxh7+ Kxh7 12.Nxf6+ Kh6 13.Neg4+ Kg5 14.h4+ Kf4 15.g3+ Kf3 16.Be2+ Kg2 17.Rh2+ Kg1 18.Kd2#",
    ),
  },
  {
    id: "evergreen",
    title: "The Evergreen Game",
    white: "Adolf Anderssen",
    black: "Jean Dufresne",
    where: "Berlin",
    year: 1852,
    side: "w",
    story: "An Evans Gambit: White gives a pawn for fast development, then breaks through with a stunning combination.",
    moves: san(
      "1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.b4 Bxb4 5.c3 Ba5 6.d4 exd4 7.O-O d3 8.Qb3 Qf6 9.e5 Qg6 10.Re1 Nge7 11.Ba3 b5 12.Qxb5 Rb8 13.Qa4 Bb6 14.Nbd2 Bb7 15.Ne4 Qf5 16.Bxd3 Qh5 17.Nf6+ gxf6 18.exf6 Rg8 19.Rad1 Qxf3 20.Rxe7+ Nxe7 21.Qxd7+ Kxd7 22.Bf5+ Ke8 23.Bd7+ Kf8 24.Bxe7#",
    ),
  },
  {
    id: "immortal",
    title: "The Immortal Game",
    white: "Adolf Anderssen",
    black: "Lionel Kieseritzky",
    where: "London",
    year: 1851,
    side: "w",
    story: "White gives up a bishop, both rooks and finally the queen, and mates with his three remaining minor pieces.",
    moves: san(
      "1.e4 e5 2.f4 exf4 3.Bc4 Qh4+ 4.Kf1 b5 5.Bxb5 Nf6 6.Nf3 Qh6 7.d3 Nh5 8.Nh4 Qg5 9.Nf5 c6 10.g4 Nf6 11.Rg1 cxb5 12.h4 Qg6 13.h5 Qg5 14.Qf3 Ng8 15.Bxf4 Qf6 16.Nc3 Bc5 17.Nd5 Qxb2 18.Bd6 Bxg1 19.e5 Qxa1+ 20.Ke2 Na6 21.Nxg7+ Kd8 22.Qf6+ Nxf6 23.Be7#",
    ),
  },
  {
    id: "rubinstein",
    title: "Rubinstein's Immortal",
    white: "Georg Rotlewi",
    black: "Akiba Rubinstein",
    where: "Łódź",
    year: 1907,
    side: "b",
    story: "You play Black. Rubinstein aims both bishops at White's king, then gives up his queen and a rook to break through.",
    moves: san(
      "1.d4 d5 2.Nf3 e6 3.e3 c5 4.c4 Nc6 5.Nc3 Nf6 6.dxc5 Bxc5 7.a3 a6 8.b4 Bd6 9.Bb2 O-O 10.Qd2 Qe7 11.Bd3 dxc4 12.Bxc4 b5 13.Bd3 Rd8 14.Qe2 Bb7 15.O-O Ne5 16.Nxe5 Bxe5 17.f4 Bc7 18.e4 Rac8 19.e5 Bb6+ 20.Kh1 Ng4 21.Be4 Qh4 22.g3 Rxc3 23.gxh4 Rd2 24.Qxd2 Bxe4+ 25.Qg2 Rh3",
    ),
  },
];

/** The first moves of each side are played for you (the opening is not the point here). */
export const SKIP_MOVES = 4;

/** Points for a guess: the master's move is 5; another move is scored by how much it gives away. */
export function guessPoints(exact: boolean, winMaster: number, winGuess: number): number {
  if (exact) return 5;
  const drop = winMaster - winGuess;
  return drop <= 2 ? 4 : drop <= 6 ? 2 : drop <= 12 ? 1 : 0;
}
