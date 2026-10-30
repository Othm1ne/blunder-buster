// Thin wrapper around Stockfish running in a Web Worker (UCI protocol over postMessage).
// Browser-only: create it from client code, never during the static build.

const ENGINE_URL = "/stockfish/stockfish-19-lite-single.js";

/** Evaluation from White's point of view. */
export type EngineEval = {
  /** Centipawns for White. Mates are mapped to ±(10000 - 10 × moves) so they still sort correctly. */
  cp: number;
  /** Moves to mate: > 0 White mates, < 0 Black mates, 0 = the side to move is already checkmated. */
  mate?: number;
  /** Best move in UCI notation (e.g. "e2e4"); missing when the game is over. */
  best?: string;
  /** First moves of the main line, space-separated UCI. */
  pv?: string;
};

export const MATE_CP = 10000;
const PV_MOVES = 6;

export function mateToCp(mate: number): number {
  return mate > 0 ? MATE_CP - mate * 10 : -MATE_CP - mate * 10;
}

export class Engine {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private failed: Error | null = null;

  constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.worker.onmessage = (e) => {
      for (const line of String(e.data).split("\n")) for (const l of this.listeners) l(line);
    };
    this.worker.onerror = (e) => {
      this.failed = new Error(`Stockfish crashed: ${e.message || "unknown error"}`);
      for (const l of this.listeners) l("__error__");
    };
    this.queue = this.run(["uci", "isready"], (line) => line === "readyok");
  }

  /** Sends commands and resolves once `isDone` sees the line that ends the exchange. */
  private run(commands: string[], isDone: (line: string) => boolean, onLine?: (line: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.failed) return reject(this.failed);
      const listener = (line: string) => {
        if (line === "__error__") {
          this.listeners.delete(listener);
          return reject(this.failed);
        }
        onLine?.(line);
        if (isDone(line)) {
          this.listeners.delete(listener);
          resolve();
        }
      };
      this.listeners.add(listener);
      for (const c of commands) this.worker.postMessage(c);
    });
  }

  /** Evaluates one position. Calls are queued, so it's safe to fire many at once. */
  evaluate(fen: string, depth: number, maxMs: number): Promise<EngineEval> {
    const job = this.queue.then(() => this.search(fen, depth, maxMs));
    this.queue = job.catch(() => undefined);
    return job;
  }

  private async search(fen: string, depth: number, maxMs: number): Promise<EngineEval> {
    const whiteToMove = fen.split(" ")[1] === "w";
    const sign = whiteToMove ? 1 : -1;
    let score: { cp?: number; mate?: number } = {};
    let pv: string[] = [];
    let best: string | undefined;

    await this.run(
      [`position fen ${fen}`, `go depth ${depth} movetime ${maxMs}`],
      (line) => line.startsWith("bestmove"),
      (line) => {
        if (line.startsWith("bestmove")) {
          const move = line.split(" ")[1];
          best = move && move !== "(none)" ? move : undefined;
          return;
        }
        // Skip partial results ("lowerbound"/"upperbound") from aspiration windows.
        if (!line.startsWith("info") || / (lower|upper)bound/.test(line)) return;
        const m = line.match(/ score (cp|mate) (-?\d+)/);
        if (!m) return;
        score = m[1] === "cp" ? { cp: Number(m[2]) } : { mate: Number(m[2]) };
        const pvMatch = line.match(/ pv (.+)$/);
        if (pvMatch) pv = pvMatch[1].trim().split(" ").slice(0, PV_MOVES);
      },
    );

    const result: EngineEval = { cp: 0 };
    if (score.mate !== undefined) {
      if (score.mate === 0) {
        // Side to move is checkmated.
        result.mate = 0;
        result.cp = whiteToMove ? -MATE_CP : MATE_CP;
      } else {
        result.mate = score.mate * sign;
        result.cp = mateToCp(result.mate);
      }
    } else {
      result.cp = (score.cp ?? 0) * sign;
    }
    // Firestore rejects `undefined`, so only set fields that exist.
    if (best) result.best = best;
    if (pv.length) result.pv = pv.join(" ");
    return result;
  }

  terminate() {
    this.worker.terminate();
  }
}

let shared: Engine | null = null;

/** One engine for the whole app (loading the WASM takes a moment). */
export function getEngine(): Engine {
  shared ??= new Engine();
  return shared;
}
