import type { MistakeType } from "./classify";
import { phaseOf, type Phase, type ReviewedGame } from "./profile";

// Skill levels per area, for the radar chart. Each area gets a 0-100 score from your analyzed
// games, and a level from 1 to 10. Scores need a few games to mean anything (null until then).

export type SkillId = "opening" | "middlegame" | "endgame" | "safety" | "tactics" | "defence" | "conversion";

export type Skill = {
  id: SkillId;
  name: string;
  /** 0-100, null when there's not enough data. */
  score: number | null;
  level: number | null;
  /** What the score is built from, in plain words. */
  detail: string;
};

export const SKILL_INFO: Record<SkillId, { name: string; tip: string }> = {
  opening: { name: "Opening", tip: "Develop knights and bishops, castle early, and don't move the same piece twice." },
  middlegame: { name: "Middlegame", tip: "Before each move, check what their last move attacks." },
  endgame: { name: "Endgame", tip: "Train the textbook endgames in the Endgame Arena." },
  safety: { name: "Piece safety", tip: "Count attackers and defenders before you leave a piece." },
  tactics: { name: "Tactics", tip: "Look at every check and capture: it might win something." },
  defence: { name: "Defence", tip: "Ask what your opponent wants to do next, every move." },
  conversion: { name: "Converting", tip: "When you're winning, trade pieces and keep it simple. Try the Boss Fights." },
};

export const LEVEL_NAMES = ["Pawn", "Pawn", "Knight", "Knight", "Bishop", "Bishop", "Rook", "Rook", "Queen", "King"];

/** Accuracy scores need this many of your moves in that phase. */
const MIN_MOVES = 20;
const MIN_GAMES = 3;
/** Clearly winning (winning chances), like failed-to-convert. */
const WINNING = 85;

const clamp = (n: number) => Math.max(0, Math.min(100, n));
export const levelOf = (score: number) => Math.max(1, Math.ceil(score / 10));

/** Per-move accuracy of 50% is a beginner's floor, 100% is perfect. */
const accuracyScore = (acc: number) => clamp((acc - 50) * 2);
/** Mistakes per game → score: 0 per game is 100, then it falls off (k = how fast). */
const rateScore = (perGame: number, k: number) => clamp(100 * Math.exp(-k * perGame));

const TYPES: Record<"safety" | "tactics" | "defence", MistakeType[]> = {
  safety: ["hung_piece"],
  tactics: ["missed_material", "missed_mate"],
  defence: ["allowed_mate", "fork", "pin", "skewer", "tactic"],
};
const K = { safety: 0.7, tactics: 0.8, defence: 0.6 };

export function skillsOf(reviewed: ReviewedGame[]): Skill[] {
  const phase: Record<Phase, { sum: number; n: number }> = {
    opening: { sum: 0, n: 0 },
    middlegame: { sum: 0, n: 0 },
    endgame: { sum: 0, n: 0 },
  };
  const errors = new Map<MistakeType, number>();
  let winning = 0;
  let converted = 0;

  for (const { game, review } of reviewed) {
    for (const m of review.moves) {
      if (!m.mine || m.label === "book") continue;
      const p = phase[phaseOf(m)];
      p.sum += m.accuracy;
      p.n++;
      if ((m.label === "mistake" || m.label === "blunder") && m.type) errors.set(m.type, (errors.get(m.type) ?? 0) + 1);
    }
    if (review.peakWin >= WINNING) {
      winning++;
      if (game.result === "win") converted++;
    }
  }

  const games = reviewed.length;
  const skill = (id: SkillId, score: number | null, detail: string): Skill => ({
    id,
    name: SKILL_INFO[id].name,
    score: score === null ? null : Math.round(score),
    level: score === null ? null : levelOf(score),
    detail,
  });
  const byPhase = (id: Phase) => {
    const { sum, n } = phase[id];
    return n >= MIN_MOVES
      ? skill(id, accuracyScore(sum / n), `${Math.round(sum / n)}% move accuracy`)
      : skill(id, null, `needs ${MIN_MOVES} ${id} moves`);
  };
  const byErrors = (id: "safety" | "tactics" | "defence", what: string) => {
    if (games < MIN_GAMES) return skill(id, null, `needs ${MIN_GAMES} games`);
    const perGame = TYPES[id].reduce((s, t) => s + (errors.get(t) ?? 0), 0) / games;
    return skill(id, rateScore(perGame, K[id]), `${perGame.toFixed(1)} ${what} per game`);
  };

  return [
    byPhase("opening"),
    byPhase("middlegame"),
    byPhase("endgame"),
    byErrors("safety", "hung pieces"),
    byErrors("tactics", "missed wins"),
    byErrors("defence", "tricks allowed"),
    winning >= MIN_GAMES
      ? skill("conversion", (converted / winning) * 100, `won ${converted} of ${winning} winning games`)
      : skill("conversion", null, `needs ${MIN_GAMES} winning positions`),
  ];
}
