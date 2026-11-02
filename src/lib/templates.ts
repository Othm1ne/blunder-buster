import type { GameReview, MistakeType, MoveReview } from "./classify";
import { MISTAKE_NAMES, PIECE_NAMES } from "./describe";

// Sir Blunderbuss's own words: instant, free and offline. Used until (or instead of) the Gemini coach.
// {placeholders} are filled from the move's facts; a line whose placeholders can't be filled is skipped.

const LINES: Record<MistakeType | "inaccuracy" | "brilliant" | "great", string[]> = {
  hung_piece: [
    "Whoa! Your {piece} on {square} was left without guards, and {threat} grabs it. Before every move, ask: is everything safe?",
    "Free snack alert! {threat} wins your {piece}. Sir Blunderbuss checks every piece before he moves. Try it!",
    "Your {piece} on {square} was hanging out alone. {best} kept your army safe.",
    "Oops, that {piece} on {square} was a gift. Next time, count attackers and defenders before you let go of the piece.",
  ],
  allowed_mate: [
    "Uh-oh! This opens the door for checkmate in {mateIn}, starting with {threat}. Always ask: what checks does my opponent have?",
    "Danger! Your king is in trouble: {threat} leads to mate in {mateIn}. {best} kept him safe.",
    "That move lets your opponent force mate in {mateIn}. Before moving, look at every check they could give.",
  ],
  missed_mate: [
    "You had CHECKMATE in {mateIn}! {best} ends the game. Look at all your checks first, every single move.",
    "So close to glory! {best} was checkmate in {mateIn}. Checks, captures, threats: in that order!",
    "Sir Blunderbuss spotted a mate in {mateIn} for you: {best}. Always scan for checks first!",
  ],
  fork: [
    "{threat} jumps in and attacks {targets} at once. Watch out for knight jumps near your big pieces!",
    "Fork! {threat} hits two of your pieces at the same time, and you can only save one. Keep your king and queen off the same knight jump.",
    "Your opponent's {by} forks {targets} with {threat}. Before moving, check where their pieces can jump next.",
  ],
  pin: [
    "{threat} pins your {piece} to your {behind}. A pinned piece can't run, so it gets lost. Keep valuable pieces off the same line!",
    "Pinned! After {threat}, your {piece} is stuck in front of your {behind}. {best} kept your pieces off that line.",
    "Watch the long lines: {threat} nails your {piece} to your {behind}, and you lose about {material} points.",
  ],
  skewer: [
    "Skewer! {threat} hits your {piece}, and when it moves away your {behind} behind it falls. Don't line up your big pieces!",
    "{threat} attacks your {piece} with your {behind} hiding behind it. One has to go. {best} avoided the trap.",
    "Your {piece} and {behind} were lined up, and {threat} skewers them. Check the lines of their bishops, rooks and queen!",
  ],
  missed_material: [
    "Free {piece} on {square}! Your opponent left it hanging. {best} grabs it. After each of their moves, ask: did they leave something unprotected?",
    "Treasure missed! {best} wins a {piece} for free. Always look for loose pieces first.",
    "Your opponent's {piece} on {square} was up for grabs. {best} takes it. Captures are worth a look every move!",
  ],
  tactic: [
    "This walks into a trick starting with {threat}, and you lose about {material} points of material. {best} was safer.",
    "Sneaky! {threat} starts a combination that wins material. Ask yourself: what is my opponent threatening?",
    "That move gives your opponent a tactic ({threat}). Slow down in sharp positions and check their forcing moves.",
  ],
  other: [
    "This makes your position a lot harder. {best} was the better plan.",
    "Not the best idea here: {best} kept your position healthy.",
    "Your winning chances drop a lot with this one. {best} was stronger.",
  ],
  inaccuracy: [
    "Not terrible, but {best} was more precise.",
    "A small slip. {best} was a bit stronger here.",
    "Okay move, but Sir Blunderbuss prefers {best}.",
  ],
  brilliant: [
    "BRILLIANT! You gave up your {sacrificed} and it works. Sir Blunderbuss takes off his helmet for you!",
    "What a sacrifice! Giving away your {sacrificed} was the best move on the board. Chess courage!",
    "Brilliant! Your {sacrificed} is offered as bait, and the engine loves it.",
  ],
  great: [
    "Great move! The only good move in the position, and you found it.",
    "Only-move found! Anything else was much worse here. Well spotted!",
    "Great! You found the one move that keeps things going your way.",
  ],
};

