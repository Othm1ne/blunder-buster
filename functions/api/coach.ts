// Cloudflare Pages Function: POST /api/coach
// Turns the engine's classified facts about a game into friendly coaching text with Gemini.
// The Gemini key lives only here (Cloudflare secret GEMINI_API_KEY), never in the browser.
// Only signed-in Blunder Buster users can call it: we verify their Firebase ID token.

import { createRemoteJWKSet, jwtVerify } from "jose";
import type { CoachRequest, CoachResponse } from "../../src/lib/coachTypes";

interface Env {
  GEMINI_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  /** Optional overrides. */
  GEMINI_MODEL?: string;
  GEMINI_FALLBACK_MODEL?: string;
}

type Context = { request: Request; env: Env };

const DEFAULT_MODEL = "gemini-3.8-flash";
// Used when the main model is rate-limited or down (Flash-Lite has higher free limits).
const DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash-lite";
const MAX_BODY_BYTES = 20_000;
const MAX_MOVES = 15;

const GOOGLE_KEYS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

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

function cors(request: Request): Record<string, string> {
  // Production calls come from the same origin (no CORS needed). Allow localhost for `npm run dev`.
  const origin = request.headers.get("Origin") ?? "";
  if (!/^http:\/\/localhost:\d+$/.test(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(request) },
  });
}

async function verifyUser(request: Request, env: Env): Promise<string | null> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, GOOGLE_KEYS, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function askGemini(model: string, apiKey: string, facts: CoachRequest): Promise<Omit<CoachResponse, "model">> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(facts) }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });
  if (!res.ok) throw new GeminiError(`Gemini ${model} answered ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);

  type Part = { text?: string; thought?: boolean };
  const data = (await res.json()) as { candidates?: { content?: { parts?: Part[] } }[] };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought && p.text)
    .map((p) => p.text)
    .join("")
    .replace(/^```(json)?\s*|\s*```$/g, "");
  const parsed = JSON.parse(text) as Omit<CoachResponse, "model">;
  if (typeof parsed.summary !== "string" || typeof parsed.tip !== "string" || !Array.isArray(parsed.moves)) {
    throw new GeminiError("Gemini returned an unexpected shape", 502);
  }
  return parsed;
}

export const onRequestOptions = ({ request }: Context) => new Response(null, { status: 204, headers: cors(request) });

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  if (!env.GEMINI_API_KEY || !env.FIREBASE_PROJECT_ID) return json(request, 500, { error: "Coach is not configured" });

  const uid = await verifyUser(request, env);
  if (!uid) return json(request, 401, { error: "Sign in first" });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(request, 413, { error: "Request too large" });

  let facts: CoachRequest;
  try {
    facts = JSON.parse(raw) as CoachRequest;
    if (!Array.isArray(facts.moves)) throw new Error();
  } catch {
    return json(request, 400, { error: "Invalid request" });
  }
  facts.moves = facts.moves.slice(0, MAX_MOVES);

  const models = [env.GEMINI_MODEL || DEFAULT_MODEL, env.GEMINI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL];
  let lastError: GeminiError | null = null;
  for (const model of models) {
    try {
      const answer = await askGemini(model, env.GEMINI_API_KEY, facts);
      return json(request, 200, { ...answer, model } satisfies CoachResponse);
    } catch (e) {
      lastError = e instanceof GeminiError ? e : new GeminiError(String(e), 502);
      // Only fall back on rate limits / server errors / bad output; a 400 means our request is wrong.
      if (lastError.status === 400 || lastError.status === 403) break;
    }
  }
  console.error(lastError?.message);
  return json(request, lastError?.status === 429 ? 429 : 502, { error: "The coach is busy right now. Try again later." });
};
