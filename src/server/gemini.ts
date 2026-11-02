// Shared by the Cloudflare Pages Functions in /functions (never imported by the Next app):
// CORS for local dev, Firebase sign-in check, and calling Gemini with a fallback model.
// It lives outside /functions because every file there becomes a route.

import { createRemoteJWKSet, jwtVerify } from "jose";

export interface Env {
  GEMINI_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  /** Optional overrides. */
  GEMINI_MODEL?: string;
  GEMINI_FALLBACK_MODEL?: string;
}

export type Context = { request: Request; env: Env };

const DEFAULT_MODEL = "gemini-3.8-flash";
// Used when the main model is rate-limited or down (Flash-Lite has higher free limits).
const DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash-lite";

const GOOGLE_KEYS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export function cors(request: Request): Record<string, string> {
  // Production calls come from the same origin (no CORS needed). Allow localhost for `npm run dev`.
  const origin = request.headers.get("Origin") ?? "";
  if (!/^http:\/\/localhost:\d+$/.test(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export function json(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(request) },
  });
}

export const onOptions = ({ request }: Context) => new Response(null, { status: 204, headers: cors(request) });

/** The signed-in Firebase user's id, or null. */
export async function verifyUser(request: Request, env: Env): Promise<string | null> {
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

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Ask<T> = {
  system: string;
  /** Sent as JSON. */
  input: unknown;
  schema: object;
  /** Throws (or returns false) when the answer doesn't have the expected shape. */
  isValid: (answer: T) => boolean;
  maxOutputTokens?: number;
};

async function askModel<T>(model: string, apiKey: string, ask: Ask<T>): Promise<T> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: ask.system }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(ask.input) }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: ask.maxOutputTokens ?? 2048,
        responseMimeType: "application/json",
        responseSchema: ask.schema,
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
  const parsed = JSON.parse(text) as T;
  if (!ask.isValid(parsed)) throw new GeminiError("Gemini returned an unexpected shape", 502);
  return parsed;
}

/**
 * Asks the main model, then the fallback one. Returns the answer and the model that gave it,
 * or a ready-made error Response (busy / failed) when both fail.
 */
export async function askGemini<T>(request: Request, env: Env, ask: Ask<T>): Promise<{ answer: T; model: string } | Response> {
  const models = [env.GEMINI_MODEL || DEFAULT_MODEL, env.GEMINI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL];
  let lastError: GeminiError | null = null;
  for (const model of models) {
    try {
      return { answer: await askModel(model, env.GEMINI_API_KEY, ask), model };
    } catch (e) {
      lastError = e instanceof GeminiError ? e : new GeminiError(String(e), 502);
      // Only fall back on rate limits / server errors / bad output; a 400 means our request is wrong.
      if (lastError.status === 400 || lastError.status === 403) break;
    }
  }
  console.error(lastError?.message);
  return json(request, lastError?.status === 429 ? 429 : 502, { error: "The coach is busy right now. Try again later." });
}

/** Common checks for a POST: configured, signed in, small JSON body. Returns the body or an error Response. */
export async function readRequest(request: Request, env: Env, maxBytes: number): Promise<unknown | Response> {
  if (!env.GEMINI_API_KEY || !env.FIREBASE_PROJECT_ID) return json(request, 500, { error: "Coach is not configured" });
  if (!(await verifyUser(request, env))) return json(request, 401, { error: "Sign in first" });
  const raw = await request.text();
  if (raw.length > maxBytes) return json(request, 413, { error: "Request too large" });
  try {
    return JSON.parse(raw);
  } catch {
    return json(request, 400, { error: "Invalid request" });
  }
}