export const TIPS: Partial<Record<MistakeType | "time_trouble" | "failed_to_convert", string>> = {
  hung_piece: "Before each move, check every piece: is it defended, and can it be taken?",
  allowed_mate: "Before each move, look at all the checks your opponent could give.",
  missed_mate: "Start every move by looking at all your checks. One of them might be mate!",
  fork: "Watch for enemy knight jumps that could hit two of your pieces at once.",
  pin: "Don't park a piece in front of your king or queen on an open line: it can get pinned.",
  skewer: "Keep your king, queen and rooks off the same line as an enemy bishop, rook or queen.",
  missed_material: "After your opponent moves, ask: did they leave anything hanging?",
  tactic: "Ask what your opponent's last move threatens before you make yours.",
  time_trouble: "Spend less time on easy moves early, so you have time when it gets sharp.",
  failed_to_convert: "When you're winning, trade pieces and keep it simple.",
};

/** Small stable hash, so the same move always gets the same line. */
function pick<T>(items: T[], seed: string): T {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return items[Math.abs(h) % items.length];
}

function fill(line: string, m: MoveReview): string | null {
  const d = m.details ?? {};
  const values: Record<string, string | undefined> = {
    piece: d.piece && PIECE_NAMES[d.piece],
    square: d.square,
    by: d.by && PIECE_NAMES[d.by],
    threat: d.threatSan,
    best: m.bestSan,
    mateIn: d.mateIn?.toString(),
    material: d.material?.toString(),
    targets: d.targets?.join(" and "),
    behind: d.behind && PIECE_NAMES[d.behind],
    sacrificed: m.sacrificed && PIECE_NAMES[m.sacrificed],
  };
  let missing = false;
  const text = line.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = values[key];
    if (!v) missing = true;
    return v ?? "";
  });
  return missing ? null : text;
}

/** Sir Blunderbuss's comment on one of your moves, or null when there's nothing special to say. */
export function mascotLine(m: MoveReview, seed: string): string | null {
  const kind =
    m.label === "brilliant" || m.label === "great" || m.label === "inaccuracy"
      ? m.label
      : m.label === "mistake" || m.label === "blunder"
        ? (m.type ?? "other")
        : null;
  if (!kind) return null;
  const lines = LINES[kind];
  const start = lines.indexOf(pick(lines, `${seed}-${m.ply}`));
  // Try the picked line first, then the others, until one has all its facts.
  for (let i = 0; i < lines.length; i++) {
    const text = fill(lines[(start + i) % lines.length], m);
    if (text) return m.timeTrouble ? `${text} (And with under 30 seconds on the clock: slow down earlier!)` : text;
  }
  return null;
}

/** A quick end-of-game verdict built from the counts, used until the AI coach answers. */
export function templateVerdict(review: GameReview, result: "win" | "loss" | "draw"): { summary: string; tip: string } {
  const { counts, mistakeTypes } = review;
  const errors = counts.blunder + counts.mistake;
  const top = (Object.entries(mistakeTypes) as [keyof typeof TIPS, number][])
    .filter(([type]) => type !== "other")
    .sort((a, b) => b[1] - a[1])[0];

  const opener =
    result === "win" ? "Victory for you!" : result === "draw" ? "A hard-fought draw." : "This one got away.";
  const body =
    errors === 0
      ? result === "loss"
        ? "No mistakes or blunders on your side: your opponent just played even better. Keep it up!"
        : "Not a single mistake or blunder: a clean game. Sir Blunderbuss is proud!"
      : `You made ${counts.blunder} blunder${counts.blunder === 1 ? "" : "s"} and ${counts.mistake} mistake${counts.mistake === 1 ? "" : "s"}` +
        (top ? `, mostly "${MISTAKE_NAMES[top[0]].toLowerCase()}".` : ".");
  const brag = counts.brilliant + counts.great > 0 ? " And you found some great moves too!" : "";
  const fail = review.failedToConvert ? " You were winning at one point, so the win was there!" : "";

  return {
    summary: `${opener} ${body}${brag}${fail} Accuracy: ${Math.round(review.accuracy)}%.`,
    tip: (top && TIPS[top[0]]) ?? "Keep doing the blunder check before every move: is everything safe?",
  };
}
