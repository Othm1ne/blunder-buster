// Cloudflare Pages Function: POST /api/plan
// Writes the weekly training plan with Gemini from the player's Blunder Profile numbers.
// Same rules as /api/coach: signed-in users only, key stays here, fallback model on rate limits.

import { cleanPlan, PLAN_THEMES, type PlanRequest, type PlanResponse, type WeeklyPlan } from "../../src/lib/planTypes";
import { askGemini, json, onOptions, readRequest, type Context } from "../../src/server/gemini";

const MAX_BODY_BYTES = 10_000;

const SYSTEM_PROMPT = `You are Sir Blunderbuss, a cheerful, slightly cheeky cartoon knight who coaches a beginner chess player.
You receive numbers from their "Blunder Profile" (computed by a chess engine over their recent games),
and you write their training plan for the next 7 days (Monday to Sunday).

Rules:
- Use ONLY the facts given. Never invent statistics. Quote 1-2 real numbers in "focus".
- Focus the whole week on their biggest weakness (the first mistake types, a bad opening habit, quick moves,
  time trouble or tilt), plus the rating goal if there is one.
- Each day takes 20-40 minutes. Kinds:
  "puzzles" = Puzzle Gym on one theme (set "theme" to one of: ${PLAN_THEMES.join(", ")}; only themes listed in puzzleThemes with count > 0),
  "play" = rapid games (10+5 or 15+10) with one thing to practise, "review" = review their latest games,
  "study" = a short lesson on a concept (explain it in the task, in 1-2 sentences), "rest" = a light day.
- Include at least 2 "puzzles" days, at least 2 "play" days, and 1 "review" day. At most 1 "rest" day.
- "title": max 6 words, fun. "focus": 2 sentences. "rule": ONE habit for every move this week, max 15 words.
- Day "title": max 5 words. Day "task": 1-2 short sentences a 600-rated player understands.
- Light humor is welcome, never mean. No emojis. No markdown.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    focus: { type: "STRING" },
    rule: { type: "STRING" },
    days: {
      type: "ARRAY",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "OBJECT",
        properties: {
          kind: { type: "STRING", enum: ["puzzles", "play", "review", "study", "rest"] },
          title: { type: "STRING" },
          task: { type: "STRING" },
          theme: { type: "STRING", enum: [...PLAN_THEMES] },
        },
        required: ["kind", "title", "task"],
      },
    },
  },
  required: ["title", "focus", "rule", "days"],
};

export const onRequestOptions = onOptions;

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  const body = await readRequest(request, env, MAX_BODY_BYTES);
  if (body instanceof Response) return body;
  const facts = body as PlanRequest;
  if (!Array.isArray(facts?.mistakes) || !Array.isArray(facts?.puzzleThemes)) return json(request, 400, { error: "Invalid request" });

  const result = await askGemini<WeeklyPlan>(request, env, {
    system: SYSTEM_PROMPT,
    input: facts,
    schema: RESPONSE_SCHEMA,
    isValid: (a) => cleanPlan(a) !== null,
  });
  if (result instanceof Response) return result;
  return json(request, 200, { ...cleanPlan(result.answer)!, model: result.model } satisfies PlanResponse);
};
