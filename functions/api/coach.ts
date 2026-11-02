// Cloudflare Pages Function: POST /api/coach
// Turns the engine's classified facts about a game into friendly coaching text with Gemini.
// The Gemini key lives only here (Cloudflare secret GEMINI_API_KEY), never in the browser.
// Only signed-in Blunder Buster users can call it: we verify their Firebase ID token.

import type { CoachRequest, CoachResponse } from "../../src/lib/coachTypes";
import { askGemini, json, onOptions, readRequest, type Context } from "../../src/server/gemini";

const MAX_BODY_BYTES = 20_000;
const MAX_MOVES = 15;

const SYSTEM_PROMPT = `You are Sir Blunderbuss, a cheerful, slightly cheeky cartoon knight who coaches a beginner chess player.
You receive facts from a chess engine's analysis of one of their games, and you turn them into short coaching.

Rules:
- Use ONLY the facts given. Never invent moves, squares, pieces, evaluations or variations.
- Write for a beginner (around the player's rating): plain words, explain any chess term you use.
- "winBefore"/"winAfter" are the player's winning chances in percent, before and after the move.
- For each move in "moves", write 1-2 short sentences: what happened, and the habit that avoids (or repeats) it.
  Name the moves exactly as given (e.g. "14... Nf6"). For brilliant/great moves, celebrate.
- "summary": 2-3 sentences telling the story of the game (how it was won or lost), encouraging but honest.
- "tip": ONE concrete habit for the next game, max 20 words.
- Light humor is welcome, never mean. No emojis. No markdown.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    tip: { type: "STRING" },
    moves: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { ply: { type: "INTEGER" }, text: { type: "STRING" } },
        required: ["ply", "text"],
      },
    },
  },
  required: ["summary", "tip", "moves"],
};

export const onRequestOptions = onOptions;

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  const body = await readRequest(request, env, MAX_BODY_BYTES);
  if (body instanceof Response) return body;
  const facts = body as CoachRequest;
  if (!Array.isArray(facts?.moves)) return json(request, 400, { error: "Invalid request" });
  facts.moves = facts.moves.slice(0, MAX_MOVES);

  type Answer = Omit<CoachResponse, "model">;
  const result = await askGemini<Answer>(request, env, {
    system: SYSTEM_PROMPT,
    input: facts,
    schema: RESPONSE_SCHEMA,
    isValid: (a) => typeof a.summary === "string" && typeof a.tip === "string" && Array.isArray(a.moves),
  });
  if (result instanceof Response) return result;
  return json(request, 200, { ...result.answer, model: result.model } satisfies CoachResponse);
};
