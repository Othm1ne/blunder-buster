import type { PieceSymbol } from "chess.js";
import type { MistakeType, MoveLabel, MoveReview } from "./classify";

// Plain-language wording for the review. M5 adds the fun mascot templates and Gemini on top.

export const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

export const LABEL_STYLE: Record<MoveLabel, { name: string; symbol: string; color: string }> = {
  // Mid-tone colors chosen to stay readable on both the light and the dark card background.
  brilliant: { name: "Brilliant", symbol: "!!", color: "#1fa8a0" },
  great: { name: "Great", symbol: "!", color: "#5a8fd8" },
  best: { name: "Best", symbol: "★", color: "#38a14e" },
  book: { name: "Book", symbol: "📖", color: "#a8865c" },
  good: { name: "Good", symbol: "✓", color: "#76a85a" },
  inaccuracy: { name: "Inaccuracy", symbol: "?!", color: "#d29b0f" },
  mistake: { name: "Mistake", symbol: "?", color: "#e47a24" },
  blunder: { name: "Blunder", symbol: "??", color: "#e5484d" },
};

export const MISTAKE_NAMES: Record<MistakeType | "failed_to_convert" | "time_trouble", string> = {
  allowed_mate: "Allowed mate",
  missed_mate: "Missed mate",
  hung_piece: "Hung a piece",
  fork: "Fell for a fork",
  pin: "Got pinned",
  skewer: "Got skewered",
  missed_material: "Missed free material",
  tactic: "Walked into a tactic",
  other: "Bad move",
  failed_to_convert: "Didn't convert a win",
  time_trouble: "Time-trouble blunder",
};

export function moveName(m: Pick<MoveReview, "moveNumber" | "color" | "san">): string {
  return `${m.moveNumber}${m.color === "w" ? "." : "..."} ${m.san}`;
}

export function explain(m: MoveReview): string {
  const d = m.details ?? {};
  const piece = d.piece ? PIECE_NAMES[d.piece] : "piece";
  const by = d.by ? PIECE_NAMES[d.by] : "opponent";
  const best = m.bestSan ? ` Better was ${m.bestSan}.` : "";
  let text: string;
  switch (m.type) {
    case "allowed_mate":
      text = `This lets your opponent force checkmate in ${d.mateIn}${d.threatSan ? `, starting with ${d.threatSan}` : ""}.${
        d.backRank ? " Classic back-rank trap: give your king an escape square!" : ""
      }`;
      break;
    case "missed_mate":
      text = `You had checkmate in ${d.mateIn}! ${d.threatSan ? `${d.threatSan} wins on the spot.` : ""}`;
      return m.timeTrouble ? `${text} (Clock was under 30 seconds.)` : text;
    case "hung_piece":
      text = `Your ${piece} on ${d.square} can be taken by the ${by}${d.threatSan ? ` (${d.threatSan})` : ""}.`;
      break;
    case "fork":
      text = `${d.threatSan ?? "The reply"} lets the ${by} attack ${d.targets?.length ?? 2} of your pieces at once (${d.targets?.join(", ")}).`;
      break;
    case "pin":
      text = `${d.threatSan ?? "The reply"} pins your ${piece} on ${d.square} to your ${d.behind ? PIECE_NAMES[d.behind] : "piece"} behind it, and you lose about ${d.material} points.`;
      break;
    case "skewer":
      text = `${d.threatSan ?? "The reply"} skewers your ${piece}: when it moves away, your ${d.behind ? PIECE_NAMES[d.behind] : "piece"} behind it falls.`;
      break;
    case "missed_material":
      text = `Free material! You could have taken the ${piece} on ${d.square}.`;
      return text + (m.bestSan ? ` ${m.bestSan} was the move.` : "");
    case "tactic":
      text = `This walks into a tactic${d.threatSan ? ` starting with ${d.threatSan}` : ""} and loses about ${d.material} points of material.`;
      break;
    default:
      text = "This move makes your position a lot worse.";
  }
  return `${text}${best}${m.timeTrouble ? " (Clock was under 30 seconds.)" : ""}`;
}
