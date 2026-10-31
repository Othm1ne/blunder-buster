// Shared between the browser (src/lib/coach.ts) and the Cloudflare Pages Function (functions/api/coach.ts).
// Only classified facts are sent, never raw positions, so the AI explains what the engine found
// instead of trying to analyze chess itself (which language models are bad at).

export type CoachMoveFacts = {
  ply: number;
  /** e.g. "14... Nf6" */
  move: string;
  label: string;
  /** Mistake type, e.g. "hung_piece". */
  type?: string;
  piece?: string;
  square?: string;
  by?: string;
  targets?: string[];
  /** The opponent's best reply (for mistakes), in SAN. */
  threat?: string;
  /** The best move you could have played, in SAN. */
  best?: string;
  mateIn?: number;
  /** Material swing in pawns. */
  material?: number;
  /** Brilliant moves: the piece given up. */
  sacrificed?: string;
  clockSeconds?: number;
  timeTrouble?: boolean;
  /** Your winning chances (0-100) before and after the move. */
  winBefore: number;
  winAfter: number;
};

export type CoachRequest = {
  gameId: string;
  player: { color: "white" | "black"; rating: number };
  opponentRating: number;
  result: "win" | "loss" | "draw";
  resultDetail: string;
  opening: string;
  timeControl: string;
  accuracy: number;
  counts: Record<string, number>;
  mistakeTypes: Record<string, number>;
  failedToConvert: boolean;
  moves: CoachMoveFacts[];
};

export type CoachResponse = {
  summary: string;
  tip: string;
  moves: { ply: number; text: string }[];
  model: string;
};
