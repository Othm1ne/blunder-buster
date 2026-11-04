import type { MascotMood } from "@/components/Mascot";
import type { GameDoc } from "./analysis";
import type { GameReview } from "./classify";
import { moveName } from "./describe";

// Sir Blunderbuss reacts to each game you sync: a first impression from the result, then a
// proper verdict once the engine has been through it.

export type Reaction = { mood: MascotMood; title: string; line: string };

/** Same game, same line (so it doesn't change on every render), but different games vary. */
function pick(id: string, lines: string[]): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return lines[h % lines.length];
}

export function reactTo(game: GameDoc, review?: GameReview): Reaction {
  const opp = game.oppName;
  if (!review) {
    if (game.result === "win")
      return { mood: "proud", title: `You beat ${opp}!`, line: "Sir Blunderbuss is checking how clean it was…" };
    if (game.result === "draw") return { mood: "happy", title: `A draw with ${opp}`, line: "Sir Blunderbuss is looking for the moment it could have been a win…" };
    return { mood: "shocked", title: `Lost to ${opp}`, line: "Chin up! Sir Blunderbuss is finding where it went wrong…" };
  }

  const { blunder, mistake } = review.counts;
  const acc = Math.round(review.accuracy);
  const worst = review.moves.filter((m) => m.mine && m.label === "blunder").sort((a, b) => b.winBefore - b.winAfter - (a.winBefore - a.winAfter))[0];
  const clean = blunder === 0 && mistake === 0;

  if (game.result === "win") {
    if (clean)
      return {
        mood: "proud",
        title: `A clean win vs ${opp}!`,
        line: pick(game.id, [
          `Not a single mistake, ${acc}% accuracy. Sir Blunderbuss takes his helmet off to you.`,
          `${acc}% accuracy and zero blunders. That's how it's done!`,
          `Flawless! ${acc}% accuracy. Frame this one.`,
        ]),
      };
    return {
      mood: "happy",
      title: `You beat ${opp}`,
      line: `A win is a win! But ${blunder ? `${blunder} blunder${blunder > 1 ? "s" : ""}` : `${mistake} mistake${mistake > 1 ? "s" : ""}`} slipped through (${acc}% accuracy). Review it before a stronger opponent spots them.`,
    };
  }

  if (review.failedToConvert)
    return {
      mood: "shocked",
      title: game.result === "draw" ? `Only a draw vs ${opp}…` : `It got away vs ${opp}!`,
      line: `You were winning! ${worst ? `${moveName(worst)} let it slip. ` : ""}A new boss is waiting in Boss Fights: go win it this time.`,
    };
  if (game.result === "draw")
    return { mood: "happy", title: `A draw with ${opp}`, line: `${acc}% accuracy. A solid half point.` };
  if (worst)
    return {
      mood: "shocked",
      title: `Lost to ${opp}`,
      line: pick(game.id, [
        `${moveName(worst)} was the turning point. It's a puzzle in your gym now, so it won't happen twice.`,
        `Ouch, ${moveName(worst)}. Review it and Sir Blunderbuss will make sure you never fall for that again.`,
      ]),
    };
  return {
    mood: "happy",
    title: `Lost to ${opp}, but well played`,
    line: `${acc}% accuracy with no blunders. Your opponent was just better today. Hold your head high!`,
  };
}
